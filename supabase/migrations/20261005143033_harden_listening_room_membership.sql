create schema if not exists private;

create or replace function private.is_listening_room_member(room_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listening_room_members member
    where member.user_id = auth.uid()
      and ('room:' || member.room_id::text) = room_topic
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_listening_room_member(text) from public, anon;
grant execute on function private.is_listening_room_member(text) to authenticated;

drop policy "members can read their rooms" on public.listening_rooms;
create policy "members can read their rooms"
on public.listening_rooms for select to authenticated
using (private.is_listening_room_member('room:' || listening_rooms.id::text));

drop policy "members can read room members" on public.listening_room_members;
create policy "members can read room members"
on public.listening_room_members for select to authenticated
using (private.is_listening_room_member('room:' || listening_room_members.room_id::text));

drop policy "room members can receive realtime events" on realtime.messages;
create policy "room members can receive realtime events"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_listening_room_member((select realtime.topic()))
);

drop policy "room members can send realtime events" on realtime.messages;
create policy "room members can send realtime events"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_listening_room_member((select realtime.topic()))
);

drop function public.is_listening_room_member(text);
