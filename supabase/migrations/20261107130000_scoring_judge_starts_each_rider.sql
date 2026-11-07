-- Live scoring: the judges start each rider.
--
-- Until now a result moved the live pointer straight on: the moment a rider
-- was scored, the next one was "on course" on every screen, while the first
-- rider was still pulling up and the next had not been announced. The
-- organisers confirmed on 7 November 2026 that the day runs like this
-- instead:
--
--   score -> the rider leaves the course (nobody on course)
--         -> the judge taps Start for the next rider -> score -> ...
--
-- so the commentators announce the next rider while the screens still show
-- the last result, and nobody is shown on course before they are riding.
-- A pool call-up waits for Start too: calling a pool brings its riders to
-- the start and every screen shows the roster, but nobody is on course until
-- the judge taps Start.
--
-- This migration:
--
--   1. adds scoring_leave_course, the replacement for
--      scoring_advance_live_pointer in the judges' writes: it empties the
--      live pointer, leaves the next rider pending and the called pool as it
--      is, and returns the next rider still to ride (kept in the audit row);
--   2. patches scoring_record_result (the rider on course scored, or their
--      ride made unnecessary by a carry), scoring_set_run_status (Skip of the
--      rider on course) and scoring_take_out (Take out of the rider on
--      course) to call it instead of scoring_advance_live_pointer;
--   3. patches scoring_call_pool so the call-up no longer puts the pool's
--      first rider on course: the called pool and the pool-call screen are
--      set as before, and current_run_id becomes null.
--
-- scoring_set_live with current_run_id, the judges' Start, is unchanged and
-- is now the only way a rider comes on course; it already moves the called
-- pool (scoring_called_pool_after). Every lock, refusal and audit row stays
-- as it was. scoring_advance_live_pointer itself is left in place, unused, so
-- the revert file can put the old behaviour back.
--
-- Each function is patched in place from pg_get_functiondef with the
-- asserted technique of 20261107100000_scoring_round_first_order.sql: every
-- anchor must occur exactly once, a second run finds the replacement already
-- there and changes nothing, and a body that has drifted stops the migration.
--
-- Apply after 20261107100000_scoring_round_first_order.sql. Re-running
-- 20261025120000_live_scoring.sql or 20261107100000 restores the old
-- functions, so run this file again after either. To go back to the old
-- behaviour, run revert/20261107130000_scoring_judge_starts_each_rider.revert.sql.
-- The training engine (src/lib/scoring/sample-engine.ts) follows the same
-- rule, so the demo behaves exactly like the day.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_record_result(uuid, text, boolean, uuid, text, text)') is null then
    raise exception 'scoring_record_result not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_set_run_status(uuid, text, uuid, text, text)') is null then
    raise exception 'scoring_set_run_status not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_call_pool(uuid, text, uuid, text, text)') is null then
    raise exception 'scoring_call_pool not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_take_out(uuid, text, boolean, uuid, text, text)') is null then
    raise exception 'scoring_take_out not found — apply 20261107100000_scoring_round_first_order.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_called_pool_after(uuid, text, uuid, uuid)') is null then
    raise exception 'scoring_called_pool_after not found — apply 20261107100000_scoring_round_first_order.sql first.';
  end if;
end
$preconditions$;

-- 1. The rider leaves the course ---------------------------------------------
-- After the rider on course is scored, skipped or taken out: nobody is on
-- course until the judge taps Start. The next rider still to ride after
-- p_after_order stays pending (its status is not touched) and the called pool
-- is left as it is; the next rider's id is returned for the audit row.
-- Caller holds the live-state lock. Security invoker; only the scoring
-- functions (service_role) call it.

create or replace function public.scoring_leave_course(
  p_round_id uuid,
  p_after_order integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next_run_id uuid;
begin
  select run.id
  into v_next_run_id
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.status = 'pending'
    and run.run_order > p_after_order
  order by run.run_order
  limit 1;

  update public.scoring_live_state as live
  set current_run_id = null
  where live.id is true;

  return v_next_run_id;
end;
$$;

revoke execute on function public.scoring_leave_course(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.scoring_leave_course(uuid, integer)
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
    raise exception 'A scoring function to patch is missing — apply 20261107100000_scoring_round_first_order.sql first.';
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

-- 2. A result, a skip or a take-out leaves nobody on course -------------------

-- The rider on course is scored.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_record_result(uuid, text, boolean, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_run.run_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_leave_course(v_run.round_id, v_run.run_order);$replacement$
);

-- A carry on an earlier attempt makes the ride on course unnecessary.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_record_result(uuid, text, boolean, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_current_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_leave_course(v_run.round_id, v_current_order);$replacement$
);

-- Skip of the rider on course.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_set_run_status(uuid, text, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_run.run_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_leave_course(v_run.round_id, v_run.run_order);$replacement$
);

-- Take out of the rider on course.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_take_out(uuid, text, boolean, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_advance_live_pointer(p_round_id, v_current.run_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_leave_course(p_round_id, v_current.run_order);$replacement$
);

-- 3. A call-up brings the pool to the start; nobody is on course -------------

-- The rider on course (anywhere) and any on_course run of this round go back
-- to waiting; the pool's first rider is no longer put on course.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_call_pool(uuid, text, uuid, text, text)'),
  $anchor$  -- The rider leaving the course goes back to waiting (possibly in another
  -- round). Scored and void runs are never touched.
  if v_live.current_run_id is not null and v_live.current_run_id <> v_first_run.id then
    update public.scoring_runs as run
    set status = 'pending'
    where run.id = v_live.current_run_id
      and run.status = 'on_course';
  end if;

  update public.scoring_runs as run
  set status = 'pending'
  where run.round_id = p_round_id
    and run.status = 'on_course'
    and run.id <> v_first_run.id;

  update public.scoring_runs as run
  set status = 'on_course'
  where run.id = v_first_run.id
    and run.status = 'pending';$anchor$,
  $replacement$  -- Nobody is on course after a call-up (20261107130000): the pool comes
  -- to the start and the judge taps Start for its first rider. The rider on
  -- course (possibly in another round) and any other on_course run of this
  -- round go back to waiting. Scored and void runs are never touched.
  if v_live.current_run_id is not null then
    update public.scoring_runs as run
    set status = 'pending'
    where run.id = v_live.current_run_id
      and run.status = 'on_course';
  end if;

  update public.scoring_runs as run
  set status = 'pending'
  where run.round_id = p_round_id
    and run.status = 'on_course';$replacement$
);

-- The live pointer is emptied instead of pointing at the pool's first rider.
select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_call_pool(uuid, text, uuid, text, text)'),
  $anchor$    current_run_id = v_first_run.id,$anchor$,
  $replacement$    current_run_id = null, -- the judge taps Start (20261107130000)$replacement$
);

-- CREATE OR REPLACE keeps each function's grants; restated so a reader sees
-- them in one place.
revoke execute on function public.scoring_record_result(uuid, text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_record_result(uuid, text, boolean, uuid, text, text)
  to service_role;
revoke execute on function public.scoring_set_run_status(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_run_status(uuid, text, uuid, text, text)
  to service_role;
revoke execute on function public.scoring_take_out(uuid, text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_take_out(uuid, text, boolean, uuid, text, text)
  to service_role;
revoke execute on function public.scoring_call_pool(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_call_pool(uuid, text, uuid, text, text)
  to service_role;

-- 4. Check the result ---------------------------------------------------------

do $verify$
declare
  v_record text := pg_catalog.pg_get_functiondef(
    'public.scoring_record_result(uuid, text, boolean, uuid, text, text)'::pg_catalog.regprocedure);
  v_status text := pg_catalog.pg_get_functiondef(
    'public.scoring_set_run_status(uuid, text, uuid, text, text)'::pg_catalog.regprocedure);
  v_take_out text := pg_catalog.pg_get_functiondef(
    'public.scoring_take_out(uuid, text, boolean, uuid, text, text)'::pg_catalog.regprocedure);
  v_call text := pg_catalog.pg_get_functiondef(
    'public.scoring_call_pool(uuid, text, uuid, text, text)'::pg_catalog.regprocedure);
begin
  if pg_catalog.to_regprocedure('public.scoring_leave_course(uuid, integer)') is null then
    raise exception 'scoring_leave_course is missing.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.scoring_leave_course(uuid, integer)'::pg_catalog.regprocedure, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.scoring_leave_course(uuid, integer)'::pg_catalog.regprocedure, 'EXECUTE')
  then
    raise exception 'A browser role can execute scoring_leave_course.';
  end if;

  if position('scoring_advance_live_pointer' in v_record) > 0
    or position('scoring_advance_live_pointer' in v_status) > 0
    or position('scoring_advance_live_pointer' in v_take_out) > 0
    or position('scoring_advance_live_pointer' in v_call) > 0
  then
    raise exception 'A judge''s write still puts the next rider on course by itself.';
  end if;

  if (char_length(v_record) - char_length(replace(v_record, 'public.scoring_leave_course(', '')))
       / char_length('public.scoring_leave_course(') <> 2
    or position('public.scoring_leave_course(' in v_status) = 0
    or position('public.scoring_leave_course(' in v_take_out) = 0
  then
    raise exception 'A result, a skip or a take-out does not leave the course empty.';
  end if;

  if position('current_run_id = null' in v_call) = 0
    or position('current_run_id = v_first_run.id' in v_call) > 0
    or position('set status = ''on_course''' in v_call) > 0
  then
    raise exception 'scoring_call_pool still puts the pool''s first rider on course.';
  end if;
end
$verify$;

-- Verification (run by hand after applying; expected results in comments) ----
--
-- -- After a result: nobody on course, the next rider still waiting.
-- select live.current_run_id, live.called_pool_label from public.scoring_live_state as live;
--   -- current_run_id is null until the judge taps Start
-- select count(*) from public.scoring_runs as run where run.status = 'on_course';
--   -- 0 between riders, 1 while a rider rides

notify pgrst, 'reload schema';
