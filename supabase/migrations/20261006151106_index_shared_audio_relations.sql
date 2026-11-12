create index listening_room_playback_track on public.listening_room_playback(track_id);
create index listening_room_queue_contributor on public.listening_room_queue(added_by);
create index listening_rooms_host on public.listening_rooms(host_user_id);
