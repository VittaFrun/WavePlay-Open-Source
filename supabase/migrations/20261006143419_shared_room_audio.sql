-- Audio belongs to a room; metadata is reserved before an upload is allowed.
create table public.listening_room_queue (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.listening_rooms(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  added_by_name text not null check (char_length(added_by_name) between 1 and 60),
  title text not null check (char_length(title) between 1 and 300),
  artist text not null check (char_length(artist) <= 300),
  duration double precision not null check (duration > 0 and duration <= 3600),
  filename text not null check (char_length(filename) <= 300),
  object_path text not null unique,
  artwork_path text,
  file_size bigint not null check (file_size between 1 and 20971520),
  status text not null default 'uploading' check (status in ('uploading','ready','error','removed')),
  position bigint not null,
  created_at timestamptz not null default now()
);
create index listening_room_queue_room_position on public.listening_room_queue(room_id, position);
create index listening_room_members_user on public.listening_room_members(user_id);
create function private.validate_room_song() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 perform pg_advisory_xact_lock(hashtextextended(new.room_id::text,0));
 if (select count(*) from public.listening_room_queue where room_id=new.room_id and status<>'removed')>=50
 or (select coalesce(sum(file_size),0) from public.listening_room_queue where room_id=new.room_id and status<>'removed')+new.file_size>524288000
 then raise exception 'La sala alcanzó su límite de canciones o espacio.'; end if;
 elsif new.status='ready' and old.status<>'ready' then
 if not exists(select 1 from storage.objects where bucket_id='room-audio' and name=new.object_path
 and (metadata->>'size')::bigint=new.file_size)
 then raise exception 'El audio no terminó de subir correctamente.'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.validate_room_song() from public,anon,authenticated;
create trigger validate_room_song before insert or update on public.listening_room_queue
for each row execute function private.validate_room_song();
create table public.listening_room_playback (
  room_id uuid primary key references public.listening_rooms(id) on delete cascade,
  track_id uuid references public.listening_room_queue(id) on delete set null,
  position_seconds double precision not null default 0 check (position_seconds >= 0),
  playing boolean not null default false,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.listening_room_playback(room_id) select id from public.listening_rooms;
create function private.initialize_room_playback() returns trigger
language plpgsql security definer set search_path = '' as $$
begin insert into public.listening_room_playback(room_id) values(new.id); return new; end;
$$;
revoke all on function private.initialize_room_playback() from public, anon, authenticated;
create trigger initialize_room_playback after insert on public.listening_rooms
for each row execute function private.initialize_room_playback();

create function private.active_room_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.listening_rooms r
 join public.listening_room_members m on m.room_id=r.id
 where r.id=target and m.user_id=auth.uid() and r.status='active' and r.expires_at>now());
$$;
create function private.active_room_host(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.listening_rooms r
 where r.id=target and r.host_user_id=auth.uid() and r.status='active' and r.expires_at>now());
$$;
revoke all on function private.active_room_member(uuid),private.active_room_host(uuid) from public,anon;
grant execute on function private.active_room_member(uuid),private.active_room_host(uuid) to authenticated;

alter table public.listening_room_queue enable row level security;
alter table public.listening_room_playback enable row level security;
grant select,insert on public.listening_room_queue to authenticated;
grant select,update on public.listening_room_playback to authenticated;
grant update(status,position) on public.listening_room_queue to authenticated;
create policy "members read shared queue" on public.listening_room_queue for select to authenticated
using(private.is_listening_room_member('room:'||room_id::text));
create policy "members reserve their own uploads" on public.listening_room_queue for insert to authenticated
with check(private.active_room_member(room_id) and added_by=(select auth.uid())
 and object_path=room_id::text||'/'||added_by::text||'/'||id::text||'.audio'
 and artwork_path is null and status='uploading');
create policy "owners and hosts manage queue" on public.listening_room_queue for update to authenticated
using(private.active_room_member(room_id) and (added_by=(select auth.uid()) or private.active_room_host(room_id)))
with check(private.active_room_member(room_id) and (added_by=(select auth.uid()) or private.active_room_host(room_id)));
create policy "members read playback" on public.listening_room_playback for select to authenticated
using(private.is_listening_room_member('room:'||room_id::text));
create policy "host controls playback" on public.listening_room_playback for update to authenticated
using(private.active_room_host(room_id)) with check(private.active_room_host(room_id));

-- These invoker RPCs keep authorization in the table policies.
create function public.reserve_room_song(target_room uuid,song_title text,song_artist text,
 song_duration double precision,song_filename text,song_size bigint,member_name text)
returns public.listening_room_queue language plpgsql security invoker set search_path='' as $$
declare item public.listening_room_queue; item_id uuid:=gen_random_uuid(); next_position bigint;
begin
 if not private.active_room_member(target_room) then raise exception 'La sala ya no está disponible.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_room::text,0));
 if (select count(*) from public.listening_room_queue where room_id=target_room and status<>'removed')>=50
 then raise exception 'La sala admite hasta 50 canciones.'; end if;
 select coalesce(max(position),0)+1 into next_position from public.listening_room_queue where room_id=target_room;
 insert into public.listening_room_queue(id,room_id,added_by,added_by_name,title,artist,duration,filename,object_path,file_size,position)
 values(item_id,target_room,auth.uid(),left(member_name,60),left(song_title,300),left(song_artist,300),
 song_duration,left(song_filename,300),target_room::text||'/'||auth.uid()::text||'/'||item_id::text||'.audio',song_size,next_position)
 returning * into item; return item;
end; $$;
create function public.set_room_playback(target_room uuid,song_id uuid,seconds double precision,is_playing boolean)
returns public.listening_room_playback language plpgsql security invoker set search_path='' as $$
declare state public.listening_room_playback; song_duration double precision;
begin
 if not private.active_room_host(target_room) then raise exception 'Solo el anfitrión controla la reproducción.'; end if;
 if seconds is null or seconds<0 or seconds='Infinity'::float8 or seconds='NaN'::float8 then raise exception 'Posición inválida.'; end if;
 if song_id is not null then
 select duration into song_duration from public.listening_room_queue where id=song_id and room_id=target_room and status='ready';
 if song_duration is null then raise exception 'La canción todavía no está disponible.'; end if;
 end if;
 update public.listening_room_playback set track_id=song_id,position_seconds=least(seconds,coalesce(song_duration,0)),
 playing=is_playing and song_id is not null,revision=revision+1,updated_at=clock_timestamp()
 where room_id=target_room returning * into state; return state;
end; $$;
create function public.get_room_snapshot(target_room uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('room',to_jsonb(r),'queue',
 coalesce((select jsonb_agg(q order by q.position,q.id) from public.listening_room_queue q where q.room_id=r.id and q.status<>'removed'),'[]'::jsonb),
 'playback',to_jsonb(p),'server_now',extract(epoch from clock_timestamp())*1000)
 from public.listening_rooms r join public.listening_room_playback p on p.room_id=r.id where r.id=target_room;
$$;
create function public.reorder_room_queue(target_room uuid,song_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not private.active_room_host(target_room) then raise exception 'Solo el anfitrión ordena la cola.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_room::text,0));
 if cardinality(song_ids)<>(select count(*) from public.listening_room_queue where room_id=target_room and status<>'removed')
 or cardinality(song_ids)<>(select count(distinct id) from unnest(song_ids) id)
 or exists(select 1 from unnest(song_ids) id where not exists(select 1 from public.listening_room_queue q where q.id=id and q.room_id=target_room and q.status<>'removed'))
 then raise exception 'La cola cambió; vuelve a intentarlo.'; end if;
 update public.listening_room_queue q set position=ordered.n from unnest(song_ids) with ordinality ordered(id,n)
 where q.room_id=target_room and q.id=ordered.id;
end; $$;
revoke all on function public.reserve_room_song(uuid,text,text,double precision,text,bigint,text),
 public.set_room_playback(uuid,uuid,double precision,boolean),public.get_room_snapshot(uuid),public.reorder_room_queue(uuid,uuid[]) from public,anon;
grant execute on function public.reserve_room_song(uuid,text,text,double precision,text,bigint,text),
 public.set_room_playback(uuid,uuid,double precision,boolean),public.get_room_snapshot(uuid),public.reorder_room_queue(uuid,uuid[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('room-audio','room-audio',false,20971520,array['audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/wav','audio/x-wav','application/octet-stream']);
create function private.can_access_room_audio(path text,upload boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listening_room_queue q
 where q.object_path=path and private.active_room_member(q.room_id)
 and (case when upload then q.added_by=auth.uid() and q.status='uploading' else q.status='ready' end));
$$;
revoke all on function private.can_access_room_audio(text,boolean) from public,anon;
grant execute on function private.can_access_room_audio(text,boolean) to authenticated;
create policy "room participants upload reserved audio" on storage.objects for insert to authenticated
with check(bucket_id='room-audio' and private.can_access_room_audio(name,true));
create policy "room participants hear available audio" on storage.objects for select to authenticated
using(bucket_id='room-audio' and private.can_access_room_audio(name,false));
create policy "owners remove failed uploads" on storage.objects for delete to authenticated
using(bucket_id='room-audio' and private.can_access_room_audio(name,true));

alter publication supabase_realtime add table public.listening_room_queue,public.listening_room_playback,public.listening_rooms;

-- Cleanup is authenticated with a server-only secret; it never accepts file paths from a client.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'room_audio_cleanup_secret');
create function public.authorize_room_audio_cleanup(token text) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='room_audio_cleanup_secret' and decrypted_secret=token);
$$;
revoke all on function public.authorize_room_audio_cleanup(text) from public,anon,authenticated;
grant execute on function public.authorize_room_audio_cleanup(text) to service_role;
select cron.schedule('waveplay-room-audio-cleanup','*/15 * * * *',$job$
 select net.http_post(
 url:='https://tu-proyecto.supabase.co/functions/v1/room-audio-cleanup',
 headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-secret',
 (select decrypted_secret from vault.decrypted_secrets where name='room_audio_cleanup_secret')),
 body:='{}'::jsonb);
$job$);
