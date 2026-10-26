-- Restore the saved room roster exactly, unless newer players/teams are referenced by spectator data.
create or replace function public.restore_room_backup(p_backup_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.room_backups%rowtype;
  item jsonb;
  room_id_value uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into b from public.room_backups where id = p_backup_id for update;
  if not found then raise exception '백업을 찾을 수 없습니다.'; end if;
  room_id_value := b.room_id;
  if not public.is_room_admin(room_id_value) then raise exception '해당 방의 관리자 권한이 필요합니다.'; end if;
  if exists(select 1 from public.rooms where id=room_id_value and status='running') then
    raise exception '경매 진행 중에는 복구할 수 없습니다. 먼저 일시정지하거나 종료해 주세요.';
  end if;
  if coalesce((b.snapshot->>'schema_version')::integer, 0) <> 1 then raise exception '지원하지 않는 백업 형식입니다.'; end if;

  if exists (
    select 1 from public.players p
    where p.room_id=room_id_value
      and not exists (select 1 from jsonb_array_elements(coalesce(b.snapshot->'players','[]'::jsonb)) x where x->>'id'=p.id::text)
      and (exists(select 1 from public.spectator_events e where e.room_id=room_id_value and e.mvp_player_id=p.id)
        or exists(select 1 from public.spectator_predictions sp join public.spectator_events e on e.id=sp.event_id where e.room_id=room_id_value and sp.predicted_mvp_player_id=p.id))
  ) then raise exception '백업 이후 추가된 선수가 관전자 이벤트에 연결되어 있습니다. 해당 이벤트 기록을 정리한 뒤 복구해 주세요.'; end if;
  if exists (
    select 1 from public.teams t
    where t.room_id=room_id_value
      and not exists (select 1 from jsonb_array_elements(coalesce(b.snapshot->'teams','[]'::jsonb)) x where x->>'id'=t.id::text)
      and (exists(select 1 from public.spectator_events e where e.room_id=room_id_value and e.winner_team_id=t.id)
        or exists(select 1 from public.spectator_predictions sp join public.spectator_events e on e.id=sp.event_id where e.room_id=room_id_value and sp.predicted_team_id=t.id))
  ) then raise exception '백업 이후 추가된 팀이 관전자 이벤트에 연결되어 있습니다. 해당 이벤트 기록을 정리한 뒤 복구해 주세요.'; end if;

  update public.rooms set name=b.snapshot->'room'->>'name',
    budget_per_team=coalesce((b.snapshot->'room'->>'budget_per_team')::integer,budget_per_team),
    team_size=coalesce((b.snapshot->'room'->>'team_size')::integer,team_size),
    grade_prices=coalesce(b.snapshot->'room'->'grade_prices',grade_prices),
    room_type=coalesce(b.snapshot->'room'->>'room_type',room_type),
    status=case when b.snapshot->'room'->>'status'='running' then 'paused' else coalesce(b.snapshot->'room'->>'status',status) end,
    current_player_id=null,current_bid=null,highest_team_id=null,auction_started_at=null,last_bid_at=null where id=room_id_value;

  delete from public.bids where room_id=room_id_value;
  delete from public.auction_history where room_id=room_id_value;
  delete from public.tournament_results where room_id=room_id_value;
  delete from public.event_announcements where room_id=room_id_value;
  delete from public.auction_settings_history where room_id=room_id_value;
  delete from public.players p where p.room_id=room_id_value
    and not exists (select 1 from jsonb_array_elements(coalesce(b.snapshot->'players','[]'::jsonb)) x where x->>'id'=p.id::text);
  update public.players set team_id=null,captain_team_id=null where room_id=room_id_value;
  delete from public.teams t where t.room_id=room_id_value
    and not exists (select 1 from jsonb_array_elements(coalesce(b.snapshot->'teams','[]'::jsonb)) x where x->>'id'=t.id::text);

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
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'bids','[]'::jsonb)) loop
    insert into public.bids(room_id,player_id,team_id,bidder_user_id,amount,created_at)
    values (room_id_value,(item->>'player_id')::uuid,(item->>'team_id')::uuid,(item->>'bidder_user_id')::uuid,(item->>'amount')::integer,coalesce((item->>'created_at')::timestamptz,now()));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'auction_history','[]'::jsonb)) loop
    insert into public.auction_history(room_id,player_id,player_name,grade,team_id,team_name,price,created_at)
    values (room_id_value,nullif(item->>'player_id','')::uuid,item->>'player_name',item->>'grade',nullif(item->>'team_id','')::uuid,item->>'team_name',(item->>'price')::integer,coalesce((item->>'created_at')::timestamptz,now()));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'auction_settings_history','[]'::jsonb)) loop
    insert into public.auction_settings_history(room_id,changed_by,setting_type,before_value,after_value,created_at)
    values (room_id_value,nullif(item->>'changed_by','')::uuid,item->>'setting_type',item->'before_value',item->'after_value',coalesce((item->>'created_at')::timestamptz,now()));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'tournament_results','[]'::jsonb)) loop
    insert into public.tournament_results(room_id,title,event_date,team_a,team_b,score_a,score_b,winner,mvp,notes,created_by,created_at,updated_at)
    values (room_id_value,item->>'title',coalesce((item->>'event_date')::date,current_date),item->>'team_a',item->>'team_b',
      coalesce((item->>'score_a')::integer,0),coalesce((item->>'score_b')::integer,0),coalesce(item->>'winner',''),coalesce(item->>'mvp',''),
      coalesce(item->>'notes',''),nullif(item->>'created_by','')::uuid,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now()));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(b.snapshot->'event_announcements','[]'::jsonb)) loop
    insert into public.event_announcements(room_id,title,content,event_date,signup_deadline,status,created_by,created_at,updated_at)
    values (room_id_value,item->>'title',coalesce(item->>'content',''),nullif(item->>'event_date','')::timestamptz,nullif(item->>'signup_deadline','')::timestamptz,
      coalesce(item->>'status','draft'),nullif(item->>'created_by','')::uuid,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now()));
  end loop;
  insert into public.room_audit_logs(room_id,actor_id,actor_name,entity_type,entity_id,action,before_data,after_data)
  values (room_id_value,auth.uid(),(select discord_username from public.profiles where id=auth.uid()),'room_backup',b.id::text,'RESTORE',null,
    jsonb_build_object('backup_id',b.id,'label',b.label,'restored_at',now()));
  return '백업 복구를 완료했습니다. 해당 백업 시점에 없던 선수·팀은 안전하게 정리했습니다.';
end; $$;
revoke all on function public.restore_room_backup(uuid) from public, anon;
grant execute on function public.restore_room_backup(uuid) to authenticated;
