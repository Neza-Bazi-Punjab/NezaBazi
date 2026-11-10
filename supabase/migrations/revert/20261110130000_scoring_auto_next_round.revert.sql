-- REVERT ORDER (review of 10 Nov 2026): revert 20261110150000 and then
-- 20261110140000 before this file. Their functions and check-in triggers use
-- the table and columns dropped here, and would fail (silently, for the
-- check-in triggers) once they are gone.
do $revert_order$
begin
  if exists (
    select 1 from pg_catalog.pg_proc as procedure
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.proname in ('scoring_start_qualifying', 'scoring_start_teams')
  ) then
    raise exception 'Revert 20261110150000 and 20261110140000 first.';
  end if;
end
$revert_order$;

-- Revert 20261110130000_scoring_auto_next_round.sql.
--
-- The next Single round is shuffled again, the engine's functions and its
-- switch are removed, and the stage / parent_round_id columns are dropped.
-- Rounds the engine made stay as ordinary rounds; "Auto:" override rows stay
-- (they are ordinary overrides).

do $patch$
declare
  target_function constant regprocedure :=
    pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)');
  original constant text :=
    E'      select coalesce(array_agg(registration.id order by random()), \'{}\'::uuid[])\n'
    || E'      into v_entrant_ids\n'
    || E'      from public.solo_registrations as registration\n'
    || E'      where (\'solo:\' || registration.id::text) in (\n';
  patched constant text :=
    E'      -- Keep the previous round\'s start order: no shuffle (20261110130000).\n'
    || E'      select coalesce(\n'
    || E'        array_agg(\n'
    || E'          registration.id\n'
    || E'          order by (\n'
    || E'            select min(prior.run_order)\n'
    || E'            from public.scoring_runs as prior\n'
    || E'            where prior.round_id = v_previous.id\n'
    || E'              and prior.entrant_key = \'solo:\' || registration.id::text\n'
    || E'          ),\n'
    || E'          registration.id\n'
    || E'        ),\n'
    || E'        \'{}\'::uuid[]\n'
    || E'      )\n'
    || E'      into v_entrant_ids\n'
    || E'      from public.solo_registrations as registration\n'
    || E'      where (\'solo:\' || registration.id::text) in (\n';
  definition text;
begin
  if target_function is null then
    return;
  end if;

  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(patched in definition) > 0 then
    execute replace(definition, patched, original);
  end if;
end
$patch$;

revoke execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  to service_role;

drop function if exists public.scoring_undo_next_round(uuid, uuid, text, text);
drop function if exists public.scoring_start_next_round(uuid, uuid, text, text);
drop function if exists public.scoring_next_step();
drop function if exists public.scoring_next_round_plan(uuid);
drop function if exists public.scoring_set_auto_engine(boolean, uuid, text, text);
drop table if exists public.scoring_engine_switch;

alter table public.scoring_rounds drop column if exists parent_round_id;
alter table public.scoring_rounds drop column if exists stage;

notify pgrst, 'reload schema';
