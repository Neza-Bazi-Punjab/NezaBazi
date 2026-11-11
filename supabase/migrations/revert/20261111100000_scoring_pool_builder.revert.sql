-- Revert 20261111100000_scoring_pool_builder.sql.
--
-- "Save start list" on /admin/scoring stops working (the page reports the
-- error); drawing, moving and adding entrants are unchanged. Start lists
-- already saved stay as they are: they are ordinary runs.

drop function if exists public.scoring_save_start_list(uuid, jsonb, uuid, text, text);

notify pgrst, 'reload schema';
