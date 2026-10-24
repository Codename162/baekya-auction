-- Score-balanced team assignment (separate from auction)
alter table public.players add column if not exists skill_score integer not null default 50 check (skill_score between 0 and 100);
update public.players set skill_score=case grade when 'S' then 100 when 'A' then 80 when 'B' then 60 when 'C' then 40 when 'D' then 20 else 50 end where skill_score=50;
create or replace function public.balance_teams_by_score(p_room_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare r public.rooms%rowtype; v_team_count integer; v_player_count integer; v_captain_count integer; v_team_id uuid; p record; v_assigned integer:=0;
begin
 if auth.uid() is null or not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 select * into r from public.rooms where id=p_room_id for update;
 if not found then raise exception '방을 찾을 수 없습니다.'; end if;
 if r.status<>'setup' then raise exception '점수별 팀 배정은 준비 상태의 방에서만 할 수 있습니다.'; end if;
 if exists(select 1 from public.auction_history where room_id=p_room_id) then raise exception '경매 기록이 있는 방에서는 점수별 팀 배정을 사용할 수 없습니다. 별도의 준비 방을 만들어 주세요.'; end if;
 if exists(select 1 from public.players where room_id=p_room_id and not is_captain and status<>'available') then raise exception '경매에 들어간 선수 또는 처리된 선수가 있어 팀 배정을 중단했습니다.'; end if;
 select count(*) into v_team_count from public.teams where room_id=p_room_id;
 if v_team_count<2 then raise exception '팀이 2개 이상 있어야 합니다.'; end if;
 select count(*) into v_player_count from public.players where room_id=p_room_id and not is_captain;
 select count(*) into v_captain_count from public.players where room_id=p_room_id and is_captain;
 if v_player_count+v_captain_count>v_team_count*r.team_size then raise exception '선수 수가 팀 전체 정원을 초과합니다. 팀당 인원 또는 선수 목록을 확인해 주세요.'; end if;
 if exists(select 1 from public.teams t where t.room_id=p_room_id and (select count(*) from public.players cp where cp.room_id=p_room_id and cp.is_captain and cp.captain_team_id=t.id)>r.team_size) then raise exception '팀장 배정만으로 팀 정원을 초과한 팀이 있습니다.'; end if;
 update public.players set team_id=captain_team_id where room_id=p_room_id and is_captain and captain_team_id is not null;
 update public.players set team_id=null where room_id=p_room_id and not is_captain;
 for p in select id,skill_score from public.players where room_id=p_room_id and not is_captain order by skill_score desc,created_at asc,id asc loop
  select t.id into v_team_id from public.teams t where t.room_id=p_room_id and (select count(*) from public.players x where x.room_id=p_room_id and x.team_id=t.id)<r.team_size
  order by coalesce((select sum(x.skill_score) from public.players x where x.room_id=p_room_id and x.team_id=t.id),0),(select count(*) from public.players x where x.room_id=p_room_id and x.team_id=t.id),t.team_number limit 1;
  if v_team_id is null then raise exception '빈자리가 있는 팀을 찾지 못했습니다.'; end if;
  update public.players set team_id=v_team_id where id=p.id;
  v_assigned:=v_assigned+1; v_team_id:=null;
 end loop;
 return '점수 균형 팀 배정 완료 · '||v_assigned||'명 배정 · '||v_team_count||'개 팀';
end; $$;
revoke all on function public.balance_teams_by_score(uuid) from public,anon;
grant execute on function public.balance_teams_by_score(uuid) to authenticated;
