alter table public.players drop constraint if exists players_status_check;
alter table public.players add constraint players_status_check
  check (status = any (array['available','auctioning','sold','passed','withdrawn']));

create or replace function public.add_room_dummy_player(
  p_room_id uuid,
  p_name text,
  p_grade text default 'B'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_price integer;
begin
  if auth.uid() is null or not public.is_room_admin(p_room_id) then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception '임시 참가자 닉네임은 1~40자로 입력해 주세요.';
  end if;
  if p_grade not in ('S','A','B','C','D') then
    raise exception '선수 등급이 올바르지 않습니다.';
  end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if v_room.status <> 'setup' then
    raise exception '임시 참가자는 경매 시작 전 준비 상태에서만 추가할 수 있습니다.';
  end if;
  if exists(select 1 from public.players where room_id=p_room_id and lower(name)=lower(v_name) and status <> 'withdrawn') then
    raise exception '같은 닉네임의 참가자가 이미 이 방에 있습니다.';
  end if;
  v_price := coalesce((v_room.grade_prices->>p_grade)::integer,
    case p_grade when 'S' then 8 when 'A' then 6 when 'B' then 4 when 'C' then 3 else 1 end);
  insert into public.players(room_id,name,grade,start_price,status,is_captain,discord_user_id,skill_score)
  values(p_room_id,v_name,p_grade,greatest(v_price,1),'available',false,null,
    case p_grade when 'S' then 100 when 'A' then 80 when 'B' then 60 when 'C' then 40 else 20 end)
  returning * into v_player;
  return jsonb_build_object('status','created','player_id',v_player.id,'name',v_player.name);
end;
$function$;

revoke all on function public.add_room_dummy_player(uuid,text,text) from public;
grant execute on function public.add_room_dummy_player(uuid,text,text) to authenticated;
