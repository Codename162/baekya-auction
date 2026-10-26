create index if not exists auction_history_player_id_idx on public.auction_history (player_id);
create index if not exists auction_history_room_id_idx on public.auction_history (room_id);
create index if not exists auction_history_team_id_idx on public.auction_history (team_id);
create index if not exists auction_settings_history_changed_by_idx on public.auction_settings_history (changed_by);
create index if not exists auction_settings_history_room_id_idx on public.auction_settings_history (room_id);
create index if not exists bids_bidder_user_id_idx on public.bids (bidder_user_id);
create index if not exists bids_player_id_idx on public.bids (player_id);
create index if not exists bids_room_id_idx on public.bids (room_id);
create index if not exists bids_team_id_idx on public.bids (team_id);
create index if not exists event_announcements_created_by_idx on public.event_announcements (created_by);
create index if not exists players_captain_team_id_idx on public.players (captain_team_id);
create index if not exists players_discord_user_id_idx on public.players (discord_user_id) where discord_user_id is not null;
create index if not exists players_team_id_idx on public.players (team_id);
create index if not exists rooms_admin_user_id_idx on public.rooms (admin_user_id);
create index if not exists rooms_current_player_id_idx on public.rooms (current_player_id);
create index if not exists rooms_highest_team_id_idx on public.rooms (highest_team_id);
create index if not exists spectator_events_created_by_idx on public.spectator_events (created_by);
create index if not exists spectator_events_mvp_player_id_idx on public.spectator_events (mvp_player_id);
create index if not exists spectator_events_winner_team_id_idx on public.spectator_events (winner_team_id);
create index if not exists spectator_point_awards_user_id_idx on public.spectator_point_awards (user_id);
create index if not exists spectator_predictions_predicted_mvp_player_id_idx on public.spectator_predictions (predicted_mvp_player_id);
create index if not exists spectator_predictions_predicted_team_id_idx on public.spectator_predictions (predicted_team_id);
create index if not exists spectator_predictions_user_id_idx on public.spectator_predictions (user_id);
create index if not exists teams_captain_user_id_idx on public.teams (captain_user_id);
create index if not exists tournament_results_created_by_idx on public.tournament_results (created_by);

drop policy if exists "Admins manage tournament results" on public.tournament_results;
create policy "Admins insert tournament results" on public.tournament_results for insert to authenticated with check (is_room_admin(room_id));
create policy "Admins update tournament results" on public.tournament_results for update to authenticated using (is_room_admin(room_id)) with check (is_room_admin(room_id));
create policy "Admins delete tournament results" on public.tournament_results for delete to authenticated using (is_room_admin(room_id));

revoke execute on function public.get_auction_stats(uuid) from public, anon;
grant execute on function public.get_auction_stats(uuid) to authenticated;

create or replace function public.update_auction_balance_settings(p_room_id uuid, p_team_budgets jsonb, p_grade_prices jsonb)
returns text language plpgsql security definer set search_path = public as $function$
declare
  r public.rooms%rowtype; t public.teams%rowtype; item jsonb; new_budget integer;
  old_budgets jsonb := '{}'::jsonb; new_budgets jsonb := '{}'::jsonb; old_prices jsonb;
  g text; v integer; spent integer; v_team_count integer;
begin
  if auth.uid() is null or not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
  if r.room_type <> 'auction' then raise exception '경매 설정은 선수 경매방에서만 변경할 수 있습니다.'; end if;
  if r.status <> 'setup' then raise exception '경매 시작 후에는 예산/시작가 설정을 변경할 수 없습니다. 기록 보호를 위해 경매 시작 전에 변경해 주세요.'; end if;
  select count(*) into v_team_count from public.teams where room_id=p_room_id;
  if v_team_count < 2 or jsonb_typeof(p_team_budgets) <> 'array' or jsonb_array_length(p_team_budgets) <> v_team_count then raise exception '현재 방의 모든 팀 예산을 입력해 주세요.'; end if;
  if jsonb_typeof(p_grade_prices) <> 'object' then raise exception '등급별 시작가 형식이 올바르지 않습니다.'; end if;
  foreach g in array array['S','A','B','C','D'] loop
    if not (p_grade_prices ? g) then raise exception '%급 시작가가 없습니다.', g; end if;
    begin v := (p_grade_prices->>g)::integer; exception when others then raise exception '%급 시작가는 정수여야 합니다.',g; end;
    if v < 1 or v > 100 then raise exception '%급 시작가는 1~100P로 설정해 주세요.',g; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_grade_prices)) <> 5 then raise exception 'S/A/B/C/D 등급만 설정할 수 있습니다.'; end if;
  for item in select value from jsonb_array_elements(p_team_budgets) loop
    if not (item ? 'team_id') or not (item ? 'budget') then raise exception '팀 예산 항목이 올바르지 않습니다.'; end if;
    begin new_budget := (item->>'budget')::integer; exception when others then raise exception '팀 예산은 정수여야 합니다.'; end;
    if new_budget < 0 or new_budget > 500 then raise exception '팀 예산은 0~500P 범위로 설정해 주세요.'; end if;
    begin select * into t from public.teams where id=(item->>'team_id')::uuid and room_id=p_room_id for update;
    exception when invalid_text_representation then raise exception '팀 ID 형식이 올바르지 않습니다.'; end;
    if not found then raise exception '해당 경매 방의 팀이 아닙니다.'; end if;
    select coalesce(sum(sold_price),0) into spent from public.players where room_id=p_room_id and team_id=t.id and status='sold' and not is_captain;
    if new_budget < spent then raise exception '% 예산은 이미 사용한 %P보다 적을 수 없습니다.',t.name,spent; end if;
    old_budgets := old_budgets || jsonb_build_object(t.id::text,t.budget);
    new_budgets := new_budgets || jsonb_build_object(t.id::text,new_budget);
  end loop;
  if (select count(*) from jsonb_object_keys(new_budgets)) <> v_team_count then raise exception '각 팀 예산은 중복 없이 한 번씩 입력해야 합니다.'; end if;
  old_prices := r.grade_prices;
  for item in select value from jsonb_array_elements(p_team_budgets) loop
    update public.teams set budget=(item->>'budget')::integer where id=(item->>'team_id')::uuid and room_id=p_room_id;
  end loop;
  update public.rooms set grade_prices=p_grade_prices where id=p_room_id;
  if old_budgets <> new_budgets then insert into public.auction_settings_history(room_id,changed_by,setting_type,before_value,after_value) values(p_room_id,auth.uid(),'team_budget',old_budgets,new_budgets); end if;
  if old_prices is distinct from p_grade_prices then insert into public.auction_settings_history(room_id,changed_by,setting_type,before_value,after_value) values(p_room_id,auth.uid(),'grade_prices',old_prices,p_grade_prices); end if;
  return '팀별 예산과 등급별 시작가 설정을 저장했습니다.';
end;
$function$;
revoke all on function public.update_auction_balance_settings(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.update_auction_balance_settings(uuid,jsonb,jsonb) to authenticated;