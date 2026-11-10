-- Live scoring: Automatic mode for Teams (Section tent pegging).
--
-- Plan: docs/superpowers/plans/2026-11-10-auto-scoring-engine.md, section 6.
-- Apply after 20261110130000_scoring_auto_next_round.sql and
-- 20261110140000_scoring_auto_qualifying.sql. Singles behave exactly as
-- before.
--
--   1. Teams get their own Automatic / Manual switch
--      (scoring_engine_switch.teams_auto_on), set with
--      scoring_set_engine_mode('single' | 'section', on, actor…).
--   2. The next team round keeps the previous round's order (no reshuffle).
--   3. scoring_start_teams(actor…): every team with all 4 riders checked in,
--      shuffled once into one queue, "Teams Round 1", target 8.
--   4. What comes next after a team round (scoring_next_team_round_plan):
--        through   total >= the round's target; if no team reaches it, the
--                  team(s) with the highest total ("Auto:" override rows);
--        next      more than 4 through → Teams Round N (12, then 16 Full
--                  House); 4 or fewer → the Teams Final (points decide
--                  places); after the Final → podium by hand for now.
--      A skipped team rider simply scores 0: no block.
--   5. scoring_start_next_round / scoring_undo_next_round /
--      scoring_next_step learn teams (each type checks its own switch).
--   6. A team whose 4th rider checks in while Teams Round 1 is still being
--      ridden joins the end of it (Automatic only). Undoing a check-in that
--      leaves a team incomplete takes it back out, unless it has ridden.
--      Like the singles trigger, this can never make a check-in fail.
--
-- Idempotent. Undo with revert/20261110150000_scoring_auto_teams.revert.sql.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_start_qualifying(uuid, text, text)') is null then
    raise exception 'scoring_start_qualifying not found — apply 20261110140000_scoring_auto_qualifying.sql first.';
  end if;
end
$preconditions$;

-- 1. Switch and stage ----------------------------------------------------------

alter table public.scoring_engine_switch
  add column if not exists teams_auto_on boolean not null default true;

alter table public.scoring_rounds drop constraint if exists scoring_rounds_stage_check;
alter table public.scoring_rounds
  add constraint scoring_rounds_stage_check
  check (stage is null or stage in ('qualifier', 'aarhi', 'final', 'rideoff', 'section'));

create or replace function public.scoring_set_engine_mode(
  p_event_type text,
  p_on boolean,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before boolean;
  v_saved public.scoring_engine_switch%rowtype;
begin
  if p_event_type is null or p_event_type not in ('single', 'section') then
    raise exception 'Choose Singles or Teams.' using errcode = '22023';
  end if;

  if p_on is null then
    raise exception 'Choose Automatic or Manual.' using errcode = '22023';
  end if;

  insert into public.scoring_engine_switch (id) values (true) on conflict (id) do nothing;

  select case when p_event_type = 'single' then engine.auto_on else engine.teams_auto_on end
  into v_before
  from public.scoring_engine_switch as engine
  where engine.id is true
  for update;

  update public.scoring_engine_switch as engine
  set
    auto_on = case when p_event_type = 'single' then p_on else engine.auto_on end,
    teams_auto_on = case when p_event_type = 'section' then p_on else engine.teams_auto_on end,
    changed_at = now(),
    changed_by = left(coalesce(nullif(btrim(p_actor_name), ''), p_actor_email, 'Administrator'), 200)
  where engine.id is true
  returning * into v_saved;

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id, p_actor_name, p_actor_email,
    case when p_on then 'auto_engine_on' else 'auto_engine_off' end,
    'scoring_engine_switch',
    case when p_event_type = 'single' then 'auto_engine' else 'auto_engine_teams' end,
    jsonb_build_object(
      'subject_name', case when p_event_type = 'single' then 'Automatic mode · Singles' else 'Automatic mode · Teams' end,
      'before', v_before,
      'after', p_on
    )
  );

  return jsonb_build_object(
    'auto_on', case when p_event_type = 'single' then v_saved.auto_on else v_saved.teams_auto_on end,
    'changed_at', v_saved.changed_at,
    'changed_by', v_saved.changed_by
  );
end;
$$;

revoke execute on function public.scoring_set_engine_mode(text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_engine_mode(text, boolean, uuid, text, text)
  to service_role;

-- 2. The next team round keeps the order -------------------------------------

do $patch$
declare
  target_function constant regprocedure :=
    pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)');
  anchor constant text :=
    E'      select coalesce(array_agg(team.id order by random()), \'{}\'::uuid[])\n'
    || E'      into v_entrant_ids\n'
    || E'      from public.teams as team\n'
    || E'      where (\'team:\' || team.id::text) in (\n';
  replacement constant text :=
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
  occurrences integer;
begin
  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) > 0 then
    raise notice 'scoring_build_start_list already keeps the team order; left unchanged.';
  else
    occurrences := (
      char_length(definition) - char_length(replace(definition, anchor, ''))
    ) / char_length(anchor);

    if occurrences <> 1 then
      raise exception
        'Could not patch scoring_build_start_list: expected the Section "advanced" draw once, found it % times.',
        occurrences;
    end if;

    execute replace(definition, anchor, replacement);
  end if;

  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) = 0
    or position(E'Keep the previous round\'s start order: no shuffle (20261110130000)' in definition) = 0
    or position('perform public.scoring_renumber_round(p_round_id);' in definition) = 0
  then
    raise exception 'scoring_build_start_list is missing one of its patches.';
  end if;
end
$patch$;

revoke execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  to service_role;

-- 3. Start teams ------------------------------------------------------------------

create or replace function public.scoring_start_teams(
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_auto_on boolean;
  v_existing public.scoring_rounds%rowtype;
  v_sort_order integer;
  v_new_id uuid;
  v_runs_created integer;
  v_teams integer;
begin
  perform public.scoring_lock_live();

  select engine.teams_auto_on into v_auto_on
  from public.scoring_engine_switch as engine
  where engine.id is true;

  if v_auto_on is distinct from true then
    raise exception 'Teams are in Manual mode. Switch Teams to Automatic, or create the round by hand.'
      using errcode = '22023';
  end if;

  select * into v_existing
  from public.scoring_rounds as round
  where round.event_type = 'section'
  order by round.sort_order
  limit 1;

  if found then
    raise exception 'A team round already exists (%). Delete it, or carry on in Manual mode.', v_existing.name
      using errcode = '22023';
  end if;

  select coalesce(max(round.sort_order), 0) + 1
  into v_sort_order
  from public.scoring_rounds as round;

  insert into public.scoring_rounds (
    event_type, name, round_number, attempts_per_rider, target_points,
    status, sort_order, pool_size, stage, parent_round_id
  ) values (
    'section', 'Teams Round 1', 1, 1, 8,
    'upcoming', v_sort_order, null, 'section', null
  )
  returning id into v_new_id;

  -- Every team with all four riders checked in, shuffled once, one queue.
  -- Refused there (and so here, in one transaction) when no team is ready.
  v_runs_created := public.scoring_build_start_list(
    v_new_id, 'all_checked_in', p_actor_id, p_actor_name, p_actor_email
  );

  select count(distinct run.entrant_key)::integer
  into v_teams
  from public.scoring_runs as run
  where run.round_id = v_new_id;

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id, p_actor_name, p_actor_email,
    'start_teams', 'scoring_rounds', v_new_id::text,
    jsonb_build_object('subject_name', 'Teams Round 1', 'teams', v_teams, 'runs', v_runs_created)
  );

  return jsonb_build_object(
    'round_id', v_new_id,
    'round_name', 'Teams Round 1',
    'teams', v_teams,
    'runs_created', v_runs_created
  );
end;
$$;

revoke execute on function public.scoring_start_teams(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_start_teams(uuid, text, text)
  to service_role;

-- 4. What comes next after a team round ---------------------------------------

-- The target for the Nth team round: 8, 12, then 16 (Full House).
create or replace function public.scoring_team_target(p_number integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_number <= 1 then 8 when p_number = 2 then 12 else 16 end;
$$;

revoke execute on function public.scoring_team_target(integer) from public, anon, authenticated;
grant execute on function public.scoring_team_target(integer) to service_role;

create or replace function public.scoring_next_team_round_plan(p_round_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_round public.scoring_rounds%rowtype;
  v_later public.scoring_rounds%rowtype;
  v_stage text;
  v_base jsonb;
  v_total integer;
  v_left integer;
  v_target integer;
  v_number integer;
  v_entrants jsonb;
  v_entrant_count integer;
  v_rule text;
  v_best integer;
  v_through jsonb;
  v_through_count integer;
  v_next_target integer;
begin
  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  v_stage := coalesce(v_round.stage, 'section');

  -- Which team round this is (1, 2, 3 …), counting the Section rounds up to
  -- and including it that are not a Final or ride-off.
  select count(*)::integer
  into v_number
  from public.scoring_rounds as earlier
  where earlier.event_type = 'section'
    and earlier.sort_order <= v_round.sort_order
    and coalesce(earlier.stage, 'section') = 'section';

  v_target := coalesce(v_round.target_points, public.scoring_team_target(v_number));

  v_base := jsonb_build_object(
    'round_id', v_round.id,
    'round_name', v_round.name,
    'stage', v_stage,
    'target', v_target
  );

  select
    count(*)::integer,
    (count(*) filter (where run.status in ('pending', 'on_course')))::integer
  into v_total, v_left
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  if v_total = 0 then
    return v_base || jsonb_build_object(
      'state', 'no_start_list',
      'message', format('Draw the start list for %s first.', v_round.name)
    );
  end if;

  if v_left > 0 then
    return v_base || jsonb_build_object(
      'state', 'riding',
      'left', v_left,
      'total', v_total,
      'message', format('%s of %s rides still to go in %s.', v_left, v_total, v_round.name)
    );
  end if;

  select * into v_later
  from public.scoring_rounds as later
  where later.event_type = 'section'
    and later.sort_order > v_round.sort_order
  order by later.sort_order
  limit 1;

  if found then
    return v_base || jsonb_build_object(
      'state', 'later_round',
      'later_round_name', v_later.name,
      'message', case
        when v_later.parent_round_id = v_round.id then format(
          '%s has already been started from %s.', v_later.name, v_round.name
        )
        else format(
          '%s already comes after %s, so the engine leaves it to you. Delete %s if it is empty to let the engine start the next round.',
          v_later.name, v_round.name, v_later.name
        )
      end
    );
  end if;

  if v_stage in ('final', 'rideoff') then
    return v_base || jsonb_build_object(
      'state', 'placings',
      'message', format('%s is ridden. Its points decide 1st, 2nd and 3rd: set the podium by hand (Manual).', v_round.name)
    );
  end if;

  -- One element per team, in start order, with its total.
  select
    coalesce(jsonb_agg(to_jsonb(entrant) order by entrant.first_order), '[]'::jsonb),
    count(*)::integer
  into v_entrants, v_entrant_count
  from (
    select
      run.entrant_key,
      min(run.run_order) as first_order,
      coalesce((array_agg(run.team_name order by run.run_order))[1], (array_agg(run.rider_name order by run.run_order))[1]) as name,
      coalesce(sum(run.points) filter (where run.status = 'scored'), 0)::integer as total,
      max(advance_override.advanced::integer) as override
    from public.scoring_runs as run
    left join public.scoring_advance_overrides as advance_override
      on advance_override.round_id = run.round_id
     and advance_override.entrant_key = run.entrant_key
    where run.round_id = p_round_id
    group by run.entrant_key
  ) as entrant;

  if exists (
    select 1 from jsonb_array_elements(v_entrants) as element
    where element -> 'override' = 'null'::jsonb
      and (element ->> 'total')::integer >= v_target
  ) then
    v_rule := 'target';
  else
    v_rule := 'highest';

    select max((element ->> 'total')::integer)
    into v_best
    from jsonb_array_elements(v_entrants) as element
    where element -> 'override' = 'null'::jsonb;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entrant_key', element ->> 'entrant_key',
          'name', element ->> 'name',
          'total', (element ->> 'total')::integer,
          'by_override', element -> 'override' <> 'null'::jsonb
        )
        order by (element ->> 'first_order')::integer
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_through, v_through_count
  from jsonb_array_elements(v_entrants) as element
  where case
    when element -> 'override' <> 'null'::jsonb then (element ->> 'override')::integer = 1
    when v_rule = 'target' then (element ->> 'total')::integer >= v_target
    else (element ->> 'total')::integer = v_best
  end;

  v_base := v_base || jsonb_build_object(
    'rule', v_rule,
    'entrant_count', v_entrant_count,
    'through_count', v_through_count,
    'through', v_through
  );

  if v_through_count = 0 then
    return v_base || jsonb_build_object(
      'state', 'nobody_through',
      'message', format('No team goes through from %s. Decide by hand with the overrides (Manual).', v_round.name)
    );
  end if;

  if v_through_count <= 4 then
    return v_base || jsonb_build_object(
      'state', 'ready',
      'next_stage', 'final',
      'next_name', 'Teams Final',
      'next_target', null,
      'first_up', v_through -> 0 ->> 'name',
      'message', case v_rule
        when 'highest' then format('No team reached %s in %s, so the highest total goes through. %s left: the Teams Final is next, and its points decide the places.', v_target, v_round.name, v_through_count)
        else format('%s %s reached %s in %s: the Teams Final is next, and its points decide the places.', v_through_count, case when v_through_count = 1 then 'team' else 'teams' end, v_target, v_round.name)
      end
    );
  end if;

  v_next_target := public.scoring_team_target(v_number + 1);

  return v_base || jsonb_build_object(
    'state', 'ready',
    'next_stage', 'section',
    'next_name', format('Teams Round %s%s', v_number + 1, case when v_next_target = 16 then ' · Full House' else '' end),
    'next_target', v_next_target,
    'first_up', v_through -> 0 ->> 'name',
    'message', case v_rule
      when 'highest' then format('No team reached %s in %s, so the teams with the highest total (%s) go through.', v_target, v_round.name, v_best)
      else format('The teams with %s or more in %s go through.', v_target, v_round.name)
    end
  );
end;
$$;

revoke execute on function public.scoring_next_team_round_plan(uuid) from public, anon, authenticated;
grant execute on function public.scoring_next_team_round_plan(uuid) to service_role;

-- The shared plan hands team rounds to the team plan.
do $patch$
declare
  target_function constant regprocedure := pg_catalog.to_regprocedure('public.scoring_next_round_plan(uuid)');
  anchor constant text :=
    E'  if v_round.event_type <> \'single\' then\n'
    || E'    return v_base || jsonb_build_object(\n'
    || E'      \'state\', \'manual\',\n'
    || E'      \'message\', \'Section rounds are run by hand on this page.\'\n'
    || E'    );\n'
    || E'  end if;\n';
  replacement constant text :=
    E'  if v_round.event_type <> \'single\' then\n'
    || E'    -- Teams follow their own rules (20261110150000).\n'
    || E'    return public.scoring_next_team_round_plan(p_round_id);\n'
    || E'  end if;\n';
  definition text;
begin
  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) = 0 then
    if position(anchor in definition) = 0 then
      raise exception 'Could not patch scoring_next_round_plan: the Section branch was not found.';
    end if;

    execute replace(definition, anchor, replacement);
  end if;

  if position(replacement in pg_catalog.pg_get_functiondef(target_function)) = 0 then
    raise exception 'scoring_next_round_plan does not hand teams to the team plan.';
  end if;
end
$patch$;

revoke execute on function public.scoring_next_round_plan(uuid) from public, anon, authenticated;
grant execute on function public.scoring_next_round_plan(uuid) to service_role;

-- 5. Start / Undo next round and the Next step, for both types ---------------

create or replace function public.scoring_start_next_round(
  p_round_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_note_strike constant text := 'Auto: no 4s this round — the 2s go through.';
  c_note_all_zero constant text := 'Auto: everyone got 0 — all ride again.';
  c_note_highest constant text := 'Auto: no team reached the target — the highest total goes through.';
  v_auto_on boolean;
  v_round public.scoring_rounds%rowtype;
  v_plan jsonb;
  v_rule text;
  v_overrides_written integer := 0;
  v_round_number integer;
  v_sort_order integer;
  v_new_id uuid;
  v_runs_created integer;
begin
  perform public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  select case when v_round.event_type = 'single' then engine.auto_on else engine.teams_auto_on end
  into v_auto_on
  from public.scoring_engine_switch as engine
  where engine.id is true;

  if v_auto_on is distinct from true then
    raise exception '% are in Manual mode. Switch to Automatic, or run the next round by hand.',
      case when v_round.event_type = 'single' then 'Singles' else 'Teams' end
      using errcode = '22023';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  v_plan := public.scoring_next_round_plan(p_round_id);

  if v_plan ->> 'state' <> 'ready' then
    raise exception '%', v_plan ->> 'message' using errcode = '22023';
  end if;

  v_rule := v_plan ->> 'rule';

  -- Through on a fallback rule: recorded as overrides so every screen shows
  -- it. An administrator's own override is never replaced.
  if v_rule in ('strike', 'all_zero', 'highest') then
    insert into public.scoring_advance_overrides (round_id, entrant_key, advanced, note, set_by)
    select
      p_round_id,
      element ->> 'entrant_key',
      true,
      case v_rule
        when 'strike' then c_note_strike
        when 'all_zero' then c_note_all_zero
        else c_note_highest
      end,
      p_actor_id
    from jsonb_array_elements(v_plan -> 'through') as element
    where not (element ->> 'by_override')::boolean
    on conflict (round_id, entrant_key) do nothing;

    get diagnostics v_overrides_written = row_count;
  end if;

  select coalesce(max(round.round_number), 0) + 1
  into v_round_number
  from public.scoring_rounds as round
  where round.event_type = v_round.event_type;

  if v_round_number > 50 then
    raise exception 'There is no room for another round.' using errcode = '22023';
  end if;

  select coalesce(max(round.sort_order), 0) + 1
  into v_sort_order
  from public.scoring_rounds as round;

  insert into public.scoring_rounds (
    event_type, name, round_number, attempts_per_rider, target_points,
    status, sort_order, pool_size, stage, parent_round_id
  ) values (
    v_round.event_type,
    v_plan ->> 'next_name',
    v_round_number,
    1,
    case when v_round.event_type = 'section' then (v_plan ->> 'next_target')::integer else null end,
    'upcoming',
    v_sort_order,
    null,
    v_plan ->> 'next_stage',
    p_round_id
  )
  returning id into v_new_id;

  -- One queue in the previous order, with its own audit row.
  v_runs_created := public.scoring_build_start_list(
    v_new_id, 'advanced', p_actor_id, p_actor_name, p_actor_email
  );

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id, p_actor_name, p_actor_email,
    'start_next_round', 'scoring_rounds', v_new_id::text,
    jsonb_build_object(
      'subject_name', v_plan ->> 'next_name',
      'from_round', v_round.name,
      'from_round_id', p_round_id,
      'rule', v_rule,
      'through', (v_plan ->> 'through_count')::integer,
      'overrides_written', v_overrides_written,
      'runs', v_runs_created
    )
  );

  return jsonb_build_object(
    'round_id', v_new_id,
    'round_name', v_plan ->> 'next_name',
    'stage', v_plan ->> 'next_stage',
    'event_type', v_round.event_type,
    'rule', v_rule,
    'through_count', (v_plan ->> 'through_count')::integer,
    'runs_created', v_runs_created,
    'first_up', v_plan ->> 'first_up'
  );
end;
$$;

revoke execute on function public.scoring_start_next_round(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_start_next_round(uuid, uuid, text, text)
  to service_role;

create or replace function public.scoring_undo_next_round(
  p_round_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_parent_name text;
  v_runs integer;
  v_overrides_removed integer := 0;
begin
  v_live := public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  -- Only rounds the engine made: a next round (parent set), the qualifying
  -- round or Teams Round 1 (stage set by Start qualifying / Start teams).
  if v_round.parent_round_id is null and v_round.stage is distinct from 'qualifier' and v_round.stage is distinct from 'section' then
    raise exception '% was not started by Automatic mode. Delete it by hand if you need to.', v_round.name
      using errcode = '22023';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  if exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.status in ('scored', 'on_course')
  ) then
    raise exception 'Riding has started in %, so it cannot be undone. Fix who goes through with the overrides instead.', v_round.name
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.scoring_rounds as later
    where later.event_type = v_round.event_type
      and later.sort_order > v_round.sort_order
  ) then
    raise exception 'Another round comes after %. Undo that one first.', v_round.name
      using errcode = '22023';
  end if;

  select round.name into v_parent_name
  from public.scoring_rounds as round
  where round.id = v_round.parent_round_id;

  select count(*)::integer into v_runs
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  if v_round.parent_round_id is not null then
    delete from public.scoring_advance_overrides as advance_override
    where advance_override.round_id = v_round.parent_round_id
      and advance_override.note in (
        'Auto: no 4s this round — the 2s go through.',
        'Auto: everyone got 0 — all ride again.',
        'Auto: no team reached the target — the highest total goes through.'
      );

    get diagnostics v_overrides_removed = row_count;
  end if;

  if v_live.current_round_id = p_round_id then
    update public.scoring_live_state as live
    set
      current_round_id = null,
      current_run_id = null,
      called_pool_label = null,
      display_mode = case when live.display_mode = 'pool_call' then 'scoreboard' else live.display_mode end
    where live.id is true;
  end if;

  delete from public.scoring_rounds as round
  where round.id = p_round_id;

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id, p_actor_name, p_actor_email,
    'undo_next_round', 'scoring_rounds', p_round_id::text,
    jsonb_build_object(
      'subject_name', v_round.name,
      'from_round', v_parent_name,
      'runs_deleted', v_runs,
      'overrides_removed', v_overrides_removed
    )
  );

  return jsonb_build_object(
    'round_name', v_round.name,
    'from_round', v_parent_name,
    'runs_deleted', v_runs
  );
end;
$$;

revoke execute on function public.scoring_undo_next_round(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_undo_next_round(uuid, uuid, text, text)
  to service_role;

-- The Next step card, for Singles ('single') or Teams ('section').
create or replace function public.scoring_next_step(p_event_type text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_switch public.scoring_engine_switch%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_plan jsonb;
  v_undo jsonb := null;
  v_ready integer;
  v_single boolean;
begin
  if p_event_type is null or p_event_type not in ('single', 'section') then
    raise exception 'Choose Singles or Teams.' using errcode = '22023';
  end if;

  v_single := p_event_type = 'single';

  select * into v_switch
  from public.scoring_engine_switch as engine
  where engine.id is true;

  if v_single then
    select count(*)::integer into v_ready
    from public.solo_registrations as registration
    where registration.checked_in_at is not null;
  else
    -- Teams with all four riders checked in.
    select count(*)::integer into v_ready
    from public.teams as team
    where (select count(*) from public.team_members as member where member.team_id = team.id) = 4
      and not exists (
        select 1 from public.team_members as member
        where member.team_id = team.id and member.checked_in_at is null
      );
  end if;

  select * into v_round
  from public.scoring_rounds as round
  where round.event_type = p_event_type
    and exists (select 1 from public.scoring_runs as run where run.round_id = round.id)
  order by round.sort_order desc
  limit 1;

  if not found then
    if exists (select 1 from public.scoring_rounds as round where round.event_type = p_event_type) then
      v_plan := jsonb_build_object(
        'state', 'manual_setup',
        'message', case when v_single
          then 'A Single round exists with nobody drawn into it. Draw it in Manual mode, or delete it and press Start qualifying.'
          else 'A team round exists with no teams drawn into it. Draw it in Manual mode, or delete it and press Start teams.'
        end
      );
    else
      v_plan := jsonb_build_object(
        'state', 'no_rounds',
        'message', case when v_single
          then 'When check-in is done, Start qualifying shuffles every checked-in rider into pools of about 12. Riders who check in later join the last pool.'
          else 'When the teams are ready, Start teams shuffles every team with all 4 riders checked in into one queue for Teams Round 1 (8 points). A team that completes check-in during Round 1 joins the end of it.'
        end
      );
    end if;
  else
    v_plan := public.scoring_next_round_plan(v_round.id);

    if (v_round.parent_round_id is not null or v_round.stage in ('qualifier', 'section'))
      and not exists (
        select 1
        from public.scoring_runs as run
        where run.round_id = v_round.id
          and run.status in ('scored', 'on_course')
      )
    then
      v_undo := jsonb_build_object('round_id', v_round.id, 'round_name', v_round.name);
    end if;
  end if;

  return jsonb_build_object(
    'event_type', p_event_type,
    'engine', jsonb_build_object(
      'auto_on', coalesce(case when v_single then v_switch.auto_on else v_switch.teams_auto_on end, true),
      'changed_at', v_switch.changed_at,
      'changed_by', v_switch.changed_by
    ),
    'checked_in_count', v_ready,
    'plan', v_plan,
    'undo', v_undo
  );
end;
$$;

revoke execute on function public.scoring_next_step(text) from public, anon, authenticated;
grant execute on function public.scoring_next_step(text) to service_role;

-- The no-argument version stays for Singles (older pages call it).
create or replace function public.scoring_next_step()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.scoring_next_step('single');
$$;

revoke execute on function public.scoring_next_step() from public, anon, authenticated;
grant execute on function public.scoring_next_step() to service_role;

-- 6. A team that completes check-in joins Teams Round 1 ---------------------

create or replace function public.scoring_auto_place_team(
  p_team_id uuid,
  p_actor_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_round public.scoring_rounds%rowtype;
  v_entrant_key text := 'team:' || p_team_id::text;
  v_member_count integer;
  v_checked_in integer;
  v_complete boolean;
  v_in_round boolean;
  v_run_order integer;
  v_member record;
  v_team_name text;
  v_removed integer;
begin
  if not coalesce((
    select engine.teams_auto_on from public.scoring_engine_switch as engine where engine.id is true
  ), false) then
    return 'manual';
  end if;

  -- The engine's Teams Round 1.
  select * into v_round
  from public.scoring_rounds as round
  where round.event_type = 'section'
    and round.stage = 'section'
    and round.parent_round_id is null
  order by round.sort_order
  limit 1
  for update;

  if not found then
    return 'no_teams_round';
  end if;

  -- Round 1 is over once a later team round exists or nobody is left to ride.
  if exists (
    select 1 from public.scoring_rounds as later
    where later.event_type = 'section' and later.sort_order > v_round.sort_order
  ) then
    return 'round_one_over';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = v_round.id
  order by run.run_order
  for update;

  select
    count(*)::integer,
    (count(*) filter (where member.checked_in_at is not null))::integer
  into v_member_count, v_checked_in
  from public.team_members as member
  where member.team_id = p_team_id;

  v_complete := v_member_count = 4 and v_checked_in = 4;

  select exists (
    select 1 from public.scoring_runs as run
    where run.round_id = v_round.id and run.entrant_key = v_entrant_key
  ) into v_in_round;

  select team.team_name into v_team_name
  from public.teams as team
  where team.id = p_team_id;

  if v_complete then
    if v_in_round then
      return 'already_in';
    end if;

    if not exists (
      select 1 from public.scoring_runs as run
      where run.round_id = v_round.id and run.status in ('pending', 'on_course')
    ) then
      return 'round_one_over';
    end if;

    select coalesce(max(run.run_order), 0)
    into v_run_order
    from public.scoring_runs as run
    where run.round_id = v_round.id;

    for v_member in
      select member.id, member.full_name, member.horse_name, member.location
      from public.team_members as member
      where member.team_id = p_team_id
      order by member.is_leader desc nulls last, member.created_at asc, member.id asc
    loop
      v_run_order := v_run_order + 1;

      insert into public.scoring_runs (
        round_id, run_order, attempt_number, pool_label, team_member_id, team_id,
        entrant_key, rider_name, horse_name, team_name, rider_location
      ) values (
        v_round.id, v_run_order, 1, null, v_member.id, p_team_id,
        v_entrant_key,
        btrim(v_member.full_name),
        nullif(btrim(v_member.horse_name), ''),
        nullif(btrim(v_team_name), ''),
        nullif(btrim(v_member.location), '')
      );
    end loop;

    perform public.scoring_renumber_round(v_round.id);

    insert into public.admin_audit_log (
      actor_id, actor_name, actor_email, action, target_table, target_id, details
    ) values (
      p_actor_id, 'Automatic mode (team check-in)', null,
      'auto_add_entrant', 'scoring_runs', v_round.id::text,
      jsonb_build_object('subject_name', v_team_name, 'round_name', v_round.name, 'entrant_key', v_entrant_key)
    );

    return 'added';
  end if;

  -- No longer complete: out again, unless the team has ridden.
  if not v_in_round then
    return 'not_in';
  end if;

  if exists (
    select 1
    from public.scoring_runs as run
    left join public.scoring_live_state as live on live.id is true
    where run.round_id = v_round.id
      and run.entrant_key = v_entrant_key
      and (run.status in ('scored', 'on_course') or live.current_run_id = run.id)
  ) then
    return 'kept_has_ridden';
  end if;

  delete from public.scoring_runs as run
  where run.round_id = v_round.id
    and run.entrant_key = v_entrant_key;

  get diagnostics v_removed = row_count;

  perform public.scoring_renumber_round(v_round.id);

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id, 'Automatic mode (team check-in undone)', null,
    'auto_remove_entrant', 'scoring_runs', v_round.id::text,
    jsonb_build_object('subject_name', v_team_name, 'round_name', v_round.name, 'entrant_key', v_entrant_key, 'runs_deleted', v_removed)
  );

  return 'removed';
end;
$$;

revoke execute on function public.scoring_auto_place_team(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.scoring_auto_place_team(uuid, uuid)
  to service_role;

create or replace function public.scoring_on_team_check_in()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.team_id is null then
    return null;
  end if;

  if tg_op = 'INSERT' and new.checked_in_at is null then
    return null;
  end if;

  if tg_op = 'UPDATE' and (old.checked_in_at is null) = (new.checked_in_at is null) then
    return null;
  end if;

  begin
    perform public.scoring_auto_place_team(new.team_id, new.checked_in_by);
  exception when others then
    raise warning 'Automatic teams: could not place team % (%): %', new.team_id, sqlstate, sqlerrm;
  end;

  return null;
end;
$$;

revoke execute on function public.scoring_on_team_check_in() from public, anon, authenticated;

drop trigger if exists scoring_on_team_check_in on public.team_members;
create trigger scoring_on_team_check_in
  after insert or update of checked_in_at on public.team_members
  for each row
  execute function public.scoring_on_team_check_in();

-- 7. Verify ------------------------------------------------------------------------

do $verify$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.scoring_set_engine_mode(text, boolean, uuid, text, text)',
    'public.scoring_start_teams(uuid, text, text)',
    'public.scoring_team_target(integer)',
    'public.scoring_next_team_round_plan(uuid)',
    'public.scoring_next_round_plan(uuid)',
    'public.scoring_start_next_round(uuid, uuid, text, text)',
    'public.scoring_undo_next_round(uuid, uuid, text, text)',
    'public.scoring_next_step(text)',
    'public.scoring_next_step()',
    'public.scoring_auto_place_team(uuid, uuid)',
    'public.scoring_on_team_check_in()'
  ] loop
    if pg_catalog.to_regprocedure(v_function) is null then
      raise exception '% is missing.', v_function;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function::pg_catalog.regprocedure, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', v_function::pg_catalog.regprocedure, 'EXECUTE')
    then
      raise exception 'A browser role can execute %.', v_function;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'scoring_on_team_check_in'
      and tgrelid = 'public.team_members'::regclass
  ) then
    raise exception 'The team check-in trigger is missing.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
