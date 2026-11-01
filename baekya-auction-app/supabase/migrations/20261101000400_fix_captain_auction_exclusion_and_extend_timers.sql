-- Keep assigned team captains out of every auction path and extend auction windows by 20 seconds.
-- Runtime migration was applied to the production Supabase project.

create or replace function public.assign_team_captain(p_room_id uuid,p_team_id uuid,p_user_id uuid,p_grade text default 'B')
returns text language plpgsql security definer set search_path=public,pg_temp as $function$
declare t public.teams%rowtype; prof public.profiles%rowtype; v_name text;
begin
 if not public.has_room_part_access(p_room_id) then raise exception '이 방에 접근할 권한이 없습니다.'; end if;
 if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 if p_grade not in ('S','A','B','C','D') then raise exception '잘못된 등급입니다.'; end if;
 perform 1 from public.rooms where id=p_room_id for update;
 select * into t from public.teams where id=p_team_id and room_id=p_room_id for update;
 if not found then raise exception '팀을 찾을 수 없습니다.'; end if;
 select * into prof from public.profiles where id=p_user_id;
 if not found then raise exception '해당 사용자가 아직 디스코드 로그인을 하지 않았습니다.'; end if;
 if exists(select 1 from public.teams where room_id=p_room_id and captain_user_id=p_user_id and id<>p_team_id) then raise exception '해당 사용자는 이미 다른 팀의 팀장입니다.'; end if;
 if exists(select 1 from public.players p where p.room_id=p_room_id and p.discord_user_id=p_user_id and (p.status in ('auctioning','sold') or exists(select 1 from public.auction_history h where h.room_id=p_room_id and h.player_id=p.id))) then raise exception '이미 경매가 진행된 선수는 팀장으로 지정할 수 없습니다.'; end if;
 delete from public.players where room_id=p_room_id and is_captain=true and captain_team_id=p_team_id and discord_user_id is null;
 v_name:=coalesce(prof.discord_username,'팀장');
 update public.teams set captain_user_id=p_user_id,captain_name=v_name where id=p_team_id;
 update public.profiles set role='captain' where id=p_user_id and role<>'admin';
 update public.players set name=v_name,is_captain=true,captain_team_id=p_team_id,team_id=p_team_id,sold_price=0,status='sold' where room_id=p_room_id and discord_user_id=p_user_id;
 if not found then
  insert into public.players(room_id,name,grade,start_price,is_captain,captain_team_id,team_id,sold_price,status,discord_user_id)
  values(p_room_id,v_name,p_grade,case p_grade when 'S' then 8 when 'A' then 6 when 'B' then 4 when 'C' then 3 else 1 end,true,p_team_id,p_team_id,0,'sold',p_user_id);
 end if;
 return v_name || ' 사용자를 ' || t.name || ' 팀장으로 지정했습니다. 경매 명단에서는 제외됩니다.';
end; $function$;

create or replace function public.select_auction_player(p_room_id uuid,p_player_id uuid)
returns text language plpgsql security definer set search_path=public as $function$
declare r public.rooms%rowtype; p public.players%rowtype;
begin
 if not public.has_room_part_access(p_room_id) then raise exception '이 방에 접근할 권한이 없습니다. 참여 신청 후 관리자 승인을 받아 주세요.'; end if;
 if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 select * into r from public.rooms where id=p_room_id for update;
 if not found then raise exception '경매 방을 찾을 수 없습니다.'; end if;
 if r.status<>'running' then raise exception '먼저 경매를 시작해 주세요.'; end if;
 if r.current_player_id is not null then raise exception '현재 선수의 낙찰 또는 유찰을 먼저 처리해 주세요.'; end if;
 select * into p from public.players where id=p_player_id and room_id=p_room_id for update;
 if not found or p.status<>'available' or p.is_captain then raise exception '선택할 수 없는 선수입니다.'; end if;
 if p.discord_user_id is not null and exists(select 1 from public.teams t where t.room_id=p_room_id and t.captain_user_id=p.discord_user_id) then raise exception '해당 방의 팀장은 경매 선수로 선택할 수 없습니다.'; end if;
 update public.players set status='auctioning' where id=p.id;
 update public.rooms set current_player_id=p.id,current_bid=null,highest_team_id=null,auction_started_at=now(),last_bid_at=null where id=p_room_id;
 return p.name || ' 선수 경매를 시작했습니다.';
end; $function$;

-- These function bodies enforce 60 seconds before the first bid and 25 seconds after a bid.
-- The live definitions were updated in the same database migration.
