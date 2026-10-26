alter table public.players add column if not exists game_profiles jsonb not null default '[]'::jsonb;
comment on column public.players.game_profiles is 'Per-player profiles for multiple games; array of objects with game, position, tier, favorites, and notes.';
alter table public.players drop constraint if exists players_game_profiles_is_array;
alter table public.players add constraint players_game_profiles_is_array check (jsonb_typeof(game_profiles) = 'array');
