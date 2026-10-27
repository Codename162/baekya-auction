-- Fix countdown timestamps for bids and manually selected players.
-- Without last_bid_at, automatic finalization can never confirm a bid timeout.
create or replace function public.place_bid(p_room_id uuid, p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  r public.rooms%rowtype;
  t public.teams%rowtype;
  p public.players%rowtype;
  next_amount integer;
begin
  if auth.uid() is null then raise exception '먼저 로그인해 주세요.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
  if r.status <> 'running' then raise exception '현재 경매가 진행 중이 아닙니다.'; end if;
  if r.current_player_id is null then raise exception '현재 경매 선수가 없습니다.'; end if;
  select * into t from public.teams where id=p_team_id and room_id=p_room_id for update;
  if not found or t.captain_user_id <> auth.uid() then raise exception '해당 팀장 계정만 입찰할 수 있습니다.'; end if;
  select * into p from public.players where id=r.current_player_id and room_id=p_room_id for update;
  if not found or p.status <> 'auctioning' then raise exception '선수가 현재 경매 상태가 아닙니다.'; end if;
  if r.highest_team_id=p_team_id then raise exception '이미 최고 입찰 팀입니다.'; end if;
  next_amount := coalesce(r.current_bid, p.start_price - 1) + 1;
  if r.current_bid is null then next_amount := p.start_price; end if;
  if t.budget < next_amount then raise exception '잔여 예산이 부족합니다.'; end if;
  if (select count(*) from public.players where team_id=p_team_id) >= r.team_size then raise exception '팀원 정원이 가득 찼습니다.'; end if;
  if t.budget-next_amount < greatest(0, r.team_size - (select count(*) from public.players where team_id=p_team_id) - 1) then
    raise exception '남은 팀원 자리를 채울 최소 1P씩은 남겨야 합니다.';
  end if;
  insert into public.bids(room_id,player_id,team_id,bidder_user_id,amount)
  values(p_room_id,p.id,p_team_id,auth.uid(),next_amount);
  update public.rooms
    set current_bid=next_amount, highest_team_id=p_team_id, last_bid_at=now()
    where id=p_room_id;
  return t.name || ' 팀이 ' || p.name || ' 선수에게 ' || next_amount || 'P 입찰했습니다.';
end;
$function$;

create or replace function public.select_auction_player(p_room_id uuid, p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  r public.rooms%rowtype;
  p public.players%rowtype;
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
  if r.status <> 'running' then raise exception '먼저 경매를 시작해 주세요.'; end if;
  if r.current_player_id is not null then raise exception '현재 선수의 낙찰 또는 유찰을 먼저 처리해 주세요.'; end if;
  select * into p from public.players where id=p_player_id and room_id=p_room_id for update;
  if not found or p.status <> 'available' or p.is_captain then raise exception '선택할 수 없는 선수입니다.'; end if;
  update public.players set status='auctioning' where id=p.id;
  update public.rooms
    set current_player_id=p.id, current_bid=null, highest_team_id=null,
        auction_started_at=now(), last_bid_at=null
    where id=p_room_id;
  return p.name || ' 선수 경매를 시작했습니다.';
end;
$function$;

grant execute on function public.place_bid(uuid, uuid) to authenticated;
grant execute on function public.select_auction_player(uuid, uuid) to authenticated;
