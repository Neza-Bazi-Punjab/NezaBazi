-- Revert 20261110150000_scoring_auto_teams.sql.
--
-- Teams go back to Manual only: no Start teams, no team check-in trigger,
-- team draws are shuffled again. Then re-run, in order,
-- 20261110130000_scoring_auto_next_round.sql and
-- 20261110140000_scoring_auto_qualifying.sql to restore their Singles-only
-- Start / Undo next round and Next step. Rounds already made stay.

drop trigger if exists scoring_on_team_check_in on public.team_members;
drop function if exists public.scoring_on_team_check_in();
drop function if exists public.scoring_auto_place_team(uuid, uuid);
drop function if exists public.scoring_start_teams(uuid, text, text);
drop function if exists public.scoring_set_engine_mode(text, boolean, uuid, text, text);
drop function if exists public.scoring_next_step(text);

-- The shared plan stops handing teams to the team plan.
do $patch$
declare
  target_function constant regprocedure := pg_catalog.to_regprocedure('public.scoring_next_round_plan(uuid)');
  original constant text :=
    E'  if v_round.event_type <> \'single\' then\n'
    || E'    return v_base || jsonb_build_object(\n'
    || E'      \'state\', \'manual\',\n'
    || E'      \'message\', \'Section rounds are run by hand on this page.\'\n'
    || E'    );\n'
    || E'  end if;\n';
  patched constant text :=
    E'  if v_round.event_type <> \'single\' then\n'
    || E'    -- Teams follow their own rules (20261110150000).\n'
    || E'    return public.scoring_next_team_round_plan(p_round_id);\n'
    || E'  end if;\n';
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

drop function if exists public.scoring_next_team_round_plan(uuid);
drop function if exists public.scoring_team_target(integer);

-- Team draws are shuffled again.
do $patch$
declare
  target_function constant regprocedure :=
    pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)');
  original constant text :=
    E'      select coalesce(array_agg(team.id order by random()), \'{}\'::uuid[])\n'
    || E'      into v_entrant_ids\n'
    || E'      from public.teams as team\n'
    || E'      where (\'team:\' || team.id::text) in (\n';
  patched constant text :=
    E'      -- Keep the previous round\'s team order: no shuffle (20261110150000).\n'
    || E'      select coalesce(\n'
    || E'        array_agg(\n'
    || E'          team.id\n'
    || E'          order by (\n'
    || E'            select min(prior.run_order)\n'
    || E'            from public.scoring_runs as prior\n'
    || E'            where prior.round_id = v_previous.id\n'
    || E'              and prior.entrant_key = \'team:\' || team.id::text\n'
    || E'          ),\n'
    || E'          team.id\n'
    || E'        ),\n'
    || E'        \'{}\'::uuid[]\n'
    || E'      )\n'
    || E'      into v_entrant_ids\n'
    || E'      from public.teams as team\n'
    || E'      where (\'team:\' || team.id::text) in (\n';
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

update public.scoring_rounds set stage = null where stage = 'section';

alter table public.scoring_rounds drop constraint if exists scoring_rounds_stage_check;
alter table public.scoring_rounds
  add constraint scoring_rounds_stage_check
  check (stage is null or stage in ('qualifier', 'aarhi', 'final', 'rideoff'));

alter table public.scoring_engine_switch drop column if exists teams_auto_on;

notify pgrst, 'reload schema';
