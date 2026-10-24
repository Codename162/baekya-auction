-- Spectator prediction events for Baekya Auction
alter table public.profiles add column if not exists points integer not null default 0 check (points >= 0);
create table if not exists public.spectator_events (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
 title text not null default '백야 관전자 이벤트' check (char_length(title) between 2 and 100),
 starts_at timestamptz not null, status text not null default 'open' check (status in ('open','locked','settled','cancelled')),
 winner_team_id uuid references public.teams(id) on delete set null, mvp_player_id uuid references public.players(id) on delete set null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), settled_at timestamptz
);
create index if not exists spectator_events_room_created_idx on public.spectator_events(room_id, created_at desc);
create table if not exists public.spectator_predictions (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.spectator_events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, predicted_team_id uuid not null references public.teams(id),
 predicted_mvp_player_id uuid not null references public.players(id), created_at timestamptz not null default now(), unique(event_id,user_id)
);
create index if not exists spectator_predictions_event_idx on public.spectator_predictions(event_id);
create table if not exists public.spectator_point_awards (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.spectator_events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, points integer not null check (points > 0),
 reason text not null default '관전자 예측 보상', created_at timestamptz not null default now(), unique(event_id,user_id)
);
alter table public.spectator_events enable row level security;
alter table public.spectator_predictions enable row level security;
alter table public.spectator_point_awards enable row level security;
drop policy if exists "spectator events readable by authenticated" on public.spectator_events;
create policy "spectator events readable by authenticated" on public.spectator_events for select to authenticated using (true);
drop policy if exists "users read own spectator predictions" on public.spectator_predictions;
create policy "users read own spectator predictions" on public.spectator_predictions for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.spectator_events e where e.id=event_id and public.is_room_admin(e.room_id)));
drop policy if exists "users read own spectator point awards" on public.spectator_point_awards;
create policy "users read own spectator point awards" on public.spectator_point_awards for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.spectator_events e where e.id=event_id and public.is_room_admin(e.room_id)));
create or replace function public.create_spectator_event(p_room_id uuid,p_title text,p_starts_at timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
 if auth.uid() is null or not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 if p_title is null or char_length(trim(p_title))<2 or char_length(trim(p_title))>100 then raise exception '이벤트 이름은 2~100자로 입력해 주세요.'; end if;
 if p_starts_at is null or p_starts_at<=now() then raise exception '예측 마감 시간은 현재보다 뒤로 설정해 주세요.'; end if;
 insert into public.spectator_events(room_id,title,starts_at,created_by) values(p_room_id,trim(p_title),p_starts_at,auth.uid()) returning id into new_id;
 return new_id;
end; $$;
create or replace function public.submit_spectator_prediction(p_event_id uuid,p_team_id uuid,p_mvp_player_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare e public.spectator_events%rowtype;
begin
 if auth.uid() is null then raise exception '먼저 로그인해 주세요.'; end if;
 select * into e from public.spectator_events where id=p_event_id for update;
 if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
 if e.status<>'open' or now()>=e.starts_at then raise exception '예측 접수가 마감되었습니다.'; end if;
 if exists(select 1 from public.teams t where t.room_id=e.room_id and t.captain_user_id=auth.uid()) then raise exception '해당 내전의 팀장은 관전자 예측에 참여할 수 없습니다.'; end if;
 if not exists(select 1 from public.teams t where t.id=p_team_id and t.room_id=e.room_id) then raise exception '선택한 팀이 이 경기에 속하지 않습니다.'; end if;
 if not exists(select 1 from public.players p where p.id=p_mvp_player_id and p.room_id=e.room_id) then raise exception '선택한 MVP 후보가 이 경기에 속하지 않습니다.'; end if;
 insert into public.spectator_predictions(event_id,user_id,predicted_team_id,predicted_mvp_player_id) values(p_event_id,auth.uid(),p_team_id,p_mvp_player_id);
 return '예측을 제출했습니다. 제출 후에는 수정할 수 없습니다.';
exception when unique_violation then raise exception '이미 이 이벤트에 예측을 제출했습니다.';
end; $$;
create or replace function public.lock_spectator_event(p_event_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare e public.spectator_events%rowtype;
begin
 select * into e from public.spectator_events where id=p_event_id for update;
 if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not public.is_room_admin(e.room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 if e.status<>'open' then raise exception '접수 중인 이벤트만 마감할 수 있습니다.'; end if;
 update public.spectator_events set status='locked' where id=p_event_id; return '예측 접수를 마감했습니다.';
end; $$;
create or replace function public.settle_spectator_event(p_event_id uuid,p_winner_team_id uuid,p_mvp_player_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare e public.spectator_events%rowtype; pred record; award_points integer; winners integer:=0;
begin
 select * into e from public.spectator_events where id=p_event_id for update;
 if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not public.is_room_admin(e.room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 if e.status not in ('open','locked') then raise exception '이미 정산되었거나 취소된 이벤트입니다.'; end if;
 if now()<e.starts_at and e.status='open' then raise exception '예측 마감 시간 이후에 결과를 확정해 주세요.'; end if;
 if not exists(select 1 from public.teams t where t.id=p_winner_team_id and t.room_id=e.room_id) then raise exception '승리 팀이 이 경기에 속하지 않습니다.'; end if;
 if not exists(select 1 from public.players p where p.id=p_mvp_player_id and p.room_id=e.room_id) then raise exception 'MVP가 이 경기에 속하지 않습니다.'; end if;
 update public.spectator_events set status='settled',winner_team_id=p_winner_team_id,mvp_player_id=p_mvp_player_id,settled_at=now() where id=p_event_id;
 for pred in select * from public.spectator_predictions where event_id=p_event_id loop
  award_points := (case when pred.predicted_team_id=p_winner_team_id then 5 else 0 end)+(case when pred.predicted_mvp_player_id=p_mvp_player_id then 5 else 0 end)+(case when pred.predicted_team_id=p_winner_team_id and pred.predicted_mvp_player_id=p_mvp_player_id then 3 else 0 end);
  if award_points>0 then
   insert into public.spectator_point_awards(event_id,user_id,points,reason) values(p_event_id,pred.user_id,award_points,'관전자 예측 보상') on conflict(event_id,user_id) do nothing;
   if found then update public.profiles set points=points+award_points where id=pred.user_id; winners:=winners+1; end if;
  end if;
 end loop;
 return '이벤트 정산 완료 · 보상 대상 '||winners||'명';
end; $$;
create or replace function public.cancel_spectator_event(p_event_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare e public.spectator_events%rowtype;
begin
 select * into e from public.spectator_events where id=p_event_id for update;
 if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not public.is_room_admin(e.room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 if e.status in ('settled','cancelled') then raise exception '이미 정산되었거나 취소된 이벤트입니다.'; end if;
 update public.spectator_events set status='cancelled' where id=p_event_id; return '이벤트를 취소했습니다.';
end; $$;
revoke all on function public.create_spectator_event(uuid,text,timestamptz) from public,anon;
revoke all on function public.submit_spectator_prediction(uuid,uuid,uuid) from public,anon;
revoke all on function public.lock_spectator_event(uuid) from public,anon;
revoke all on function public.settle_spectator_event(uuid,uuid,uuid) from public,anon;
revoke all on function public.cancel_spectator_event(uuid) from public,anon;
grant execute on function public.create_spectator_event(uuid,text,timestamptz) to authenticated;
grant execute on function public.submit_spectator_prediction(uuid,uuid,uuid) to authenticated;
grant execute on function public.lock_spectator_event(uuid) to authenticated;
grant execute on function public.settle_spectator_event(uuid,uuid,uuid) to authenticated;
grant execute on function public.cancel_spectator_event(uuid) to authenticated;
grant select on public.spectator_events,public.spectator_predictions,public.spectator_point_awards to authenticated;
do $$ begin alter publication supabase_realtime add table public.spectator_events;
exception when duplicate_object then null; when others then null; end $$;
