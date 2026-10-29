-- Let authenticated members edit only the game-profile fields of their own linked player row.
-- A trigger prevents changing player identity, grade, auction state, or team assignment.
drop policy if exists "players update own game profile" on public.players;
create policy "players update own game profile"
  on public.players for update to authenticated
  using (discord_user_id = (select auth.uid()))
  with check (discord_user_id = (select auth.uid()));

create or replace function public.guard_player_self_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_room_admin(old.room_id) then
    return new;
  end if;

  if old.discord_user_id is distinct from (select auth.uid()) then
    raise exception '본인 계정에 연결된 선수 프로필만 수정할 수 있습니다.';
  end if;

  if (to_jsonb(new) - array['game_profiles','main_position','tier','favorite_champions'])
     is distinct from
     (to_jsonb(old) - array['game_profiles','main_position','tier','favorite_champions']) then
    raise exception '게임 프로필 항목만 수정할 수 있습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_player_self_profile_update on public.players;
create trigger guard_player_self_profile_update
before update on public.players
for each row execute function public.guard_player_self_profile_update();
