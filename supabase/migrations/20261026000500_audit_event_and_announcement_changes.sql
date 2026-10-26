drop trigger if exists audit_event_announcements_changes on public.event_announcements;
create trigger audit_event_announcements_changes after insert or update or delete on public.event_announcements for each row execute function public.capture_room_audit();

drop trigger if exists audit_spectator_events_changes on public.spectator_events;
create trigger audit_spectator_events_changes after insert or update or delete on public.spectator_events for each row execute function public.capture_room_audit();

revoke all on function public.create_room_backup(uuid,text) from public, anon;
revoke all on function public.restore_room_backup(uuid) from public, anon;
grant execute on function public.create_room_backup(uuid,text) to authenticated;
grant execute on function public.restore_room_backup(uuid) to authenticated;
