-- Live scoring: Automatic mode starts qualifying and keeps its pools filled.
--
-- Plan: docs/superpowers/plans/2026-11-10-auto-scoring-engine.md. Builds on
-- 20261110130000_scoring_auto_next_round.sql (apply that first). The switch
-- in scoring_engine_switch is now shown as Automatic (on) / Manual (off).
--
--   1. scoring_start_qualifying(actor…): one button in Automatic mode. Makes
--      the Single qualifying round (round 0, three attempts, pools of about
--      12, stage 'qualifier') and draws every checked-in rider into it,
--      shuffled once into even pools. Refused when any Single round exists
--      (Manual mode is for that).
--
--   2. Check-in after that, in Automatic mode: the rider joins the LAST pool
--      (a new pool once the last has 12), with all three attempts. The last
--      pool rides last in every round, so a late rider usually still gets all
--      three. Undoing a check-in takes the rider back out, unless they have
--      ridden or are on course. Never once an Aarhi round exists, and never in
--      Manual mode. Done by a trigger on solo_registrations that can never
--      make a check-in fail: any problem is logged as a warning and the
--      check-in goes through.
--
--   3. Undo also works on the qualifying round the engine made, while nobody
--      has ridden. scoring_next_step() adds checked_in_count for the card.
--
--   4. scoring_desk_pool(code): the check-in desk's "Pool C · rider 4".
--
-- Idempotent. Undo with revert/20261110140000_scoring_auto_qualifying.revert.sql.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_next_step()') is null then
    raise exception 'scoring_next_step not found — apply 20261110130000_scoring_auto_next_round.sql first.';
  end if;
end
$preconditions$;

-- 1. Start qualifying ---------------------------------------------------------

create or replace function public.scoring_start_qualifying(
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
  c_pool_size constant integer := 12;
  v_auto_on boolean;
  v_existing public.scoring_rounds%rowtype;
  v_sort_order integer;
  v_new_id uuid;
  v_runs_created integer;
  v_riders integer;
  v_pools integer;
begin
  perform public.scoring_lock_live();

  select engine.auto_on into v_auto_on
  from public.scoring_engine_switch as engine
  where engine.id is true;

  if v_auto_on is distinct from true then
    raise exception 'Scoring is in Manual mode. Switch to Automatic, or create the round by hand.'
      using errcode = '22023';
  end if;

  select * into v_existing
  from public.scoring_rounds as round
  where round.event_type = 'single'
  order by round.sort_order
  limit 1;

  if found then
    raise exception 'A Single round already exists (%). Delete it, or carry on in Manual mode.', v_existing.name
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.solo_registrations as registration
    where registration.checked_in_at is not null
  ) then
    raise exception 'No solo riders have checked in yet.' using errcode = '22023';
  end if;

  select coalesce(max(round.sort_order), 0) + 1
  into v_sort_order
  from public.scoring_rounds as round;

  insert into public.scoring_rounds (
    event_type, name, round_number, attempts_per_rider, target_points,
    status, sort_order, pool_size, stage, parent_round_id
  ) values (
    'single', 'Qualifying', 0, 3, null,
    'upcoming', v_sort_order, c_pool_size, 'qualifier', null
  )
  returning id into v_new_id;

  -- Shuffled once into even pools, with its own audit row.
  v_runs_created := public.scoring_build_start_list(
    v_new_id, 'all_checked_in', p_actor_id, p_actor_name, p_actor_email
  );

  select
    count(distinct run.entrant_key)::integer,
    count(distinct run.pool_label)::integer
  into v_riders, v_pools
  from public.scoring_runs as run
  where run.round_id = v_new_id;

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_email, action, target_table, target_id, details
  ) values (
    p_actor_id, p_actor_name, p_actor_email,
    'start_qualifying', 'scoring_rounds', v_new_id::text,
    jsonb_build_object(
      'subject_name', 'Qualifying',
      'riders', v_riders,
      'pools', v_pools,
      'runs', v_runs_created
    )
  );

  return jsonb_build_object(
    'round_id', v_new_id,
    'round_name', 'Qualifying',
    'riders', v_riders,
    'pools', v_pools,
    'runs_created', v_runs_created
  );
end;
$$;

revoke execute on function public.scoring_start_qualifying(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_start_qualifying(uuid, text, text)
  to service_role;

-- 2. Check-in keeps the qualifying pools filled -----------------------------

create or replace function public.scoring_auto_place_rider(
  p_solo_registration_id uuid,
  p_checked_in boolean,
  p_actor_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_round public.scoring_rounds%rowtype;
  v_solo record;
  v_entrant_key text := 'solo:' || p_solo_registration_id::text;
  v_last_index integer;
  v_last_count integer;
  v_pool text;
  v_run_order integer;
  v_attempt integer;
  v_removed integer;
begin
  if not coalesce((
    select engine.auto_on from public.scoring_engine_switch as engine where engine.id is true
  ), false) then
    return 'manual';
  end if;

  select * into v_round
  from public.scoring_rounds as round
  where round.event_type = 'single'
    and round.stage = 'qualifier'
  order by round.sort_order desc
  limit 1
  for update;

  if not found then
    return 'no_qualifying';
  end if;

  -- Once an Aarhi round exists, qualifying is over: an administrator decides.
  if exists (
    select 1 from public.scoring_rounds as later
    where later.event_type = 'single'
      and later.sort_order > v_round.sort_order
  ) then
    return 'qualifying_over';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = v_round.id
  order by run.run_order
  for update;

  select registration.id, registration.full_name, registration.horse_name, registration.location
  into v_solo
  from public.solo_registrations as registration
  where registration.id = p_solo_registration_id;

  if not found then
    return 'no_rider';
  end if;

  if p_checked_in then
    if exists (
      select 1 from public.scoring_runs as run
      where run.round_id = v_round.id and run.entrant_key = v_entrant_key
    ) then
      return 'already_in';
    end if;

    if v_round.pool_size is null then
      v_pool := null;
    else
      select max(public.scoring_pool_index(run.pool_label))
      into v_last_index
      from public.scoring_runs as run
      where run.round_id = v_round.id
        and run.pool_label is not null;

      if v_last_index is null then
        v_pool := public.scoring_pool_label(0);
      else
        select count(distinct run.entrant_key)::integer
        into v_last_count
        from public.scoring_runs as run
        where run.round_id = v_round.id
          and run.pool_label = public.scoring_pool_label(v_last_index);

        v_pool := public.scoring_pool_label(
          case when v_last_count >= v_round.pool_size then v_last_index + 1 else v_last_index end
        );
      end if;
    end if;

    select coalesce(max(run.run_order), 0)
    into v_run_order
    from public.scoring_runs as run
    where run.round_id = v_round.id;

    for v_attempt in 1 .. v_round.attempts_per_rider loop
      v_run_order := v_run_order + 1;

      insert into public.scoring_runs (
        round_id, run_order, attempt_number, pool_label, solo_registration_id,
        entrant_key, rider_name, horse_name, team_name, rider_location
      ) values (
        v_round.id, v_run_order, v_attempt, v_pool, v_solo.id,
        v_entrant_key,
        btrim(v_solo.full_name),
        nullif(btrim(v_solo.horse_name), ''),
        null,
        nullif(btrim(v_solo.location), '')
      );
    end loop;

    -- Each attempt goes to the end of its own pass in that pool.
    perform public.scoring_renumber_round(v_round.id);

    insert into public.admin_audit_log (
      actor_id, actor_name, actor_email, action, target_table, target_id, details
    ) values (
      p_actor_id, 'Automatic mode (check-in)', null,
      'auto_add_entrant', 'scoring_runs', v_round.id::text,
      jsonb_build_object(
        'subject_name', btrim(v_solo.full_name),
        'round_name', v_round.name,
        'entrant_key', v_entrant_key,
        'pool_label', v_pool
      )
    );

    return coalesce('pool:' || v_pool, 'added');
  end if;

  -- Check-in undone: out again, unless they have ridden or are on course.
  if not exists (
    select 1 from public.scoring_runs as run
    where run.round_id = v_round.id and run.entrant_key = v_entrant_key
  ) then
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
    p_actor_id, 'Automatic mode (check-in undone)', null,
    'auto_remove_entrant', 'scoring_runs', v_round.id::text,
    jsonb_build_object(
      'subject_name', btrim(v_solo.full_name),
      'round_name', v_round.name,
      'entrant_key', v_entrant_key,
      'runs_deleted', v_removed
    )
  );

  return 'removed';
end;
$$;

revoke execute on function public.scoring_auto_place_rider(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.scoring_auto_place_rider(uuid, boolean, uuid)
  to service_role;

-- The trigger never blocks a check-in: whatever goes wrong in scoring is a
-- warning in the database log, and the check-in is saved as before.
create or replace function public.scoring_on_solo_check_in()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.checked_in_at is null then
    return null;
  end if;

  if tg_op = 'UPDATE' and (old.checked_in_at is null) = (new.checked_in_at is null) then
    return null;
  end if;

  begin
    perform public.scoring_auto_place_rider(
      new.id,
      new.checked_in_at is not null,
      new.checked_in_by
    );
  exception when others then
    raise warning 'Automatic pools: could not place rider % (%): %', new.id, sqlstate, sqlerrm;
  end;

  return null;
end;
$$;

revoke execute on function public.scoring_on_solo_check_in() from public, anon, authenticated;

drop trigger if exists scoring_on_solo_check_in on public.solo_registrations;
create trigger scoring_on_solo_check_in
  after insert or update of checked_in_at on public.solo_registrations
  for each row
  execute function public.scoring_on_solo_check_in();

-- 3. Undo covers the engine's qualifying round; the card gets the count -----

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

  if v_round.parent_round_id is null and v_round.stage is distinct from 'qualifier' then
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

  if v_round.parent_round_id is not null then
    delete from public.scoring_advance_overrides as advance_override
    where advance_override.round_id = v_round.parent_round_id
      and advance_override.note in (
        'Auto: no 4s this round — the 2s go through.',
        'Auto: everyone got 0 — all ride again.'
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
  v_checked_in integer;
begin
  select * into v_switch
  from public.scoring_engine_switch as engine
  where engine.id is true;

  select count(*)::integer into v_checked_in
  from public.solo_registrations as registration
  where registration.checked_in_at is not null;

  select * into v_round
  from public.scoring_rounds as round
  where round.event_type = 'single'
    and exists (select 1 from public.scoring_runs as run where run.round_id = round.id)
  order by round.sort_order desc
  limit 1;

  if not found then
    if exists (select 1 from public.scoring_rounds as round where round.event_type = 'single') then
      v_plan := jsonb_build_object(
        'state', 'manual_setup',
        'message', 'A Single round exists with nobody drawn into it. Draw it in Manual mode, or delete it and press Start qualifying.'
      );
    else
      v_plan := jsonb_build_object(
        'state', 'no_rounds',
        'message', 'When check-in is done, Start qualifying shuffles every checked-in rider into pools of about 12. Riders who check in later join the last pool.'
      );
    end if;
  else
    v_plan := public.scoring_next_round_plan(v_round.id);

    if (v_round.parent_round_id is not null or v_round.stage = 'qualifier')
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
    'checked_in_count', v_checked_in,
    'plan', v_plan,
    'undo', v_undo
  );
end;
$$;

revoke execute on function public.scoring_next_step() from public, anon, authenticated;
grant execute on function public.scoring_next_step() to service_role;

-- 4. The desk's "Pool C · rider 4" ------------------------------------------
-- For one confirmation code: { started: false } before qualifying starts;
-- { started: true, pool, position } once the rider is in it (pool null for
-- an unpooled round); { started: true, pool: null, position: null } when
-- they are not in it (Manual mode, or qualifying over).

create or replace function public.scoring_desk_pool(p_code text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_round_id uuid;
  v_solo_id uuid;
  v_pool text;
  v_position integer;
begin
  select round.id into v_round_id
  from public.scoring_rounds as round
  where round.event_type = 'single'
    and (round.stage = 'qualifier' or round.round_number = 0)
  order by round.sort_order desc
  limit 1;

  if v_round_id is null then
    return jsonb_build_object('started', false, 'pool', null, 'position', null);
  end if;

  select registration.id into v_solo_id
  from public.solo_registrations as registration
  where upper(btrim(registration.confirmation_code)) = upper(btrim(p_code))
  limit 1;

  if v_solo_id is null then
    return null;
  end if;

  select ranked.pool_label, ranked.position
  into v_pool, v_position
  from (
    select
      run.entrant_key,
      run.pool_label,
      (row_number() over (partition by run.pool_label order by run.run_order))::integer as position
    from public.scoring_runs as run
    where run.round_id = v_round_id
      and run.attempt_number = 1
  ) as ranked
  where ranked.entrant_key = 'solo:' || v_solo_id::text;

  return jsonb_build_object('started', true, 'pool', v_pool, 'position', v_position);
end;
$$;

revoke execute on function public.scoring_desk_pool(text) from public, anon, authenticated;
grant execute on function public.scoring_desk_pool(text) to service_role;

-- 5. Verify ------------------------------------------------------------------------

do $verify$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.scoring_start_qualifying(uuid, text, text)',
    'public.scoring_auto_place_rider(uuid, boolean, uuid)',
    'public.scoring_on_solo_check_in()',
    'public.scoring_undo_next_round(uuid, uuid, text, text)',
    'public.scoring_next_step()',
    'public.scoring_desk_pool(text)'
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
    where tgname = 'scoring_on_solo_check_in'
      and tgrelid = 'public.solo_registrations'::regclass
  ) then
    raise exception 'The check-in trigger is missing.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
