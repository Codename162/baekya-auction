-- Exclude a room's appointed captain from the auction pool even if their
-- regular participant row is still marked as available.
create or replace function public.select_auction_player(p_room_id uuid, p_player_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.rooms%rowtype;
  p public.players%rowtype;
begin
  if not public.has_room_part_access(p_room_id) then
    raise exception '이 방에 접근할 권한이 없습니다. 참여 신청 후 관리자 승인을 받아 주세요.';
  end if;
  if not public.is_room_admin(p_room_id) then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
  if r.status <> 'running' then raise exception '먼저 경매를 시작해 주세요.'; end if;
  if r.current_player_id is not null then raise exception '현재 선수의 낙찰 또는 유찰을 먼저 처리해 주세요.'; end if;
  select * into p from public.players where id=p_player_id and room_id=p_room_id for update;
  if not found or p.status <> 'available' or p.is_captain then
    raise exception '선택할 수 없는 선수입니다.';
  end if;
  if p.discord_user_id is not null and exists (
    select 1 from public.teams t
    where t.room_id=p_room_id and t.captain_user_id=p.discord_user_id
  ) then
    raise exception '해당 방의 팀장은 경매 선수로 선택할 수 없습니다.';
  end if;
  update public.players set status='auctioning' where id=p.id;
  update public.rooms
    set current_player_id=p.id, current_bid=null, highest_team_id=null,
        auction_started_at=now(), last_bid_at=null
    where id=p_room_id;
  return p.name || ' 선수 경매를 시작했습니다.';
end;
$function$;
