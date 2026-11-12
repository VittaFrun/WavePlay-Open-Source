create table public.listening_rooms (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 6)),
  name text not null check (char_length(name) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

create table public.listening_room_members (
  room_id uuid not null references public.listening_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null default 'guest' check (role in ('host', 'guest')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.listening_rooms enable row level security;
alter table public.listening_room_members enable row level security;

grant select, insert, update, delete on public.listening_rooms to authenticated;
grant select, insert, update, delete on public.listening_room_members to authenticated;

create or replace function public.is_listening_room_member(room_topic text)
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

revoke all on function public.is_listening_room_member(text) from public, anon;
grant execute on function public.is_listening_room_member(text) to authenticated;

create policy "members can read their rooms"
on public.listening_rooms for select to authenticated
using (public.is_listening_room_member('room:' || listening_rooms.id::text));

create policy "users can create rooms"
on public.listening_rooms for insert to authenticated
with check (host_user_id = (select auth.uid()));

create policy "hosts can update rooms"
on public.listening_rooms for update to authenticated
using (host_user_id = (select auth.uid()))
with check (host_user_id = (select auth.uid()));

create policy "hosts can delete rooms"
on public.listening_rooms for delete to authenticated
using (host_user_id = (select auth.uid()));

create policy "members can read room members"
on public.listening_room_members for select to authenticated
using (public.is_listening_room_member('room:' || listening_room_members.room_id::text));

create policy "users can leave rooms"
on public.listening_room_members for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.create_listening_room(room_name text, member_name text)
returns public.listening_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.listening_rooms;
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication required'; end if;
  if char_length(trim(room_name)) not between 1 and 60 then raise exception 'invalid room name'; end if;
  if char_length(trim(member_name)) not between 1 and 60 then raise exception 'invalid member name'; end if;
  insert into public.listening_rooms(host_user_id, name)
  values (caller, trim(room_name)) returning * into created;
  insert into public.listening_room_members(room_id, user_id, display_name, role)
  values (created.id, caller, trim(member_name), 'host');
  return created;
end;
$$;

create or replace function public.join_listening_room(room_code text, member_name text)
returns public.listening_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.listening_rooms;
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication required'; end if;
  if char_length(trim(member_name)) not between 1 and 60 then raise exception 'invalid member name'; end if;
  select * into target from public.listening_rooms
  where invite_code = upper(trim(room_code)) and status = 'active' and expires_at > now();
  if target.id is null then raise exception 'room not found'; end if;
  insert into public.listening_room_members(room_id, user_id, display_name, role)
  values (target.id, caller, trim(member_name), 'guest')
  on conflict (room_id, user_id) do update set display_name = excluded.display_name;
  return target;
end;
$$;

revoke all on function public.create_listening_room(text, text) from public, anon;
revoke all on function public.join_listening_room(text, text) from public, anon;
grant execute on function public.create_listening_room(text, text) to authenticated;
grant execute on function public.join_listening_room(text, text) to authenticated;

create policy "room members can receive realtime events"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and public.is_listening_room_member((select realtime.topic()))
);

create policy "room members can send realtime events"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and public.is_listening_room_member((select realtime.topic()))
);
