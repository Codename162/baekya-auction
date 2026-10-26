create index if not exists room_audit_logs_actor_id_idx on public.room_audit_logs(actor_id);
create index if not exists room_backups_created_by_idx on public.room_backups(created_by);
