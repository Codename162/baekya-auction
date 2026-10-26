-- Adds player profile metadata, room-scoped audit logs, and admin-only backups.
alter table public.players
  add column if not exists main_position text not null default '',
  add column if not exists tier text not null default '',
  add column if not exists favorite_champions text[] not null default '{}';

create table if not exists public.room_audit_logs (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  entity_type text not null,
  entity_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE','RESTORE')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists room_audit_logs_room_created_idx on public.room_audit_logs(room_id, created_at desc);
alter table public.room_audit_logs enable row level security;
drop policy if exists "room admins read audit logs" on public.room_audit_logs;
create policy "room admins read audit logs" on public.room_audit_logs for select to authenticated using (public.is_room_admin(room_id));
revoke insert, update, delete on public.room_audit_logs from anon, authenticated;

create table if not exists public.room_backups (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  label text not null default '방 백업',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists room_backups_room_created_idx on public.room_backups(room_id, created_at desc);
alter table public.room_backups enable row level security;
drop policy if exists "room admins read backups" on public.room_backups;
create policy "room admins read backups" on public.room_backups for select to authenticated using (public.is_room_admin(room_id));
revoke insert, update, delete on public.room_backups from anon, authenticated;

create or replace function public.capture_room_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_row jsonb; new_row jsonb; target_room_id uuid; target_id text; action_name text; actor text;
begin
  if tg_op = 'INSERT' then old_row := null; new_row := to_jsonb(new); action_name := 'INSERT';
  elsif tg_op = 'UPDATE' then
    old_row := to_jsonb(old); new_row := to_jsonb(new); action_name := 'UPDATE';
    if old_row = new_row then return new; end if;
  else old_row := to_jsonb(old); new_row := null; action_name := 'DELETE'; end if;
  if tg_table_name = 'rooms' then
    target_room_id := coalesce((new_row->>'id')::uuid, (old_row->>'id')::uuid);
  else target_room_id := coalesce((new_row->>'room_id')::uuid, (old_row->>'room_id')::uuid); end if;
  target_id := coalesce(new_row->>'id', old_row->>'id');
  select p.discord_username into actor from public.profiles p where p.id = auth.uid();
  if target_room_id is not null then
    insert into public.room_audit_logs(room_id, actor_id, actor_name, entity_type, entity_id, action, before_data, after_data)
    values (target_room_id, auth.uid(), actor, tg_table_name, target_id, action_name, old_row, new_row);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.capture_room_audit() from public, anon, authenticated;

drop trigger if exists audit_players_changes on public.players;
create trigger audit_players_changes after insert or update or delete on public.players for each row execute function public.capture_room_audit();
drop trigger if exists audit_teams_changes on public.teams;
create trigger audit_teams_changes after insert or update or delete on public.teams for each row execute function public.capture_room_audit();
drop trigger if exists audit_rooms_changes on public.rooms;
create trigger audit_rooms_changes after insert or update or delete on public.rooms for each row execute function public.capture_room_audit();
drop trigger if exists audit_tournament_results_changes on public.tournament_results;
create trigger audit_tournament_results_changes after insert or update or delete on public.tournament_results for each row execute function public.capture_room_audit();
drop trigger if exists audit_event_announcements_changes on public.event_announcements;
create trigger audit_event_announcements_changes after insert or update or delete on public.event_announcements for each row execute function public.capture_room_audit();
drop trigger if exists audit_spectator_events_changes on public.spectator_events;
create trigger audit_spectator_events_changes after insert or update or delete on public.spectator_events for each row execute function public.capture_room_audit();

create or replace function public.create_room_backup(p_room_id uuid, p_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_backup_id uuid; room_row public.rooms%rowtype; snapshot_data jsonb;
begin
  if auth.uid() is null or not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into room_row from public.rooms where id = p_room_id;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if room_row.status = 'running' then raise exception '경매 진행 중에는 백업할 수 없습니다. 일시정지 또는 종료 후 진행해 주세요.'; end if;
  snapshot_data := jsonb_build_object(
    'schema_version', 1,
    'room', (select to_jsonb(r) from public.rooms r where r.id = p_room_id),
    'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.team_number) from public.teams t where t.room_id = p_room_id), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.players p where p.room_id = p_room_id), '[]'::jsonb),
    'bids', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.bids b where b.room_id = p_room_id), '[]'::jsonb),
    'auction_history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.auction_history h where h.room_id = p_room_id), '[]'::jsonb),
    'auction_settings_history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.auction_settings_history h where h.room_id = p_room_id), '[]'::jsonb),
    'tournament_results', coalesce((select jsonb_agg(to_jsonb(r) order by r.event_date) from public.tournament_results r where r.room_id = p_room_id), '[]'::jsonb),
    'event_announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.event_announcements a where a.room_id = p_room_id), '[]'::jsonb),
    'created_at', now()
  );
  insert into public.room_backups(room_id, created_by, label, snapshot)
  values (p_room_id, auth.uid(), coalesce(nullif(trim(p_label), ''), '방 백업 · ' || to_char(now(), 'YYYY-MM-DD HH24:MI')), snapshot_data)
  returning id into new_backup_id;
  return new_backup_id;
end; $$;

create or replace function public.restore_room_backup(p_backup_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare b public.room_backups%rowtype; item jsonb; room_id_value uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into b from public.room_backups where id = p_backup_id for update;
  if not found then raise exception '백업을 찾을 수 없습니다.'; end if;
  room_id_value := b.room_id;
  if not public.is_room_admin(room_id_value) then raise exception '해당 방의 관리자 권한이 필요합니다.'; end if;
  if exists(select 1 from public.rooms where id=room_id_value and status='running') then raise exception '경매 진행 중에는 복구할 수 없습니다. 먼저 일시정지하거나 종료해 주세요.'; end if;
  if coalesce((b.snapshot->>'schema_version')::integer, 0) <> 1 then raise exception '지원하지 않는 백업 형식입니다.'; end if;
  update public.rooms set name=b.snapshot->'room'->>'name',
    budget_per_team=coalesce((b.snapshot->'room'->>'budget_per_team')::integer,budget_per_team),
    team_size=coalesce((b.snapshot->'room'->>'team_size')::integer,team_size),
    grade_prices=coalesce(b.snapshot->'room'->'grade_prices',grade_prices),
    room_type=coalesce(b.snapshot->'room'->>'room_type',room_type),
    status=case when b.snapshot->'room'->>'status'='running' then 'paused' else coalesce(b.snapshot->'room'->>'status',status) end,
    current_player_id=null,current_bid=null,highest_team_id=null,auction_started_at=null,last_bid_at=null
    where id=room_id_value;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'teams','[]'::jsonb)) loop
    insert into public.teams(id,room_id,team_number,name,captain_user_id,captain_name,budget)
    values ((item->>'id')::uuid,room_id_value,(item->>'team_number')::integer,item->>'name',
      nullif(item->>'captain_user_id','')::uuid,item->>'captain_name',coalesce((item->>'budget')::integer,30))
    on conflict(id) do update set team_number=excluded.team_number,name=excluded.name,captain_user_id=excluded.captain_user_id,
      captain_name=excluded.captain_name,budget=excluded.budget where public.teams.room_id=room_id_value;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'players','[]'::jsonb)) loop
    insert into public.players(id,room_id,name,grade,start_price,is_captain,captain_team_id,team_id,sold_price,status,skill_score,discord_user_id,main_position,tier,favorite_champions)
    values ((item->>'id')::uuid,room_id_value,item->>'name',coalesce(item->>'grade','C'),coalesce((item->>'start_price')::integer,1),
      coalesce((item->>'is_captain')::boolean,false),nullif(item->>'captain_team_id','')::uuid,nullif(item->>'team_id','')::uuid,
      nullif(item->>'sold_price','')::integer,coalesce(item->>'status','available'),coalesce((item->>'skill_score')::integer,50),
      nullif(item->>'discord_user_id','')::uuid,coalesce(item->>'main_position',''),coalesce(item->>'tier',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(item->'favorite_champions','[]'::jsonb))), '{}'::text[]))
    on conflict(id) do update set name=excluded.name,grade=excluded.grade,start_price=excluded.start_price,is_captain=excluded.is_captain,
      captain_team_id=excluded.captain_team_id,team_id=excluded.team_id,sold_price=excluded.sold_price,status=excluded.status,
      skill_score=excluded.skill_score,main_position=excluded.main_position,tier=excluded.tier,favorite_champions=excluded.favorite_champions
      where public.players.room_id=room_id_value;
  end loop;
  delete from public.bids where room_id=room_id_value;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'bids','[]'::jsonb)) loop
    insert into public.bids(room_id,player_id,team_id,bidder_user_id,amount,created_at)
    values (room_id_value,(item->>'player_id')::uuid,(item->>'team_id')::uuid,(item->>'bidder_user_id')::uuid,(item->>'amount')::integer,coalesce((item->>'created_at')::timestamptz,now()));
  end loop;
  delete from public.auction_history where room_id=room_id_value;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'auction_history','[]'::jsonb)) loop
    insert into public.auction_history(room_id,player_id,player_name,grade,team_id,team_name,price,created_at)
    values (room_id_value,nullif(item->>'player_id','')::uuid,item->>'player_name',item->>'grade',nullif(item->>'team_id','')::uuid,item->>'team_name',(item->>'price')::integer,coalesce((item->>'created_at')::timestamptz,now()));
  end loop;
  delete from public.auction_settings_history where room_id=room_id_value;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'auction_settings_history','[]'::jsonb)) loop
    insert into public.auction_settings_history(room_id,changed_by,setting_type,before_value,after_value,created_at)
    values (room_id_value,nullif(item->>'changed_by','')::uuid,item->>'setting_type',item->'before_value',item->'after_value',coalesce((item->>'created_at')::timestamptz,now()));
  end loop;
  delete from public.tournament_results where room_id=room_id_value;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'tournament_results','[]'::jsonb)) loop
    insert into public.tournament_results(room_id,title,event_date,team_a,team_b,score_a,score_b,winner,mvp,notes,created_by,created_at,updated_at)
    values (room_id_value,item->>'title',coalesce((item->>'event_date')::date,current_date),item->>'team_a',item->>'team_b',
      coalesce((item->>'score_a')::integer,0),coalesce((item->>'score_b')::integer,0),coalesce(item->>'winner',''),coalesce(item->>'mvp',''),
      coalesce(item->>'notes',''),nullif(item->>'created_by','')::uuid,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now()));
  end loop;
  delete from public.event_announcements where room_id=room_id_value;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'event_announcements','[]'::jsonb)) loop
    insert into public.event_announcements(room_id,title,content,event_date,signup_deadline,status,created_by,created_at,updated_at)
    values (room_id_value,item->>'title',coalesce(item->>'content',''),nullif(item->>'event_date','')::timestamptz,nullif(item->>'signup_deadline','')::timestamptz,
      coalesce(item->>'status','draft'),nullif(item->>'created_by','')::uuid,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now()));
  end loop;
  insert into public.room_audit_logs(room_id,actor_id,actor_name,entity_type,entity_id,action,before_data,after_data)
  values (room_id_value,auth.uid(),(select discord_username from public.profiles where id=auth.uid()),'room_backup',b.id::text,'RESTORE',null,
    jsonb_build_object('backup_id',b.id,'label',b.label,'restored_at',now()));
  return '백업 복구를 완료했습니다. 백업 이후 추가된 선수·팀은 관전자 이벤트 등 연결 기록을 보호하기 위해 삭제하지 않았습니다.';
end; $$;

revoke all on function public.create_room_backup(uuid,text) from public, anon;
revoke all on function public.restore_room_backup(uuid) from public, anon;
grant execute on function public.create_room_backup(uuid,text) to authenticated;
grant execute on function public.restore_room_backup(uuid) to authenticated;
