-- 승인 즉시 해당 참여 부의 모든 활성 방에 선수를 등록하고,
-- 승인 이후 누락된 기존 신청자도 중복 없이 보정한다.
create unique index if not exists players_room_discord_user_unique
  on public.players (room_id, discord_user_id)
  where discord_user_id is not null;

create or replace function public.review_room_access_request(
  p_request_id uuid,
  p_status text
) returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_request public.room_access_requests%rowtype;
  v_room public.rooms%rowtype;
  v_profile public.profiles%rowtype;
  v_user auth.users%rowtype;
  v_name text;
  v_grade text := 'B';
  v_price integer;
  v_registered integer := 0;
begin
  if auth.uid() is null
     or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception '처리 상태가 올바르지 않습니다.';
  end if;

  update public.room_access_requests
  set status=p_status, reviewed_by=auth.uid(), reviewed_at=now()
  where id=p_request_id
  returning * into v_request;
  if not found then raise exception '참여 신청을 찾을 수 없습니다.'; end if;

  if p_status='approved' then
    select * into v_profile from public.profiles where id=v_request.user_id;
    select * into v_user from auth.users where id=v_request.user_id;
    v_name := coalesce(
      nullif(trim(v_profile.discord_username), ''),
      nullif(trim(v_user.raw_user_meta_data->>'user_name'), ''),
      nullif(trim(v_user.raw_user_meta_data->>'preferred_username'), ''),
      nullif(trim(v_user.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(v_user.raw_user_meta_data->>'name'), ''),
      nullif(trim(v_user.raw_user_meta_data->'custom_claims'->>'global_name'), ''),
      nullif(trim(v_user.email), ''),
      'Discord 사용자'
    );

    for v_room in
      select * from public.rooms
      where status <> 'finished'
        and (
          (v_request.requested_part='both' and event_part in ('part1','part2'))
          or event_part=v_request.requested_part
        )
      order by created_at
    loop
      if exists(select 1 from public.teams
        where room_id=v_room.id and captain_user_id=v_request.user_id) then
        continue;
      end if;

      v_price := coalesce((v_room.grade_prices->>v_grade)::integer,4);
      insert into public.players
        (room_id,name,grade,start_price,status,is_captain,discord_user_id)
      values
        (v_room.id,v_name,v_grade,greatest(v_price,1),'available',false,v_request.user_id)
      on conflict (room_id,discord_user_id)
        where discord_user_id is not null
        do nothing;
      if found then v_registered := v_registered + 1; end if;
    end loop;
  end if;

  return case
    when p_status='approved' then
      '참여 신청을 승인했습니다. 해당 참여 부의 미등록 방에 선수를 자동 등록했습니다. (신규 등록 방 ' || v_registered || '개)'
    else '신청을 반려했습니다.'
  end;
end;
$function$;

-- 참여 부가 지정되지 않은 기존 방은 승인된 사용자에게 접근을 허용한다.
create or replace function public.has_room_part_access(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when auth.uid() is null then false
    when exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then true
    when not exists(select 1 from public.rooms r where r.id=p_room_id) then false
    when (select r.event_part from public.rooms r where r.id=p_room_id) is null then
      exists(select 1 from public.room_access_requests a
        where a.user_id=auth.uid() and a.status='approved')
    else exists(
      select 1 from public.room_access_requests a
      join public.rooms r on r.id=p_room_id
      where a.user_id=auth.uid() and a.status='approved'
        and (a.requested_part='both' or a.requested_part=r.event_part)
    )
  end
$function$;
