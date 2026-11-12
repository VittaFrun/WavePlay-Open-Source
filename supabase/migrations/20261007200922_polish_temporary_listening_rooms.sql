-- Room data is leased and disposable; original music and accounts are untouched.
alter table public.listening_rooms alter column expires_at set default (now()+interval '10 minutes');
alter table public.listening_rooms add column host_observed_at timestamptz,
 add column host_track_id uuid, add column host_position double precision,
 add column host_player_state text;
alter table public.listening_room_members add column avatar_url text check(avatar_url is null or (length(avatar_url)<=2048 and avatar_url like 'https://%'));
create policy "members update own presentation" on public.listening_room_members for update to authenticated
 using(user_id=auth.uid() and private.active_room_member(room_id))
 with check(user_id=auth.uid() and private.active_room_member(room_id));
create function public.set_room_avatar(target_room uuid,avatar_url text) returns void
 language sql security invoker set search_path='' as $$
 update public.listening_room_members set avatar_url=set_room_avatar.avatar_url where room_id=target_room and user_id=auth.uid(); $$;
create function public.heartbeat_listening_room(target_room uuid,observed_track uuid default null,
 observed_position double precision default 0,player_state text default 'idle') returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if not private.active_room_host(target_room) then raise exception 'La sala ya no está disponible.'; end if;
 if player_state not in ('playing','paused','buffering','ended','idle','interrupted') or observed_position<0
 or observed_position in ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8) then raise exception 'Estado inválido.'; end if;
 update public.listening_rooms set expires_at=clock_timestamp()+interval '10 minutes',host_observed_at=clock_timestamp(),
 host_track_id=observed_track,host_position=observed_position,host_player_state=player_state where id=target_room;
end; $$;
create function public.control_room_playback_v2(target_room uuid,song_id uuid,seconds double precision,
 is_playing boolean,expected_revision bigint,transition_reason text default 'command') returns public.listening_room_playback
 language plpgsql security invoker set search_path='' as $$
declare state public.listening_room_playback; previous_id uuid; song_duration double precision;
begin
 if not private.active_room_controller(target_room) then raise exception 'El anfitrión controla la reproducción.'; end if;
 if transition_reason not in ('command','skip','ended','restart','drift') then raise exception 'Transición inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_room::text,0));
 select * into state from public.listening_room_playback where room_id=target_room for update;
 if state.revision is distinct from expected_revision then raise exception 'ROOM_STATE_CHANGED'; end if;
 if seconds is null or seconds<0 or seconds in ('Infinity'::float8,'NaN'::float8,'-Infinity'::float8) then raise exception 'Posición inválida.'; end if;
 previous_id:=state.track_id;
 if song_id is not null then
 select duration into song_duration from public.listening_room_queue where id=song_id and room_id=target_room and status='ready';
 if song_duration is null then raise exception 'La canción todavía no está disponible.'; end if;
 end if;
 update public.listening_room_playback set track_id=song_id,position_seconds=least(seconds,coalesce(song_duration,0)),
 playing=is_playing and song_id is not null,revision=revision+1,updated_at=clock_timestamp()
 where room_id=target_room returning * into state;
 if previous_id is not null and previous_id is distinct from song_id then
 update public.listening_room_queue set status='removed' where id=previous_id and room_id=target_room;
 end if;
 return state;
end; $$;
-- Compatibility for already installed versions, with the same atomic retirement.
create or replace function public.control_room_playback(target_room uuid,song_id uuid,seconds double precision,
 is_playing boolean,expected_revision bigint) returns public.listening_room_playback
 language sql security invoker set search_path='' as $$
 select public.control_room_playback_v2(target_room,song_id,seconds,is_playing,expected_revision,'command'); $$;
revoke all on function public.set_room_avatar(uuid,text),public.heartbeat_listening_room(uuid,uuid,double precision,text),
 public.control_room_playback_v2(uuid,uuid,double precision,boolean,bigint,text) from public,anon;
grant execute on function public.set_room_avatar(uuid,text),public.heartbeat_listening_room(uuid,uuid,double precision,text),
 public.control_room_playback_v2(uuid,uuid,double precision,boolean,bigint,text) to authenticated;
-- Privileged maintenance is internal and never callable by app users.
create function private.advance_finished_rooms() returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; state public.listening_room_playback; next_id uuid; advanced integer:=0;
begin
 for candidate in select r.id,p.revision,p.track_id from public.listening_rooms r
 join public.listening_room_playback p on p.room_id=r.id join public.listening_room_queue q on q.id=p.track_id
 where r.status='active' and r.expires_at>now() and p.playing and q.duration>0
 and r.host_track_id=p.track_id and r.host_observed_at>now()-interval '45 seconds'
 and (r.host_player_state='ended' or (r.host_player_state='playing'
 and r.host_position+extract(epoch from now()-r.host_observed_at)>=q.duration+5
 and p.position_seconds+extract(epoch from now()-p.updated_at)>=q.duration+5)) limit 100 loop
 perform pg_advisory_xact_lock(hashtextextended(candidate.id::text,0));
 select * into state from public.listening_room_playback where room_id=candidate.id for update;
 if state.revision<>candidate.revision or state.track_id is distinct from candidate.track_id or not state.playing then continue; end if;
 select id into next_id from public.listening_room_queue where room_id=candidate.id and status='ready'
 and position>(select position from public.listening_room_queue where id=state.track_id) order by position,created_at,id limit 1;
 update public.listening_room_playback set track_id=next_id,position_seconds=0,playing=next_id is not null,
 revision=revision+1,updated_at=clock_timestamp() where room_id=candidate.id;
 update public.listening_room_queue set status='removed' where id=state.track_id;
 advanced:=advanced+1;
 end loop; return advanced;
end; $$;
revoke all on function private.advance_finished_rooms() from public,anon,authenticated;
select cron.schedule('waveplay-room-advance','* * * * *','select private.advance_finished_rooms()');
-- One cleanup worker at a time, with bounded recovery if a worker dies.
create table private.room_cleanup_lease(id boolean primary key default true check(id),lease_until timestamptz not null);
insert into private.room_cleanup_lease values(true,'epoch');
grant usage on schema private to service_role;
grant select,update on private.room_cleanup_lease to service_role;
create function public.claim_room_cleanup(release_lease boolean default false) returns boolean
 language sql security invoker set search_path='' as $$
 with claimed as (update private.room_cleanup_lease set lease_until=case when release_lease then 'epoch'::timestamptz else now()+interval '5 minutes' end
 where id and (release_lease or lease_until<now()) returning id) select exists(select 1 from claimed); $$;
revoke all on function public.claim_room_cleanup(boolean) from public,anon,authenticated;
grant execute on function public.claim_room_cleanup(boolean) to service_role;
-- Keep existing active rooms available briefly while clients upgrade; later renewal is host-only.
update public.listening_rooms set expires_at=least(expires_at,now()+interval '10 minutes') where status='active';
select cron.alter_job((select jobid from cron.job where jobname='waveplay-room-audio-cleanup'),schedule:='* * * * *');

create function public.orphan_room_audio() returns table(path text) language sql security invoker set search_path='' as $$
 select o.name from storage.objects o where o.bucket_id='room-audio' and o.created_at<now()-interval '1 hour'
 and not exists(select 1 from public.listening_room_queue q where q.source='file' and q.object_path=o.name)
 order by o.created_at limit 100; $$;
revoke all on function public.orphan_room_audio() from public,anon,authenticated;
grant execute on function public.orphan_room_audio() to service_role;
