-- Revert 20261110140000_scoring_auto_qualifying.sql.
--
-- Check-in stops filling the qualifying pools, Start qualifying and the desk
-- pool lookup go. Undo and the Next step go back to their 20261110130000
-- versions: re-run 20261110130000_scoring_auto_next_round.sql after this
-- file. Rounds and runs already made stay as they are.

drop trigger if exists scoring_on_solo_check_in on public.solo_registrations;
drop function if exists public.scoring_on_solo_check_in();
drop function if exists public.scoring_auto_place_rider(uuid, boolean, uuid);
drop function if exists public.scoring_start_qualifying(uuid, text, text);
drop function if exists public.scoring_desk_pool(text);

notify pgrst, 'reload schema';
