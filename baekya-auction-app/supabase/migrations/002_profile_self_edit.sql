-- Allow each signed-in user to edit only their own public profile fields.
-- Role is intentionally excluded from column-level UPDATE privileges.
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant update (discord_username, avatar_url) on public.profiles to authenticated;
