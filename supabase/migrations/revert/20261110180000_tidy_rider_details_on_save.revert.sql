-- Undo for 20261110180000_tidy_rider_details_on_save.sql: removes the
-- tidy_rider_details trigger from solo_registrations, team_members and teams,
-- and the four functions behind it.
--
-- Riders' details stay exactly as they are stored; from then on entries are
-- saved as typed again.
--
-- Run by hand only; never applied automatically. Idempotent: every statement
-- is "if exists".

drop trigger if exists tidy_rider_details on public.solo_registrations;
drop trigger if exists tidy_rider_details on public.team_members;
drop trigger if exists tidy_rider_details on public.teams;

drop function if exists public.tidy_rider_details();
drop function if exists public.tidy_rider_breed(text);
drop function if exists public.tidy_rider_location(text);
drop function if exists public.tidy_rider_text(text);

notify pgrst, 'reload schema';
