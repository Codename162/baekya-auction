-- 백야 AUCTION schema. Run in Supabase SQL Editor as project owner.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_username text,
  avatar_url text,
  role text not null default 'participant' check (role in ('participant','captain','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.sync_auth_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, discord_username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name', new.email),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update set
    discord_username = excluded.discord_username,
    avatar_url = excluded.avatar_url;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert or update of raw_user_meta_data on auth.users
for each row execute procedure public.sync_auth_profile();

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default '백야 롤 내전',
  status text not null default 'setup' check (status in ('setup','running','paused','finished')),
  budget_per_team integer not null default 30 check (budget_per_team >= 0),
  team_size integer not null default 5 check (team_size between 2 and 10),
  current_player_id uuid,
  current_bid integer,
  highest_team_id uuid,
  admin_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_number integer not null check (team_number between 1 and 3),
  name text not null,
  captain_user_id uuid references auth.users(id),
  captain_name text,
  budget integer not null default 30 check (budget >= 0),
  created_at timestamptz not null default now(),
  unique(room_id, team_number),
  unique(room_id, captain_user_id)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  grade text not null check (grade in ('S','A','B','C','D')),
  start_price integer not null check (start_price >= 1),
  is_captain boolean not null default false,
  captain_team_id uuid references public.teams(id),
  team_id uuid references public.teams(id),
  sold_price integer,
  status text not null default 'available' check (status in ('available','auctioning','sold','passed')),
  created_at timestamptz not null default now()
);
alter table public.rooms drop constraint if exists rooms_current_player_id_fkey;
alter table public.rooms add constraint rooms_current_player_id_fkey foreign key (current_player_id) references public.players(id) on delete set null;
alter table public.rooms drop constraint if exists rooms_highest_team_id_fkey;
alter table public.rooms add constraint rooms_highest_team_id_fkey foreign key (highest_team_id) references public.teams(id) on delete set null;

create table if not exists public.bids (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  bidder_user_id uuid not null references auth.users(id),
  amount integer not null check (amount >= 1),
  created_at timestamptz not null default now()
);
create table if not exists public.auction_history (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id),
  player_name text not null,
  grade text not null,
  team_id uuid not null references public.teams(id),
  team_name text not null,
  price integer not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_room_admin(p_room_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
  or exists(select 1 from public.rooms r where r.id=p_room_id and r.admin_user_id=auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.bids enable row level security;
alter table public.auction_history enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "rooms readable by authenticated" on public.rooms;
create policy "rooms readable by authenticated" on public.rooms for select to authenticated using (true);
drop policy if exists "teams readable by authenticated" on public.teams;
create policy "teams readable by authenticated" on public.teams for select to authenticated using (true);
drop policy if exists "players readable by authenticated" on public.players;
create policy "players readable by authenticated" on public.players for select to authenticated using (true);
drop policy if exists "admins insert players" on public.players;
create policy "admins insert players" on public.players for insert to authenticated with check (public.is_room_admin(room_id));
drop policy if exists "admins update players" on public.players;
create policy "admins update players" on public.players for update to authenticated using (public.is_room_admin(room_id)) with check (public.is_room_admin(room_id));
drop policy if exists "bids readable by authenticated" on public.bids;
create policy "bids readable by authenticated" on public.bids for select to authenticated using (true);
drop policy if exists "history readable by authenticated" on public.auction_history;
create policy "history readable by authenticated" on public.auction_history for select to authenticated using (true);
drop policy if exists "admins update teams" on public.teams;
create policy "admins update teams" on public.teams for update to authenticated using (public.is_room_admin(room_id)) with check (public.is_room_admin(room_id));


create or replace function public.assign_team_captain(p_room_id uuid, p_team_id uuid, p_user_id uuid, p_grade text default 'B') returns text
language plpgsql security definer set search_path=public as $$
declare r public.rooms%rowtype; t public.teams%rowtype; prof public.profiles%rowtype; captain_name text;
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_grade not in ('S','A','B','C','D') then raise exception '잘못된 등급입니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  select * into t from public.teams where id=p_team_id and room_id=p_room_id for update;
  if not found then raise exception '팀을 찾을 수 없습니다.'; end if;
  select * into prof from public.profiles where id=p_user_id;
  if not found then raise exception '해당 사용자가 아직 디스코드 로그인을 하지 않았습니다.'; end if;
  if exists(select 1 from public.teams where room_id=p_room_id and captain_user_id=p_user_id and id<>p_team_id) then raise exception '해당 사용자는 이미 다른 팀의 팀장입니다.'; end if;
  delete from public.players where room_id=p_room_id and is_captain=true and captain_team_id=p_team_id;
  captain_name := coalesce(prof.discord_username, '팀장');
  update public.teams set captain_user_id=p_user_id,captain_name=captain_name where id=p_team_id;
  update public.profiles set role='captain' where id=p_user_id and role<>'admin';
  insert into public.players(room_id,name,grade,start_price,is_captain,captain_team_id,team_id,sold_price,status)
  values(p_room_id,captain_name,p_grade,case p_grade when 'S' then 8 when 'A' then 6 when 'B' then 4 when 'C' then 3 else 1 end,true,p_team_id,p_team_id,0,'sold');
  return captain_name || ' 사용자를 ' || t.name || ' 팀장으로 지정했습니다.';
end; $$;

create or replace function public.place_bid(p_room_id uuid, p_team_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r public.rooms%rowtype; t public.teams%rowtype; p public.players%rowtype; next_amount integer;
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
  if t.budget-next_amount < greatest(0, r.team_size - (select count(*) from public.players where team_id=p_team_id) - 1) then raise exception '남은 팀원 자리를 채울 최소 1P씩은 남겨야 합니다.'; end if;
  insert into public.bids(room_id,player_id,team_id,bidder_user_id,amount) values(p_room_id,p.id,p_team_id,auth.uid(),next_amount);
  update public.rooms set current_bid=next_amount, highest_team_id=p_team_id where id=p_room_id;
  return t.name || ' 팀이 ' || p.name || ' 선수에게 ' || next_amount || 'P 입찰했습니다.';
end; $$;

create or replace function public.select_auction_player(p_room_id uuid, p_player_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r public.rooms%rowtype; p public.players%rowtype;
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if r.status <> 'running' then raise exception '먼저 경매를 시작해 주세요.'; end if;
  if r.current_player_id is not null then raise exception '현재 선수의 낙찰 또는 유찰을 먼저 처리해 주세요.'; end if;
  select * into p from public.players where id=p_player_id and room_id=p_room_id for update;
  if not found or p.status <> 'available' or p.is_captain then raise exception '선택할 수 없는 선수입니다.'; end if;
  update public.players set status='auctioning' where id=p.id;
  update public.rooms set current_player_id=p.id,current_bid=null,highest_team_id=null where id=p_room_id;
  return p.name || ' 선수 경매를 시작했습니다.';
end; $$;

create or replace function public.award_current_player(p_room_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r public.rooms%rowtype; p public.players%rowtype; t public.teams%rowtype; final_price integer;
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if r.current_player_id is null or r.highest_team_id is null or r.current_bid is null then raise exception '낙찰할 입찰이 없습니다.'; end if;
  select * into p from public.players where id=r.current_player_id for update;
  select * into t from public.teams where id=r.highest_team_id for update;
  final_price := r.current_bid;
  if t.budget < final_price then raise exception '팀 예산이 부족합니다.'; end if;
  update public.teams set budget=budget-final_price where id=t.id;
  update public.players set status='sold',team_id=t.id,sold_price=final_price where id=p.id;
  insert into public.auction_history(room_id,player_id,player_name,grade,team_id,team_name,price)
  values(p_room_id,p.id,p.name,p.grade,t.id,t.name,final_price);
  update public.rooms set current_player_id=null,current_bid=null,highest_team_id=null where id=p_room_id;
  return p.name || ' 선수가 ' || t.name || ' 팀에 ' || final_price || 'P로 낙찰되었습니다.';
end; $$;

create or replace function public.pass_current_player(p_room_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r public.rooms%rowtype;
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if r.current_player_id is null then raise exception '현재 경매 선수가 없습니다.'; end if;
  if r.highest_team_id is not null then raise exception '입찰이 존재합니다. 낙찰을 확정하거나 입찰을 취소한 뒤 처리하세요.'; end if;
  update public.players set status='passed' where id=r.current_player_id;
  update public.rooms set current_player_id=null,current_bid=null,highest_team_id=null where id=p_room_id;
  return '유찰 처리했습니다.';
end; $$;

create or replace function public.set_auction_status(p_room_id uuid, p_status text) returns text
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_room_admin(p_room_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_status not in ('setup','running','paused','finished') then raise exception '잘못된 경매 상태입니다.'; end if;
  update public.rooms set status=p_status where id=p_room_id;
  return '경매 상태: ' || p_status;
end; $$;

-- Create the default room and three teams. Use this UUID as VITE_ROOM_ID.
insert into public.rooms(id,name,status,budget_per_team,team_size)
values ('bace0000-0000-4000-8000-000000000001','백야 롤 내전','setup',30,5)
on conflict (id) do nothing;
insert into public.teams(room_id,team_number,name,budget)
select 'bace0000-0000-4000-8000-000000000001'::uuid, n, n||'팀', 30 from generate_series(1,3) n
on conflict (room_id,team_number) do nothing;

-- Seed 12 sample players; edit/delete these after setup if needed.
insert into public.players(room_id,name,grade,start_price,is_captain,status)
select 'bace0000-0000-4000-8000-000000000001'::uuid, x.name, x.grade, x.price, false, 'available'
from (values
 ('흑야','S',8),('잔향','A',6),('유성','B',4),('몽환','B',4),('달무리','B',4),('설야','C',3),('푸른밤','C',3),('별빛','C',3),('야화','D',1),('운월','D',1),('새벽녘','D',1),('흰달','B',4)
) as x(name,grade,price)
where not exists(select 1 from public.players p where p.room_id='bace0000-0000-4000-8000-000000000001' and p.name=x.name);

-- Enable Supabase Realtime for live updates.
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.teams;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.bids;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.auction_history;
exception when duplicate_object then null; when others then null; end $$;

grant execute on function public.assign_team_captain(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.place_bid(uuid,uuid) to authenticated;
grant execute on function public.select_auction_player(uuid,uuid) to authenticated;
grant execute on function public.award_current_player(uuid) to authenticated;
grant execute on function public.pass_current_player(uuid) to authenticated;
grant execute on function public.set_auction_status(uuid,text) to authenticated;

grant select on public.profiles, public.rooms, public.teams, public.players, public.bids, public.auction_history to authenticated;
grant insert on public.players to authenticated;
grant update on public.teams to authenticated;
