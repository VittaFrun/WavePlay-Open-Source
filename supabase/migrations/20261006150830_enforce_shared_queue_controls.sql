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
 if new.position<>old.position and not private.active_room_host(new.room_id)
 then raise exception 'Solo el anfitrión ordena la cola.'; end if;
 if new.status='removed' and exists(select 1 from public.listening_room_playback where room_id=new.room_id and track_id=old.id)
 then raise exception 'Cambia de canción antes de quitar la que está sonando.'; end if;
 if new.status='ready' and old.status<>'ready' and not exists(
 select 1 from storage.objects where bucket_id='room-audio' and name=new.object_path and (metadata->>'size')::bigint=new.file_size)
 then raise exception 'El audio no terminó de subir correctamente.'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.validate_room_song() from public,anon,authenticated;
