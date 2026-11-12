-- A late ended observation must never advance a song that was just restarted.
create function private.invalidate_room_observation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.listening_rooms set host_observed_at=null,host_player_state=null
 where id=new.room_id;
 return new;
end; $$;
revoke all on function private.invalidate_room_observation() from public,anon,authenticated;
create trigger invalidate_room_observation after update on public.listening_room_playback
for each row when (old.revision is distinct from new.revision)
execute function private.invalidate_room_observation();
