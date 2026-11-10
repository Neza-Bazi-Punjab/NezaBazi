-- Live scoring: the auto engine's first steps for Single tent pegging.
--
-- Plan: docs/superpowers/plans/2026-11-10-auto-scoring-engine.md (steps 1–3).
--
--   1. The next round keeps the start order. Drawing a Single round from
--      "advanced" no longer shuffles: riders come out in the order they rode
--      the previous round (the first run of each), which is the order the
--      qualifying draw made. Section rounds are unchanged (still shuffled).
--
--   2. Start next round / Undo next round, each one transaction with its
--      audit row:
--
--        scoring_next_round_plan(round_id)  what would happen next (read only)
--        scoring_next_step()                the plan for the latest Single
--                                           round, plus Undo if it is allowed
--        scoring_start_next_round(round_id, actor…)
--        scoring_undo_next_round(round_id, actor…)
--
--      Who goes through:
--        qualifying (round 0)  a 4 (carry), nothing else;
--        Aarhi rounds          the 4s; with no 4, the 2s; with everyone on 0,
--                              everyone (they ride again).
--      An administrator's override always wins. The 2s / all-0 cases are
--      written as override rows with an "Auto:" note, so the leaderboard,
--      /live and vMix show the right tick with no change to the view.
--
--      What comes next: more than 4 through → Aarhi Round N (one queue, one
--      ride each, no pools); exactly 4 → the Final; fewer than 4, or after
--      the Final → placings, which an administrator settles by hand for now.
--
--      Refused while anyone in the round is still to ride, while a skipped
--      rider has no decision (Restore them, or mark them Out), and while any
--      later Single round already exists (the engine never touches a round
--      it did not make).
--
--   3. The Auto engine switch: one row in scoring_engine_switch. Off, Start
--      next round is refused and /admin/scoring hides the Next step card, so
--      the page works exactly as before.
--
-- New columns on scoring_rounds: stage (qualifier | aarhi | final | rideoff,
-- null for a round made by hand) and parent_round_id (the round the engine
-- drew it from; only such a round can be undone).
--
-- Apply after 20261025120000_live_scoring.sql and
-- 20261107100000_scoring_round_first_order.sql. Re-running either of those
-- restores the shuffled draw, so run this file again after them. Idempotent.
-- Undo with revert/20261110130000_scoring_auto_next_round.revert.sql.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)') is null then
    raise exception 'scoring_build_start_list not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if position(
    'perform public.scoring_renumber_round(p_round_id);'
    in pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)')
    )
  ) = 0 then
    raise exception 'scoring_build_start_list does not renumber round by round — apply 20261107100000_scoring_round_first_order.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_take_out(uuid, text, boolean, uuid, text, text)') is null then
    raise exception 'scoring_take_out not found — apply 20261107100000_scoring_round_first_order.sql first.';
  end if;
end
$preconditions$;

-- 1. New columns ---------------------------------------------------------------

alter table public.scoring_rounds
  add column if not exists stage text
    constraint scoring_rounds_stage_check
    check (stage is null or stage in ('qualifier', 'aarhi', 'final', 'rideoff'));

alter table public.scoring_rounds
  add column if not exists parent_round_id uuid
    references public.scoring_rounds(id) on delete set null;

comment on column public.scoring_rounds.stage is
  'Set by the auto engine: qualifier, aarhi, final or rideoff. Null for a round made by hand.';
comment on column public.scoring_rounds.parent_round_id is
  'The round the auto engine drew this one from. Only such a round can be undone.';

-- 2. The Auto engine switch ----------------------------------------------------

create table if not exists public.scoring_engine_switch (
  id boolean primary key default true
    constraint scoring_engine_switch_one_row check (id),
  auto_on boolean not null default true,
  changed_at timestamptz,
  changed_by text
    constraint scoring_engine_switch_changed_by_check
    check (changed_by is null or char_length(changed_by) <= 200)
);

comment on table public.scoring_engine_switch is
  'One row: whether the auto scoring engine may start next rounds. Service role only.';

insert into public.scoring_engine_switch (id) values (true) on conflict (id) do nothing;

alter table public.scoring_engine_switch enable row level security;
revoke all on table public.scoring_engine_switch from public, anon, authenticated;
grant select, insert, update on table public.scoring_engine_switch to service_role;

create or replace function public.scoring_set_auto_engine(
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
  if p_on is null then
    raise exception 'Choose on or off.' using errcode = '22023';
  end if;

  insert into public.scoring_engine_switch (id) values (true) on conflict (id) do nothing;

  select engine.auto_on into v_before
  from public.scoring_engine_switch as engine
  where engine.id is true
  for update;

  update public.scoring_engine_switch as engine
  set
    auto_on = p_on,
    changed_at = now(),
    changed_by = left(coalesce(nullif(btrim(p_actor_name), ''), p_actor_email, 'Administrator'), 200)
  where engine.id is true
  returning * into v_saved;

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id,
    p_actor_name,
    p_actor_email,
    case when p_on then 'auto_engine_on' else 'auto_engine_off' end,
    'scoring_engine_switch',
    'auto_engine',
    jsonb_build_object('subject_name', 'Auto engine', 'before', v_before, 'after', p_on)
  );

  return jsonb_build_object(
    'auto_on', v_saved.auto_on,
    'changed_at', v_saved.changed_at,
    'changed_by', v_saved.changed_by
  );
end;
$$;

revoke execute on function public.scoring_set_auto_engine(boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_auto_engine(boolean, uuid, text, text)
  to service_role;

-- 3. The next round keeps the start order ------------------------------------
-- Patched in place, like 20261107100000 did, so the round-by-round renumber
-- and everything else in the builder stays exactly as deployed.

do $patch$
declare
  target_function constant regprocedure :=
    pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)');
  anchor constant text :=
    E'      select coalesce(array_agg(registration.id order by random()), \'{}\'::uuid[])\n'
    || E'      into v_entrant_ids\n'
    || E'      from public.solo_registrations as registration\n'
    || E'      where (\'solo:\' || registration.id::text) in (\n';
  replacement constant text :=
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
  occurrences integer;
begin
  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) > 0 then
    raise notice 'scoring_build_start_list already keeps the start order; left unchanged.';
  else
    occurrences := (
      char_length(definition) - char_length(replace(definition, anchor, ''))
    ) / char_length(anchor);

    if occurrences <> 1 then
      raise exception
        'Could not patch scoring_build_start_list: expected the Single "advanced" draw once, found it % times.',
        occurrences;
    end if;

    definition := replace(definition, anchor, replacement);
    execute definition;
  end if;

  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) = 0 then
    raise exception 'scoring_build_start_list still shuffles the next Single round.';
  end if;

  if position('perform public.scoring_renumber_round(p_round_id);' in definition) = 0 then
    raise exception 'scoring_build_start_list lost its round-by-round renumber.';
  end if;
end
$patch$;

revoke execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  to service_role;

-- 4. What happens next after a round ------------------------------------------
-- Read only. Returns { state, message, round_id, round_name, stage, ... }:
--
--   manual         a Section round: run by hand
--   no_start_list  the round has no riders yet
--   riding         someone is still to ride (left, total)
--   later_round    a later Single round already exists (later_round_name)
--   no_show        skipped riders with no decision (no_shows: names)
--   placings       after the Final, or fewer than 4 through: settle 1st–3rd
--                  by hand for now
--   nobody_through nobody goes through: decide by hand
--   ready          rule, through_count, entrant_count, through [{entrant_key,
--                  name}] in start order, next_stage, next_name, first_up

create or replace function public.scoring_next_round_plan(p_round_id uuid)
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
  v_entrants jsonb;
  v_entrant_count integer;
  v_no_shows jsonb;
  v_rule text;
  v_through jsonb;
  v_through_count integer;
  v_aarhi_number integer;
  v_next_stage text;
  v_next_name text;
begin
  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  v_stage := coalesce(
    v_round.stage,
    case when v_round.round_number = 0 then 'qualifier' else 'aarhi' end
  );
  v_base := jsonb_build_object(
    'round_id', v_round.id,
    'round_name', v_round.name,
    'stage', v_stage
  );

  if v_round.event_type <> 'single' then
    return v_base || jsonb_build_object(
      'state', 'manual',
      'message', 'Section rounds are run by hand on this page.'
    );
  end if;

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
  where later.event_type = 'single'
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
      'message', format('%s is ridden. Settle 1st, 2nd and 3rd and set the podium by hand.', v_round.name)
    );
  end if;

  -- One element per entrant, in start order.
  select
    coalesce(jsonb_agg(to_jsonb(entrant) order by entrant.first_order), '[]'::jsonb),
    count(*)::integer
  into v_entrants, v_entrant_count
  from (
    select
      run.entrant_key,
      min(run.run_order) as first_order,
      (array_agg(run.rider_name order by run.run_order))[1] as name,
      coalesce(bool_or(run.result = 'carry'), false) as carried,
      coalesce(bool_or(run.result = 'strike'), false) as struck,
      coalesce(bool_or(run.status = 'void' and run.auto_voided_by is null), false) as skipped,
      max(advance_override.advanced::integer) as override
    from public.scoring_runs as run
    left join public.scoring_advance_overrides as advance_override
      on advance_override.round_id = run.round_id
     and advance_override.entrant_key = run.entrant_key
    where run.round_id = p_round_id
    group by run.entrant_key
  ) as entrant;

  -- Skipped and never decided: Restore (ride), or mark Out.
  select coalesce(jsonb_agg(element ->> 'name' order by (element ->> 'first_order')::integer), '[]'::jsonb)
  into v_no_shows
  from jsonb_array_elements(v_entrants) as element
  where (element ->> 'skipped')::boolean
    and not (element ->> 'carried')::boolean
    and element -> 'override' = 'null'::jsonb;

  if jsonb_array_length(v_no_shows) > 0 then
    return v_base || jsonb_build_object(
      'state', 'no_show',
      'no_shows', v_no_shows,
      'message', format(
        'Decide on the skipped %s first: %s. Restore to let them ride, or mark them Out.',
        case when jsonb_array_length(v_no_shows) = 1 then 'rider' else 'riders' end,
        (select string_agg(value, ', ') from jsonb_array_elements_text(v_no_shows))
      )
    );
  end if;

  -- The rule for entrants without an override.
  if v_stage = 'qualifier' then
    v_rule := 'carry';
  elsif exists (
    select 1 from jsonb_array_elements(v_entrants) as element
    where element -> 'override' = 'null'::jsonb and (element ->> 'carried')::boolean
  ) then
    v_rule := 'carry';
  elsif exists (
    select 1 from jsonb_array_elements(v_entrants) as element
    where element -> 'override' = 'null'::jsonb and (element ->> 'struck')::boolean
  ) then
    v_rule := 'strike';
  else
    v_rule := 'all_zero';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entrant_key', element ->> 'entrant_key',
          'name', element ->> 'name',
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
    when v_rule = 'carry' then (element ->> 'carried')::boolean
    when v_rule = 'strike' then (element ->> 'struck')::boolean
    else true
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
      'message', format('Nobody goes through from %s. Decide by hand with the overrides below.', v_round.name)
    );
  end if;

  if v_through_count < 4 then
    return v_base || jsonb_build_object(
      'state', 'placings',
      'message', format(
        'Only %s through from %s. Settle 1st, 2nd and 3rd (ride-offs if tied) and set the podium by hand.',
        v_through_count, v_round.name
      )
    );
  end if;

  if v_through_count = 4 then
    v_next_stage := 'final';
    v_next_name := 'Final';
  else
    select count(*)::integer
    into v_aarhi_number
    from public.scoring_rounds as earlier
    where earlier.event_type = 'single'
      and earlier.sort_order <= v_round.sort_order
      and coalesce(
        earlier.stage,
        case when earlier.round_number = 0 then 'qualifier' else 'aarhi' end
      ) = 'aarhi';

    v_next_stage := 'aarhi';
    v_next_name := format('Aarhi Round %s', v_aarhi_number + 1);
  end if;

  return v_base || jsonb_build_object(
    'state', 'ready',
    'next_stage', v_next_stage,
    'next_name', v_next_name,
    'first_up', v_through -> 0 ->> 'name',
    'message', case v_rule
      when 'strike' then format('No 4s in %s, so the riders with 2 go through.', v_round.name)
      when 'all_zero' then format('Everyone got 0 in %s, so everyone rides again.', v_round.name)
      else format('The riders with a 4 in %s go through.', v_round.name)
    end
  );
end;
$$;

revoke execute on function public.scoring_next_round_plan(uuid) from public, anon, authenticated;
grant execute on function public.scoring_next_round_plan(uuid) to service_role;

-- The Next step card: the switch, the latest Single round that has riders and
-- its plan, and the round Undo next round would remove (an engine round with
-- nobody ridden yet).
create or replace function public.scoring_next_step()
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
begin
  select * into v_switch
  from public.scoring_engine_switch as engine
  where engine.id is true;

  select * into v_round
  from public.scoring_rounds as round
  where round.event_type = 'single'
    and exists (select 1 from public.scoring_runs as run where run.round_id = round.id)
  order by round.sort_order desc
  limit 1;

  if not found then
    v_plan := jsonb_build_object(
      'state', 'no_rounds',
      'message', 'Create the qualifying round (round 0, three attempts) and draw it from every checked-in rider.'
    );
  else
    v_plan := public.scoring_next_round_plan(v_round.id);

    if v_round.parent_round_id is not null
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
    'engine', jsonb_build_object(
      'auto_on', coalesce(v_switch.auto_on, true),
      'changed_at', v_switch.changed_at,
      'changed_by', v_switch.changed_by
    ),
    'plan', v_plan,
    'undo', v_undo
  );
end;
$$;

revoke execute on function public.scoring_next_step() from public, anon, authenticated;
grant execute on function public.scoring_next_step() to service_role;

-- 5. Start next round -----------------------------------------------------------

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

  select engine.auto_on into v_auto_on
  from public.scoring_engine_switch as engine
  where engine.id is true;

  if v_auto_on is distinct from true then
    raise exception 'The auto engine is off. Turn it on, or run the next round by hand.'
      using errcode = '22023';
  end if;

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
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

  -- The 2s, or everyone on 0, go through: recorded as overrides so every
  -- screen shows it. An administrator's own override is never replaced.
  if v_rule in ('strike', 'all_zero') then
    insert into public.scoring_advance_overrides (round_id, entrant_key, advanced, note, set_by)
    select
      p_round_id,
      element ->> 'entrant_key',
      true,
      case when v_rule = 'strike' then c_note_strike else c_note_all_zero end,
      p_actor_id
    from jsonb_array_elements(v_plan -> 'through') as element
    where not (element ->> 'by_override')::boolean
    on conflict (round_id, entrant_key) do nothing;

    get diagnostics v_overrides_written = row_count;
  end if;

  select coalesce(max(round.round_number), 0) + 1
  into v_round_number
  from public.scoring_rounds as round
  where round.event_type = 'single';

  if v_round_number > 50 then
    raise exception 'There is no room for another Single round.' using errcode = '22023';
  end if;

  select coalesce(max(round.sort_order), 0) + 1
  into v_sort_order
  from public.scoring_rounds as round;

  insert into public.scoring_rounds (
    event_type,
    name,
    round_number,
    attempts_per_rider,
    target_points,
    status,
    sort_order,
    pool_size,
    stage,
    parent_round_id
  ) values (
    'single',
    v_plan ->> 'next_name',
    v_round_number,
    1,
    null,
    'upcoming',
    v_sort_order,
    null,
    v_plan ->> 'next_stage',
    p_round_id
  )
  returning id into v_new_id;

  -- One queue in start order (section 3), with its own audit row.
  v_runs_created := public.scoring_build_start_list(
    v_new_id, 'advanced', p_actor_id, p_actor_name, p_actor_email
  );

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id,
    p_actor_name,
    p_actor_email,
    'start_next_round',
    'scoring_rounds',
    v_new_id::text,
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

-- 6. Undo next round -------------------------------------------------------------
-- Removes a round the engine started, while nobody in it has ridden, and the
-- "Auto:" overrides it wrote on the round before. Works with the switch off
-- too, so a mistake can always be taken back.

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

  if v_round.parent_round_id is null then
    raise exception '% was not started by the auto engine. Delete it by hand if you need to.', v_round.name
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
    where later.event_type = 'single'
      and later.sort_order > v_round.sort_order
  ) then
    raise exception 'Another Single round comes after %. Undo that one first.', v_round.name
      using errcode = '22023';
  end if;

  select round.name into v_parent_name
  from public.scoring_rounds as round
  where round.id = v_round.parent_round_id;

  select count(*)::integer into v_runs
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  delete from public.scoring_advance_overrides as advance_override
  where advance_override.round_id = v_round.parent_round_id
    and advance_override.note in (
      'Auto: no 4s this round — the 2s go through.',
      'Auto: everyone got 0 — all ride again.'
    );

  get diagnostics v_overrides_removed = row_count;

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
    p_actor_id,
    p_actor_name,
    p_actor_email,
    'undo_next_round',
    'scoring_rounds',
    p_round_id::text,
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

-- 7. Verify ------------------------------------------------------------------------

do $verify$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.scoring_set_auto_engine(boolean, uuid, text, text)',
    'public.scoring_next_round_plan(uuid)',
    'public.scoring_next_step()',
    'public.scoring_start_next_round(uuid, uuid, text, text)',
    'public.scoring_undo_next_round(uuid, uuid, text, text)',
    'public.scoring_build_start_list(uuid, text, uuid, text, text)'
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

  if pg_catalog.has_table_privilege('anon', 'public.scoring_engine_switch', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.scoring_engine_switch', 'SELECT')
  then
    raise exception 'A browser role can read scoring_engine_switch.';
  end if;

  if not exists (select 1 from public.scoring_engine_switch where id is true) then
    raise exception 'scoring_engine_switch has no row.';
  end if;
end
$verify$;

-- Verification (run by hand after applying) ---------------------------------
--
-- select public.scoring_next_step();
--   -- { engine: { auto_on: true, ... }, plan: { state: ..., message: ... }, undo: null }

notify pgrst, 'reload schema';
