create or replace function public.place_bid(
  p_room_id uuid,
  p_team_id uuid,
  p_expected_amount integer default null,
  p_bid_increment integer default 1
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.rooms%rowtype;
  t public.teams%rowtype;
  p public.players%rowtype;
  next_amount integer;
  current_highest integer;
  current_highest_team uuid;
  roster_count integer;
begin
  if auth.uid() is null then
    raise exception '먼저 로그인해 주세요.';
  end if;

  if p_bid_increment is null or p_bid_increment < 1 or p_bid_increment > 5 then
    raise exception '입찰 상승 폭은 1~5P 사이로 선택해 주세요.';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
  if r.status <> 'running' then raise exception '현재 경매가 진행 중이 아닙니다.'; end if;
  if r.current_player_id is null then raise exception '현재 경매 선수가 없습니다.'; end if;

  select * into t from public.teams where id = p_team_id and room_id = p_room_id for update;
  if not found or t.captain_user_id <> auth.uid() then
    raise exception '해당 팀장 계정만 입찰할 수 있습니다.';
  end if;

  select * into p from public.players where id = r.current_player_id and room_id = p_room_id for update;
  if not found or p.status <> 'auctioning' then raise exception '선수가 현재 경매 상태가 아닙니다.'; end if;

  select b.amount, b.team_id
    into current_highest, current_highest_team
  from public.bids b
  where b.room_id = p_room_id and b.player_id = p.id
  order by b.amount desc, b.created_at desc
  limit 1;

  if current_highest_team = p_team_id then raise exception '이미 최고 입찰 팀입니다.'; end if;

  next_amount := case
    when current_highest is null then p.start_price
    else current_highest + p_bid_increment
  end;

  if p_expected_amount is not null and p_expected_amount <> next_amount then
    raise exception '다른 팀이 먼저 입찰해 가격이 바뀌었습니다. 화면을 확인하고 다시 입찰해 주세요.';
  end if;

  if t.budget < next_amount then raise exception '잔여 예산이 부족합니다.'; end if;

  select count(*) into roster_count from public.players where team_id = p_team_id;
  if roster_count >= r.team_size then raise exception '팀원 정원이 가득 찼습니다.'; end if;
  if t.budget - next_amount < greatest(0, r.team_size - roster_count - 1) then
    raise exception '남은 팀원 자리를 채울 최소 1P씩은 남겨야 합니다.';
  end if;

  insert into public.bids(room_id, player_id, team_id, bidder_user_id, amount)
  values (p_room_id, p.id, p_team_id, auth.uid(), next_amount);

  update public.rooms
  set current_bid = next_amount, highest_team_id = p_team_id
  where id = p_room_id;

  return t.name || ' 팀이 ' || p.name || ' 선수에게 ' || next_amount || 'P 입찰했습니다.';
end;
$function$;

revoke all on function public.place_bid(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.place_bid(uuid, uuid, integer, integer) to authenticated;
