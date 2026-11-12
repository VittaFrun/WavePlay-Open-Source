-- Everything, including temporary test rooms, rolls back.

begin;

select set_config('waveplay.test.host',(select id::text from auth.users order by created_at limit 1),true);

select set_config('waveplay.test.guest',(select id::text from auth.users order by created_at offset 1 limit 1),true);

set local role authenticated;

do $$

declare room public.listening_rooms; a public.listening_room_queue; b public.listening_room_queue; state public.listening_room_playback;

 host_id text:=current_setting('waveplay.test.host'); guest_id text:=current_setting('waveplay.test.guest'); denied boolean:=false; revision_before bigint;

begin

 perform set_config('request.jwt.claim.sub',host_id,true);

 room:=public.create_listening_room('WavePlay prueba temporal','Anfitrión prueba');

 if room.expires_at>now()+interval '11 minutes' then raise exception 'Lease incorrect'; end if;

 a:=public.add_room_youtube(room.id,'abcdefghijk','Primera','Prueba',20,'Anfitrión prueba');

 b:=public.add_room_youtube(room.id,'lmnopqrstuv','Segunda','Prueba',20,'Anfitrión prueba');

 state:=public.control_room_playback_v2(room.id,a.id,0,true,0,'command');

 revision_before:=state.revision;

 perform public.heartbeat_listening_room(room.id,a.id,2,'playing');

 if (select revision from public.listening_room_playback where room_id=room.id)<>revision_before then raise exception 'Heartbeat changed playback'; end if;

 perform public.set_room_avatar(room.id,'https://example.com/avatar.png');

 perform set_config('request.jwt.claim.sub',guest_id,true);

 perform public.join_listening_room(room.invite_code,'Invitado prueba');

 begin perform public.heartbeat_listening_room(room.id); exception when others then denied:=true; end;

 if not denied then raise exception 'Guest renewed lease'; end if;

 denied:=false;

 begin perform public.control_room_playback_v2(room.id,b.id,0,true,state.revision,'skip'); exception when others then denied:=true; end;

 if not denied then raise exception 'Guest bypassed host control'; end if;

 perform set_config('request.jwt.claim.sub',host_id,true);

 update public.listening_rooms set control_mode='collaborative' where id=room.id;

 perform set_config('request.jwt.claim.sub',guest_id,true);

 state:=public.control_room_playback_v2(room.id,b.id,0,true,state.revision,'skip');

 if (select status from public.listening_room_queue where id=a.id)<>'removed' then raise exception 'Skipped song remained'; end if;

 denied:=false;

 begin perform public.control_room_playback_v2(room.id,b.id,0,false,state.revision-1,'command'); exception when others then denied:=true; end;

 if not denied then raise exception 'Stale command accepted'; end if;

 state:=public.control_room_playback_v2(room.id,b.id,0,true,state.revision,'restart');

 if (select status from public.listening_room_queue where id=b.id)<>'ready' then raise exception 'Restart removed current song'; end if;

 state:=public.control_room_playback_v2(room.id,null,0,false,state.revision,'ended');

 if state.track_id is not null or state.playing then raise exception 'Final song remained active'; end if;

 if exists(select 1 from public.listening_room_queue where room_id=room.id and status='ready') then raise exception 'Queue not emptied'; end if;

 perform set_config('request.jwt.claim.sub',host_id,true);

 update public.listening_rooms set expires_at=now()-interval '1 second' where id=room.id;

 denied:=false;

 begin perform public.heartbeat_listening_room(room.id); exception when others then denied:=true; end;

 if not denied then raise exception 'Expired room resurrected'; end if;

end; $$;

reset role;

do $$

declare room public.listening_rooms; a public.listening_room_queue; b public.listening_room_queue; state public.listening_room_playback;

begin

 perform set_config('request.jwt.claim.sub',current_setting('waveplay.test.host'),true);

 room:=public.create_listening_room('Mantenimiento temporal','Anfitrión prueba');

 a:=public.add_room_youtube(room.id,'abcdefghijk','Primera','Prueba',20,'Anfitrión prueba');

 b:=public.add_room_youtube(room.id,'lmnopqrstuv','Segunda','Prueba',20,'Anfitrión prueba');

 state:=public.control_room_playback_v2(room.id,a.id,0,true,0,'command');

 update public.listening_room_playback set updated_at=now()-interval '60 seconds' where room_id=room.id;

 update public.listening_rooms set host_observed_at=now(),host_track_id=a.id,host_position=30,host_player_state='buffering' where id=room.id;

 perform private.advance_finished_rooms();

 if (select track_id from public.listening_room_playback where room_id=room.id)<>a.id then raise exception 'Buffering song skipped'; end if;

 update public.listening_rooms set host_player_state='playing' where id=room.id;

 perform private.advance_finished_rooms();

 if (select track_id from public.listening_room_playback where room_id=room.id)<>b.id then raise exception 'Server did not advance'; end if;

 if (select status from public.listening_room_queue where id=a.id)<>'removed' then raise exception 'Maintenance left old song'; end if;

 update public.listening_rooms set host_observed_at=now(),host_track_id=b.id,host_position=20,host_player_state='ended' where id=room.id;
 select * into state from public.listening_room_playback where room_id=room.id;
 state:=public.control_room_playback_v2(room.id,b.id,0,true,state.revision,'restart');
 perform private.advance_finished_rooms();
 if (select track_id from public.listening_room_playback where room_id=room.id)<>b.id then raise exception 'Old ended event advanced restarted song'; end if;
 if has_function_privilege('authenticated','private.advance_finished_rooms()','execute') then raise exception 'Maintenance exposed to users'; end if;

end; $$;

rollback;

select 'Room transaction and permission checks passed; no test data retained' as result;
