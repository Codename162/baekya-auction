create or replace function public.capture_room_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb;
  new_row jsonb;
  target_room_id uuid;
  target_id text;
  action_name text;
  actor text;
begin
  if tg_op = 'INSERT' then
    old_row := null; new_row := to_jsonb(new); action_name := 'INSERT';
  elsif tg_op = 'UPDATE' then
    old_row := to_jsonb(old); new_row := to_jsonb(new); action_name := 'UPDATE';
    if old_row = new_row then return new; end if;
  else
    old_row := to_jsonb(old); new_row := null; action_name := 'DELETE';
  end if;
  if tg_table_name = 'rooms' then
    target_room_id := coalesce((new_row->>'id')::uuid, (old_row->>'id')::uuid);
  else
    target_room_id := coalesce((new_row->>'room_id')::uuid, (old_row->>'room_id')::uuid);
  end if;
  target_id := coalesce(new_row->>'id', old_row->>'id');
  select p.discord_username into actor from public.profiles p where p.id = auth.uid();
  -- Skip child cascade events when the parent room is already being deleted.
  if target_room_id is not null and exists (select 1 from public.rooms r where r.id = target_room_id) then
    insert into public.room_audit_logs(room_id, actor_id, actor_name, entity_type, entity_id, action, before_data, after_data)
    values (target_room_id, auth.uid(), actor, tg_table_name, target_id, action_name, old_row, new_row);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.capture_room_audit() from public, anon, authenticated;
