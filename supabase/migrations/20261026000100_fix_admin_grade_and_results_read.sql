do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tournament_results' and policyname='Tournament results readable by authenticated') then
    create policy "Tournament results readable by authenticated" on public.tournament_results for select to authenticated using (true);
  end if;
end $$;

create or replace function public.set_member_global_grade(p_discord_user_id uuid, p_grade text)
returns text language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_grade not in ('S','A','B','C','D') then raise exception '잘못된 등급입니다.'; end if;
  if not exists (select 1 from public.profiles where id=p_discord_user_id) then raise exception '멤버 프로필을 찾을 수 없습니다.'; end if;
  update public.profiles set grade=p_grade where id=p_discord_user_id;
  update public.players p set grade=p_grade,
    start_price=case when p.status='available' then coalesce(
      (select (r.grade_prices->>p_grade)::integer from public.rooms r where r.id=p.room_id),
      case p_grade when 'S' then 8 when 'A' then 6 when 'B' then 4 when 'C' then 3 else 1 end
    ) else p.start_price end
  where p.discord_user_id=p_discord_user_id and coalesce(p.is_captain,false)=false;
  get diagnostics v_count=row_count;
  return '멤버 기본 등급과 연결된 '||v_count||'개 선수 기록을 '||p_grade||'급으로 변경했습니다.';
end;
$$;
revoke all on function public.set_member_global_grade(uuid,text) from public, anon;
grant execute on function public.set_member_global_grade(uuid,text) to authenticated;