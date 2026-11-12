-- Existing rooms remain host controlled; existing audio paths and quotas stay intact.
alter table public.listening_rooms add column control_mode text not null default 'host'
 check (control_mode in ('host','collaborative'));
alter table public.listening_room_queue add column source text not null default 'file'
 check (source in ('file','youtube'));
alter table public.listening_room_queue add column youtube_id text;
alter table public.listening_room_queue drop constraint listening_room_queue_file_size_check;
alter table public.listening_room_queue add constraint listening_room_queue_source_metadata_check check (
 (source='file' and youtube_id is null and file_size between 1 and 20971520) or
 (source='youtube' and youtube_id ~ '^[A-Za-z0-9_-]{11}$' and youtube_id is not null and file_size=0
 and object_path='youtube/'||room_id::text||'/'||id::text and status<>'uploading'));

-- Private helper avoids recursive RLS. Only authenticated active members can control.
create function private.active_room_controller(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listening_rooms r
 join public.listening_room_members m on m.room_id=r.id and m.user_id=auth.uid()
 where r.id=target and r.status='active' and r.expires_at>now()
 and (r.host_user_id=auth.uid() or r.control_mode='collaborative'));
$$;
revoke all on function private.active_room_controller(uuid) from public,anon;
grant execute on function private.active_room_controller(uuid) to authenticated;

alter policy "members reserve their own uploads" on public.listening_room_queue with check
 (private.active_room_member(room_id) and added_by=(select auth.uid()) and source='file'
 and object_path=room_id::text||'/'||added_by::text||'/'||id::text||'.audio'
 and artwork_path is null and status='uploading');
create policy "members add youtube videos" on public.listening_room_queue for insert to authenticated
 with check(private.active_room_member(room_id) and added_by=(select auth.uid())
 and source='youtube' and status='ready' and artwork_path is null);
alter policy "owners and hosts manage queue" on public.listening_room_queue
 using(private.active_room_member(room_id) and (added_by=(select auth.uid()) or private.active_room_controller(room_id)))
 with check(private.active_room_member(room_id) and (added_by=(select auth.uid()) or private.active_room_controller(room_id)));
alter policy "host controls playback" on public.listening_room_playback
 using(private.active_room_controller(room_id)) with check(private.active_room_controller(room_id));

create or replace function private.validate_room_song() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 perform pg_advisory_xact_lock(hashtextextended(new.room_id::text,0));
 if (select count(*) from public.listening_room_queue where room_id=new.room_id and status<>'removed')>=50
 or (select coalesce(sum(file_size),0) from public.listening_room_queue where room_id=new.room_id and status<>'removed')+new.file_size>524288000
 then raise exception 'La sala alcanzó su límite de canciones o espacio.'; end if;
 select coalesce(max(position),0)+1 into new.position from public.listening_room_queue where room_id=new.room_id;
 else
 if new.position<>old.position and not private.active_room_controller(new.room_id)
 then raise exception 'No tienes permiso para ordenar la cola.'; end if;
 if new.status='removed' and exists(select 1 from public.listening_room_playback where room_id=new.room_id and track_id=old.id)
 then raise exception 'Cambia de canción antes de quitar la que está sonando.'; end if;
 if new.source='file' and new.status='ready' and old.status<>'ready' and not exists(
 select 1 from storage.objects where bucket_id='room-audio' and name=new.object_path and (metadata->>'size')::bigint=new.file_size)
 then raise exception 'El audio no terminó de subir correctamente.'; end if;
 end if;
 return new;
end; $$;

create function public.add_room_youtube(target_room uuid,video_id text,song_title text,song_artist text,
 song_duration double precision,member_name text) returns public.listening_room_queue
language plpgsql security invoker set search_path='' as $$
declare item public.listening_room_queue; item_id uuid:=gen_random_uuid();
begin
 if not private.active_room_member(target_room) then raise exception 'La sala ya no está disponible.'; end if;
 insert into public.listening_room_queue(id,room_id,added_by,added_by_name,title,artist,duration,filename,object_path,file_size,status,position,source,youtube_id)
 values(item_id,target_room,auth.uid(),left(member_name,60),left(song_title,300),left(song_artist,300),song_duration,'',
 'youtube/'||target_room::text||'/'||item_id::text,0,'ready',0,'youtube',video_id) returning * into item;
 return item;
end; $$;

-- Row lock + revision comparison prevent simultaneous commands from overwriting newer intent.
create function public.control_room_playback(target_room uuid,song_id uuid,seconds double precision,
 is_playing boolean,expected_revision bigint) returns public.listening_room_playback
language plpgsql security invoker set search_path='' as $$
declare state public.listening_room_playback; song_duration double precision;
begin
 if not private.active_room_controller(target_room) then raise exception 'El anfitrión controla la reproducción.'; end if;
 select * into state from public.listening_room_playback where room_id=target_room for update;
 if state.revision is distinct from expected_revision then raise exception 'ROOM_STATE_CHANGED'; end if;
 if seconds is null or seconds<0 or seconds='Infinity'::float8 or seconds='NaN'::float8 then raise exception 'Posición inválida.'; end if;
 if song_id is not null then
 select duration into song_duration from public.listening_room_queue where id=song_id and room_id=target_room and status='ready';
 if song_duration is null then raise exception 'La canción todavía no está disponible.'; end if;
 end if;
 update public.listening_room_playback set track_id=song_id,position_seconds=least(seconds,coalesce(song_duration,0)),
 playing=is_playing and song_id is not null,revision=revision+1,updated_at=clock_timestamp()
 where room_id=target_room returning * into state; return state;
end; $$;

create or replace function public.reorder_room_queue(target_room uuid,song_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not private.active_room_controller(target_room) then raise exception 'No tienes permiso para ordenar la cola.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_room::text,0));
 if cardinality(song_ids)<>(select count(*) from public.listening_room_queue where room_id=target_room and status<>'removed')
 or cardinality(song_ids)<>(select count(distinct id) from unnest(song_ids) id)
 or exists(select 1 from unnest(song_ids) id where not exists(select 1 from public.listening_room_queue q where q.id=id and q.room_id=target_room and q.status<>'removed'))
 then raise exception 'La cola cambió; vuelve a intentarlo.'; end if;
 update public.listening_room_queue q set position=ordered.n from unnest(song_ids) with ordinality ordered(id,n)
 where q.room_id=target_room and q.id=ordered.id;
end; $$;
revoke all on function public.add_room_youtube(uuid,text,text,text,double precision,text),
 public.control_room_playback(uuid,uuid,double precision,boolean,bigint) from public,anon;
grant execute on function public.add_room_youtube(uuid,text,text,text,double precision,text),
 public.control_room_playback(uuid,uuid,double precision,boolean,bigint) to authenticated;
