-- Global event bulletin board independent of auction and score rooms.
create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 150),
  content text not null check (char_length(trim(content)) between 1 and 4000),
  event_date timestamptz,
  signup_deadline timestamptz,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_announcements enable row level security;
drop policy if exists "Authenticated users can read community announcements" on public.community_announcements;
drop policy if exists "Admins can insert community announcements" on public.community_announcements;
drop policy if exists "Admins can update community announcements" on public.community_announcements;
drop policy if exists "Admins can delete community announcements" on public.community_announcements;
create policy "Authenticated users can read community announcements" on public.community_announcements for select to authenticated using (true);
create policy "Admins can insert community announcements" on public.community_announcements for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "Admins can update community announcements" on public.community_announcements for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "Admins can delete community announcements" on public.community_announcements for delete to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
grant select, insert, update, delete on public.community_announcements to authenticated;
