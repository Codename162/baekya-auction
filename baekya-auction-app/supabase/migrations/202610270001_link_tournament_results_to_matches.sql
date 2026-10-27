ALTER TABLE public.tournament_results ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.tournament_matches(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tournament_results_match_id_uidx ON public.tournament_results (match_id) WHERE match_id IS NOT NULL;
