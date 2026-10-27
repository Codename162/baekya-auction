-- Preserve the exact remaining auction time while a room is paused.
alter table public.rooms
  add column if not exists paused_at timestamptz,
  add column if not exists paused_remaining_seconds integer;

create or replace function public.set_auction_status(p_room_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  r public.rooms%rowtype;
  remaining integer;
begin
  if not public.is_room_admin(p_room_id) then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_status not in ('setup','running','paused','finished') then
    raise exception '잘못된 경매 상태입니다.';
  end if;

  select * into r
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception '경매 방을 찾을 수 없습니다.';
  end if;

  if p_status = 'paused' and r.status = 'running' then
    remaining := null;

    if r.current_player_id is not null then
      if r.highest_team_id is not null and r.last_bid_at is not null then
        remaining := greatest(
          0,
          ceil(extract(epoch from (r.last_bid_at + interval '5 seconds' - now())))::integer
        );
      elsif r.auction_started_at is not null then
        remaining := greatest(
          0,
          ceil(extract(epoch from (r.auction_started_at + interval '40 seconds' - now())))::integer
        );
      end if;
    end if;

    update public.rooms
    set status = 'paused',
        paused_at = now(),
        paused_remaining_seconds = remaining
    where id = p_room_id;

  elsif p_status = 'running' and r.status = 'paused' then
    if r.current_player_id is not null and r.paused_remaining_seconds is not null then
      remaining := greatest(0, r.paused_remaining_seconds);

      if r.highest_team_id is not null then
        remaining := least(5, remaining);
        update public.rooms
        set status = 'running',
            last_bid_at = now() - ((5 - remaining) * interval '1 second'),
            paused_at = null,
            paused_remaining_seconds = null
        where id = p_room_id;
      else
        remaining := least(40, remaining);
        update public.rooms
        set status = 'running',
            auction_started_at = now() - ((40 - remaining) * interval '1 second'),
            paused_at = null,
            paused_remaining_seconds = null
        where id = p_room_id;
      end if;
    else
      update public.rooms
      set status = 'running',
          paused_at = null,
          paused_remaining_seconds = null
      where id = p_room_id;
    end if;

  else
    update public.rooms
    set status = p_status,
        paused_at = null,
        paused_remaining_seconds = null
    where id = p_room_id;
  end if;

  return '경매 상태: ' || p_status;
end;
$function$;

grant execute on function public.set_auction_status(uuid, text) to authenticated;
