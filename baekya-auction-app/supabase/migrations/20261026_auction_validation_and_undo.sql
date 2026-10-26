-- Keep automatic auction finalization consistent with manual bid validation.
create or replace function public.auto_finalize_auction(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  r public.rooms%rowtype;
  p public.players%rowtype;
  t public.teams%rowtype;
  next_p public.players%rowtype;
  final_price integer;
  roster_count integer;
  msg text;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if not found or r.status <> 'running' or r.current_player_id is null or r.auction_started_at is null then
    return '경매 대기 중';
  end if;

  if r.highest_team_id is not null and r.last_bid_at is not null and r.last_bid_at <= now() - interval '5 seconds' then
    select * into p from public.players where id=r.current_player_id and room_id=p_room_id for update;
    select * into t from public.teams where id=r.highest_team_id and room_id=p_room_id for update;
    if not found or p.id is null or p.status <> 'auctioning' then
      raise exception '현재 경매 선수 또는 최고 입찰 팀을 확인할 수 없습니다.';
    end if;
    final_price := r.current_bid;
    select count(*) into roster_count from public.players where room_id=p_room_id and team_id=t.id;
    if t.budget < final_price then raise exception '최고 입찰 팀의 잔여 예산이 부족하여 자동 낙찰을 중단했습니다.'; end if;
    if roster_count >= r.team_size then raise exception '최고 입찰 팀의 정원이 가득 차 자동 낙찰을 중단했습니다.'; end if;

    update public.teams set budget=budget-final_price where id=t.id;
    update public.players set status='sold',team_id=t.id,sold_price=final_price where id=p.id;
    insert into public.auction_history(room_id,player_id,player_name,grade,team_id,team_name,price)
      values(p_room_id,p.id,p.name,p.grade,t.id,t.name,final_price);
    msg := p.name || ' 선수가 ' || t.name || ' 팀에 ' || final_price || 'P로 자동 낙찰되었습니다.';
  elsif r.highest_team_id is null and r.auction_started_at <= now() - interval '40 seconds' then
    update public.players set status='passed' where id=r.current_player_id and room_id=p_room_id;
    msg := '40초 동안 입찰이 없어 유찰 처리했습니다.';
  else
    return '아직 경매 시간이 남아 있습니다.';
  end if;

  select * into next_p from public.players
    where room_id=p_room_id and status='available' and not is_captain
    order by random() limit 1 for update;
  if found then
    update public.players set status='auctioning' where id=next_p.id;
    update public.rooms set current_player_id=next_p.id,current_bid=null,highest_team_id=null,auction_started_at=now(),last_bid_at=null where id=p_room_id;
    return msg || ' 다음 선수 ' || next_p.name || ' 경매를 시작했습니다.';
  else
    update public.rooms set current_player_id=null,current_bid=null,highest_team_id=null,auction_started_at=null,last_bid_at=null,status='finished' where id=p_room_id;
    return msg || ' 남은 선수가 없어 경매를 종료했습니다.';
  end if;
end;
$function$;

-- Undo only the latest award atomically and restore the player's auction state.
create or replace function public.undo_last_auction(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  h public.auction_history%rowtype;
  r public.rooms%rowtype;
  p public.players%rowtype;
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
  if r.room_type = 'balance' then raise exception '점수 팀배정방에서는 경매 낙찰을 되돌릴 수 없습니다.'; end if;
  select * into h from public.auction_history where room_id=p_room_id order by created_at desc, id desc limit 1 for update;
  if not found then raise exception '되돌릴 낙찰 기록이 없습니다.'; end if;
  select * into p from public.players where id=h.player_id and room_id=p_room_id for update;
  if not found then raise exception '낙찰된 선수를 찾을 수 없습니다.'; end if;

  update public.teams set budget=budget+h.price where id=h.team_id and room_id=p_room_id;
  update public.players set status='auctioning', team_id=null, sold_price=null where id=h.player_id and room_id=p_room_id;
  delete from public.bids where room_id=p_room_id and player_id=h.player_id;
  delete from public.auction_history where id=h.id;
  update public.rooms set status='running',current_player_id=h.player_id,current_bid=null,highest_team_id=null,auction_started_at=now(),last_bid_at=null where id=p_room_id;
  return h.player_name || ' 선수의 직전 낙찰을 취소했습니다. 팀 예산을 복구하고 해당 선수를 재경매 상태로 돌렸습니다.';
end;
$function$;

revoke all on function public.undo_last_auction(uuid) from public;
grant execute on function public.undo_last_auction(uuid) to authenticated;
