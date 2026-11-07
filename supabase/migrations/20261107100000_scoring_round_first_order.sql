-- Live scoring: qualification is ridden round by round across every pool.
--
-- At the Amritsar Cup each rider has up to three attempts at the peg in the
-- Single qualification round, which the judges and commentators call
-- "Round 1", "Round 2" and "Round 3". They are ridden one round at a time
-- across the whole field, so every horse rests while the other pools ride:
--
--   Round 1: Pool A, Pool B, Pool C, ...
--   Round 2: Pool A, Pool B, Pool C, ...   (riders who carried are skipped)
--   Round 3: Pool A, Pool B, Pool C, ...
--
-- 20261025120000_live_scoring.sql laid the start list out pool by pool
-- instead (Pool A's three attempts, then Pool B's). This migration:
--
--   1. replaces scoring_renumber_round so it orders by attempt, then pool,
--      then the current order. Every function that renumbers (adding or
--      removing an entrant, moving a run, moving an entrant to another pool)
--      keeps the new layout;
--   2. patches scoring_build_start_list to renumber once it has inserted the
--      runs, so a freshly drawn list comes out in the new layout;
--   3. keeps the called pool in step with the riding by where the pointer
--      moved, not by pool letter: after Round 1 · Pool C the riding moves on
--      to Round 2 · Pool A, and "Pool C" must not stay called just because C
--      comes after A in the alphabet. A new helper, scoring_called_pool_after,
--      replaces the letter comparison in scoring_advance_live_pointer,
--      scoring_clear_result (undo) and scoring_set_live;
--   4. renumbers any multi-attempt round already drawn (order only: no
--      result, status or pool changes);
--   5. adds scoring_take_out: the judges' "Take out" (an injured horse, a
--      disqualification) and its "Bring back", each one transaction.
--
-- Single-attempt rounds (Aarhi, Section) have attempt 1 only, so their order
-- is unchanged. scoring_call_pool needs no change: it already puts on course
-- the pool's earliest run still to ride, which is now its earliest round.
--
-- Apply after 20261025120000_live_scoring.sql (and any time after the other
-- scoring migrations). Re-running 20261025120000 restores the old functions,
-- so run this file again after it. Idempotent: a second run changes nothing.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_renumber_round(uuid)') is null then
    raise exception 'scoring_renumber_round(uuid) not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)') is null then
    raise exception 'scoring_build_start_list(uuid, text, uuid, text, text) not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_advance_live_pointer(uuid, integer)') is null then
    raise exception 'scoring_advance_live_pointer(uuid, integer) not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_pool_index(text)') is null then
    raise exception 'scoring_pool_index(text) not found — apply 20261025120000_live_scoring.sql first.';
  end if;
end
$preconditions$;

-- 1. Renumber round by round -------------------------------------------------
-- Renumbers a round's runs 1..n by (attempt, pool, current order): Round 1
-- for every pool, then Round 2, then Round 3; within one round and pool the
-- riders keep their current order. Two-phase, exactly as before, so the
-- unique (round_id, run_order) key never trips half way.

create or replace function public.scoring_renumber_round(p_round_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift integer;
begin
  select coalesce(max(run.run_order), 0) + 1
  into v_shift
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  -- Phase 1: every row above the current maximum.
  update public.scoring_runs as run
  set run_order = run.run_order + v_shift
  where run.round_id = p_round_id;

  -- Phase 2: the final contiguous numbering.
  update public.scoring_runs as run
  set run_order = ordered.new_order
  from (
    select
      inner_run.id,
      (row_number() over (
        order by
          inner_run.attempt_number asc,
          public.scoring_pool_index(inner_run.pool_label) asc nulls first,
          inner_run.run_order asc
      ))::integer as new_order
    from public.scoring_runs as inner_run
    where inner_run.round_id = p_round_id
  ) as ordered
  where run.id = ordered.id;
end;
$$;

revoke execute on function public.scoring_renumber_round(uuid) from public, anon, authenticated;
grant execute on function public.scoring_renumber_round(uuid) to service_role;

-- 2. A new start list comes out round by round --------------------------------
-- The builder inserts pool by pool (it needs each pool's size to label the
-- runs); one renumber at the end, inside the same transaction, lays the list
-- out round by round before anyone can read it.

do $patch$
declare
  target_function constant regprocedure :=
    pg_catalog.to_regprocedure('public.scoring_build_start_list(uuid, text, uuid, text, text)');
  anchor constant text := E'  return v_run_order;\nend;';
  replacement constant text :=
    E'  -- Round 1 for every pool, then Round 2, then Round 3 (20261107100000).\n'
    || E'  perform public.scoring_renumber_round(p_round_id);\n\n'
    || E'  return v_run_order;\nend;';
  original text;
  definition text;
  occurrences integer;
begin
  original := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');
  definition := original;

  -- Applied by an earlier run of this migration.
  if position(replacement in definition) > 0 then
    raise notice 'scoring_build_start_list already renumbers round by round; left unchanged.';
  else
    occurrences := (
      char_length(definition) - char_length(replace(definition, anchor, ''))
    ) / char_length(anchor);

    if occurrences <> 1 then
      raise exception
        'Could not patch scoring_build_start_list: expected its anchor once, found it % times.',
        occurrences;
    end if;

    definition := replace(definition, anchor, replacement);
    execute definition;
  end if;

  -- Read the deployed body back rather than trusting the EXECUTE.
  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) = 0 then
    raise exception 'scoring_build_start_list does not renumber round by round.';
  end if;
end
$patch$;

revoke execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  to service_role;

-- 3. The called pool follows the riding --------------------------------------
-- What "called" becomes when the live pointer moves from one run to another:
--
--   * nothing new on course, or a run without a pool: unchanged;
--   * nothing called yet, nobody was on course, or the called pool was the
--     pool that was riding: the pool of the new run;
--   * the called pool has nobody left to ride: the pool of the new run;
--   * otherwise a pool was called ahead of the riding: left alone.
--
-- "Call Pool X" itself (scoring_call_pool) sets the pool directly and is not
-- affected. Security invoker; only the scoring functions (service_role) call it.

create or replace function public.scoring_called_pool_after(
  p_round_id uuid,
  p_called text,
  p_from_run_id uuid,
  p_to_run_id uuid
)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_to_pool text;
  v_from_pool text;
begin
  if p_to_run_id is null then
    return p_called;
  end if;

  select run.pool_label into v_to_pool
  from public.scoring_runs as run
  where run.id = p_to_run_id;

  if v_to_pool is null then
    return p_called;
  end if;

  if p_called is null or p_called = v_to_pool or p_from_run_id is null then
    return v_to_pool;
  end if;

  select run.pool_label into v_from_pool
  from public.scoring_runs as run
  where run.id = p_from_run_id;

  if v_from_pool is not distinct from p_called then
    return v_to_pool;
  end if;

  if not exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.pool_label = p_called
      and run.status in ('pending', 'on_course')
      and run.id <> p_to_run_id
  ) then
    return v_to_pool;
  end if;

  return p_called;
end;
$$;

revoke execute on function public.scoring_called_pool_after(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.scoring_called_pool_after(uuid, text, uuid, uuid)
  to service_role;

-- Replaces one exact piece of a function's body, once; a second run of this
-- file finds the replacement already there and changes nothing. Session-only.
create or replace function pg_temp.scoring_patch_body(
  p_function regprocedure,
  p_anchor text,
  p_replacement text
)
returns void
language plpgsql
as $$
declare
  v_original text;
  v_definition text;
  v_occurrences integer;
begin
  if p_function is null then
    raise exception 'A scoring function to patch is missing — apply 20261025120000_live_scoring.sql first.';
  end if;

  v_original := replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n');

  if position(p_replacement in v_original) > 0 then
    raise notice '% is already patched; left unchanged.', p_function;
    return;
  end if;

  v_occurrences := (
    char_length(v_original) - char_length(replace(v_original, p_anchor, ''))
  ) / char_length(p_anchor);

  if v_occurrences <> 1 then
    raise exception 'Could not patch %: expected its anchor once, found it % times.',
      p_function, v_occurrences;
  end if;

  v_definition := replace(v_original, p_anchor, p_replacement);
  execute v_definition;

  v_definition := replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n');

  if position(p_replacement in v_definition) = 0 then
    raise exception '% was not patched.', p_function;
  end if;
end;
$$;

-- After a result or a skip: the pointer moves from the current run to the
-- next one to ride.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_advance_live_pointer(uuid, integer)'),
  $anchor$    called_pool_label = case
      when v_next_pool is not null
        and (
          live.called_pool_label is null
          or public.scoring_pool_index(live.called_pool_label)
             < public.scoring_pool_index(v_next_pool)
        )
        then v_next_pool
      else live.called_pool_label
    end$anchor$,
  $replacement$    called_pool_label = public.scoring_called_pool_after(
      p_round_id,
      live.called_pool_label,
      live.current_run_id,
      v_next_run_id
    )$replacement$
);

-- Undo last result: the rider goes back on course.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_clear_result(uuid, boolean, uuid, text, text)'),
  $anchor$        when v_run.pool_label is not null
          and (
            live.called_pool_label is null
            or public.scoring_pool_index(live.called_pool_label)
               < public.scoring_pool_index(v_run.pool_label)
          )
          then v_run.pool_label
        else live.called_pool_label$anchor$,
  $replacement$        else public.scoring_called_pool_after(
          v_run.round_id,
          live.called_pool_label,
          live.current_run_id,
          p_run_id
        )$replacement$
);

-- A rider put on course by hand (start list, "Back on course").
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_set_live(jsonb, uuid, text, text)'),
  $anchor$    v_called := v_live.called_pool_label;

    if v_run.pool_label is not null
      and (
        v_called is null
        or public.scoring_pool_index(v_called) < public.scoring_pool_index(v_run.pool_label)
      ) then
      v_called := v_run.pool_label;
    end if;$anchor$,
  $replacement$    v_called := public.scoring_called_pool_after(
      v_round_id,
      v_live.called_pool_label,
      v_live.current_run_id,
      v_run_id
    );$replacement$
);

-- 4. Start lists already drawn ------------------------------------------------
-- Takes the live-state row first, the locking order every scoring function
-- follows, then each round's runs in run_order, so it cannot interleave with
-- a judge recording a result. Only multi-attempt rounds can change.

do $backfill$
declare
  v_round record;
begin
  perform 1
  from public.scoring_live_state as live
  where live.id is true
  for update;

  for v_round in
    select round.id, round.name
    from public.scoring_rounds as round
    where round.attempts_per_rider > 1
      and exists (
        select 1 from public.scoring_runs as run where run.round_id = round.id
      )
    order by round.sort_order
  loop
    perform 1
    from public.scoring_runs as run
    where run.round_id = v_round.id
    order by run.run_order
    for update;

    perform public.scoring_renumber_round(v_round.id);
    raise notice 'Laid out % round by round.', v_round.name;
  end loop;
end
$backfill$;

-- 5. Judges take a rider out, and bring them back ----------------------------
-- "Take out" on the judges' panel: the entrant's rides still to come in this
-- round are skipped and they are recorded as out (an advance override with
-- the note TAKE_OUT_NOTE), so every screen shows them Out and the next
-- round's draw leaves them out. If they were on course, the next rider comes
-- on. Refused for an entrant who has carried in this round or has no rides
-- left: that is the administrator's call (Mark Out on /admin/scoring).
--
-- "Bring back" (p_out = false) undoes exactly that: the override goes and
-- every skipped ride of the entrant in this round is to ride again. It only
-- undoes a judge's Take out, never an administrator's own Mark Out.

create or replace function public.scoring_take_out(
  p_round_id uuid,
  p_entrant_key text,
  p_out boolean,
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
  c_note constant text := 'Taken out on the judges'' panel';
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_name text;
  v_override public.scoring_advance_overrides%rowtype;
  v_has_override boolean;
  v_current public.scoring_runs%rowtype;
  v_next_run_id uuid;
  v_changed integer;
begin
  if p_out is null then
    raise exception 'Choose Take out or Bring back.' using errcode = '22023';
  end if;

  if p_entrant_key is null or p_entrant_key !~ '^(solo|team):[0-9a-f-]{36}$' then
    raise exception 'That rider is not valid.' using errcode = '22023';
  end if;

  -- Locking order: the live state, then the round, then its runs in run order.
  v_live := public.scoring_lock_live();

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

  v_name := public.scoring_entrant_name(p_round_id, p_entrant_key);

  if v_name is null then
    raise exception 'That rider is not in this round.' using errcode = 'P0002';
  end if;

  select * into v_override
  from public.scoring_advance_overrides as advance_override
  where advance_override.round_id = p_round_id
    and advance_override.entrant_key = p_entrant_key
  for update;

  v_has_override := found;

  if p_out then
    if v_has_override and not v_override.advanced then
      raise exception '% is already out.', v_name using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.scoring_runs as run
      where run.round_id = p_round_id
        and run.entrant_key = p_entrant_key
        and run.result = 'carry'
    ) then
      raise exception '% has already carried in this round. Ask the person in control.', v_name
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.scoring_runs as run
      where run.round_id = p_round_id
        and run.entrant_key = p_entrant_key
        and run.status <> 'scored'
    ) then
      raise exception '% has finished this round. Ask the person in control.', v_name
        using errcode = '22023';
    end if;

    select * into v_current
    from public.scoring_runs as run
    where run.id = v_live.current_run_id
      and run.round_id = p_round_id
      and run.entrant_key = p_entrant_key;

    update public.scoring_runs as run
    set status = 'void', auto_voided_by = null
    where run.round_id = p_round_id
      and run.entrant_key = p_entrant_key
      and run.status in ('pending', 'on_course');

    get diagnostics v_changed = row_count;

    insert into public.scoring_advance_overrides (round_id, entrant_key, advanced, note, set_by)
    values (p_round_id, p_entrant_key, false, c_note, p_actor_id)
    on conflict (round_id, entrant_key) do update
    set advanced = excluded.advanced, note = excluded.note, set_by = excluded.set_by;

    if v_current.id is not null then
      v_next_run_id := public.scoring_advance_live_pointer(p_round_id, v_current.run_order);
    end if;
  else
    if not v_has_override or v_override.advanced then
      raise exception '% is not taken out.', v_name using errcode = '22023';
    end if;

    if v_override.note is distinct from c_note then
      raise exception 'The person in control marked % out. Ask them to bring the rider back.', v_name
        using errcode = '22023';
    end if;

    delete from public.scoring_advance_overrides as advance_override
    where advance_override.round_id = p_round_id
      and advance_override.entrant_key = p_entrant_key;

    update public.scoring_runs as run
    set status = 'pending', auto_voided_by = null
    where run.round_id = p_round_id
      and run.entrant_key = p_entrant_key
      and run.status = 'void';

    get diagnostics v_changed = row_count;
  end if;

  insert into public.admin_audit_log (
    actor_id,
    actor_name,
    actor_email,
    action,
    target_table,
    target_id,
    details
  ) values (
    p_actor_id,
    p_actor_name,
    p_actor_email,
    case when p_out then 'take_out' else 'bring_back' end,
    'scoring_advance_overrides',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_name,
      'round_name', v_round.name,
      'entrant_key', p_entrant_key,
      'runs_changed', v_changed,
      'next_run_id', v_next_run_id
    )
  );

  return jsonb_build_object(
    'entrant_key', p_entrant_key,
    'out', p_out,
    'runs_changed', v_changed,
    'next_run_id', v_next_run_id
  );
end;
$$;

revoke execute on function public.scoring_take_out(uuid, text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_take_out(uuid, text, boolean, uuid, text, text)
  to service_role;

-- 6. Check the result ---------------------------------------------------------

do $verify$
declare
  v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef('public.scoring_renumber_round(uuid)'::pg_catalog.regprocedure);

  if position('inner_run.attempt_number asc,' in v_definition) = 0
    or position('inner_run.attempt_number asc,' in v_definition)
      > position('public.scoring_pool_index(inner_run.pool_label)' in v_definition)
  then
    raise exception 'scoring_renumber_round does not order by attempt first.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.scoring_renumber_round(uuid)'::pg_catalog.regprocedure, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.scoring_renumber_round(uuid)'::pg_catalog.regprocedure, 'EXECUTE')
  then
    raise exception 'A browser role can execute scoring_renumber_round.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_called_pool_after(uuid, text, uuid, uuid)') is null then
    raise exception 'scoring_called_pool_after is missing.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.scoring_called_pool_after(uuid, text, uuid, uuid)'::pg_catalog.regprocedure, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.scoring_called_pool_after(uuid, text, uuid, uuid)'::pg_catalog.regprocedure, 'EXECUTE')
  then
    raise exception 'A browser role can execute scoring_called_pool_after.';
  end if;

  if position('scoring_pool_index' in pg_catalog.pg_get_functiondef('public.scoring_advance_live_pointer(uuid, integer)'::pg_catalog.regprocedure)) > 0
    or position('scoring_called_pool_after' in pg_catalog.pg_get_functiondef('public.scoring_clear_result(uuid, boolean, uuid, text, text)'::pg_catalog.regprocedure)) = 0
    or position('scoring_called_pool_after' in pg_catalog.pg_get_functiondef('public.scoring_set_live(jsonb, uuid, text, text)'::pg_catalog.regprocedure)) = 0
  then
    raise exception 'The called pool still follows pool letters somewhere.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_take_out(uuid, text, boolean, uuid, text, text)') is null then
    raise exception 'scoring_take_out is missing.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.scoring_take_out(uuid, text, boolean, uuid, text, text)'::pg_catalog.regprocedure, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.scoring_take_out(uuid, text, boolean, uuid, text, text)'::pg_catalog.regprocedure, 'EXECUTE')
  then
    raise exception 'A browser role can execute scoring_take_out.';
  end if;

  -- Every drawn round reads round by round: no run of a later attempt comes
  -- before a run of an earlier one.
  if exists (
    select 1
    from public.scoring_runs as later
    join public.scoring_runs as earlier
      on earlier.round_id = later.round_id
     and earlier.attempt_number < later.attempt_number
     and earlier.run_order > later.run_order
  ) then
    raise exception 'A start list is still laid out pool by pool.';
  end if;
end
$verify$;

-- Verification (run by hand after applying; expected results in comments) ----
--
-- -- The qualification start list, round by round.
-- select run.run_order, run.attempt_number, run.pool_label, run.rider_name
-- from public.scoring_runs as run
-- join public.scoring_rounds as round on round.id = run.round_id
-- where round.attempts_per_rider > 1
-- order by run.run_order;
--   -- attempt 1 for Pool A, B, C ..., then attempt 2 for Pool A, B, C ...

notify pgrst, 'reload schema';
