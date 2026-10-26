-- Allow global admins and the assigned room admin to update room settings such as the room name.
create policy "admins update rooms"
  on public.rooms
  for update
  to authenticated
  using (public.is_room_admin(id))
  with check (public.is_room_admin(id));
