-- Allow rooms to contain 2–10 teams and safely resize teams while in setup.
alter table public.teams drop constraint if exists teams_team_number_check;
alter table public.teams
  add constraint teams_team_number_check check (team_number between 1 and 10);

create or replace function public.set_auction_team_count(p_room_id uuid, p_team_count integer)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_status text;
  v_name text;
  v_count integer;
  v_budget integer;
begin
  if auth.uid() is null
     or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_team_count < 2 or p_team_count > 10 then
    raise exception '팀 수는 2~10개 사이여야 합니다.';
  end if;

  select status,name,budget_per_team into v_status,v_name,v_budget
  from public.rooms where id=p_room_id for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if v_status <> 'setup' then
    raise exception '팀 수는 준비 상태의 방에서만 변경할 수 있습니다.';
  end if;

  if exists(select 1 from public.bids where room_id=p_room_id)
     or exists(select 1 from public.auction_history where room_id=p_room_id)
     or exists(select 1 from public.players where room_id=p_room_id
       and (team_id is not null or captain_team_id is not null or is_captain
         or status <> 'available' or sold_price is not null)) then
    raise exception '선수 배정·팀장 지정·입찰·낙찰 기록이 있는 방은 팀 수를 변경할 수 없습니다.';
  end if;

  select count(*) into v_count from public.teams where room_id=p_room_id;
  if p_team_count < v_count then
    delete from public.teams where room_id=p_room_id and team_number > p_team_count;
  elsif p_team_count > v_count then
    insert into public.teams(room_id,team_number,name,budget)
    select p_room_id,n,n||'팀',v_budget
    from generate_series(v_count+1,p_team_count) as n;
  end if;
  return '「'||v_name||'」의 팀 수를 '||p_team_count||'개로 변경했습니다.';
end;
$function$;
revoke all on function public.set_auction_team_count(uuid,integer) from public, anon;
grant execute on function public.set_auction_team_count(uuid,integer) to authenticated;
