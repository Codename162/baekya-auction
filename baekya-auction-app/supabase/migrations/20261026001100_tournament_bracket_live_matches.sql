create table if not exists public.tournament_matches (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 tournament_name text not null default '백야 내전',
 round_number integer not null default 1 check(round_number>0),
 match_number integer not null default 1 check(match_number>0),
 team_a text not null, team_b text not null,
 score_a integer not null default 0 check(score_a>=0),
 score_b integer not null default 0 check(score_b>=0),
 status text not null default 'scheduled' check(status in ('scheduled','live','finished')),
 winner text, scheduled_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tournament_matches_room_round_idx on public.tournament_matches(room_id,round_number,match_number);
alter table public.tournament_matches enable row level security;
drop policy if exists "authenticated can view tournament matches" on public.tournament_matches;
create policy "authenticated can view tournament matches" on public.tournament_matches for select to authenticated using(true);
drop policy if exists "room admins create tournament matches" on public.tournament_matches;
create policy "room admins create tournament matches" on public.tournament_matches for insert to authenticated with check(public.is_room_admin(room_id) and (created_by is null or created_by=auth.uid()));
drop policy if exists "room admins update tournament matches" on public.tournament_matches;
create policy "room admins update tournament matches" on public.tournament_matches for update to authenticated using(public.is_room_admin(room_id)) with check(public.is_room_admin(room_id));
drop policy if exists "room admins delete tournament matches" on public.tournament_matches;
create policy "room admins delete tournament matches" on public.tournament_matches for delete to authenticated using(public.is_room_admin(room_id));

do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tournament_matches') then
  alter publication supabase_realtime add table public.tournament_matches;
 end if;
end $$;
grant select,insert,update,delete on public.tournament_matches to authenticated;
