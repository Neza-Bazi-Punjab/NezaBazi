-- REVERT of 20261107130000_scoring_judge_starts_each_rider.sql: a result puts
-- the next rider on course by itself again.
--
-- When to use it: only if the organisers decide, after
-- 20261107130000_scoring_judge_starts_each_rider.sql has been applied, that
-- the judges should NOT tap Start for each rider — that a result, a skip or a
-- take-out of the rider on course moves the next rider straight on course,
-- and that calling a pool puts its first rider on course, as before 7 November
-- 2026. It is not applied automatically and is not a migration: run it by
-- hand in the Supabase SQL editor, between riders, and ship the matching code
-- (the judges' panel and src/lib/scoring/sample-engine.ts from before that
-- change) at the same time, or the panel and the training demo will disagree
-- with the database.
--
-- It puts the four original pieces back with the same asserted technique
-- (each anchor exactly once; a second run changes nothing), so
-- scoring_record_result, scoring_set_run_status and scoring_take_out call
-- scoring_advance_live_pointer again and scoring_call_pool puts the pool's
-- first rider on course again. Then it drops scoring_leave_course, which
-- nothing calls any more. Locks, refusals and audit rows were never changed,
-- so they need nothing. Running 20261107130000 again re-applies the change.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_advance_live_pointer(uuid, integer)') is null then
    raise exception 'scoring_advance_live_pointer(uuid, integer) not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_record_result(uuid, text, boolean, uuid, text, text)') is null
    or pg_catalog.to_regprocedure('public.scoring_set_run_status(uuid, text, uuid, text, text)') is null
    or pg_catalog.to_regprocedure('public.scoring_call_pool(uuid, text, uuid, text, text)') is null
    or pg_catalog.to_regprocedure('public.scoring_take_out(uuid, text, boolean, uuid, text, text)') is null
  then
    raise exception 'A scoring function is missing — apply 20261025120000 and 20261107100000 first.';
  end if;
end
$preconditions$;

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
    raise exception 'A scoring function to patch is missing.';
  end if;

  v_original := replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n');

  if position(p_replacement in v_original) > 0 then
    raise notice '% is already reverted; left unchanged.', p_function;
    return;
  end if;

  v_occurrences := (
    char_length(v_original) - char_length(replace(v_original, p_anchor, ''))
  ) / char_length(p_anchor);

  if v_occurrences <> 1 then
    raise exception 'Could not revert %: expected its anchor once, found it % times.',
      p_function, v_occurrences;
  end if;

  v_definition := replace(v_original, p_anchor, p_replacement);
  execute v_definition;

  v_definition := replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n');

  if position(p_replacement in v_definition) = 0 then
    raise exception '% was not reverted.', p_function;
  end if;
end;
$$;

-- 1. A result, a skip or a take-out moves the next rider on course ------------

select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_record_result(uuid, text, boolean, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_leave_course(v_run.round_id, v_run.run_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_run.run_order);$replacement$
);

select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_record_result(uuid, text, boolean, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_leave_course(v_run.round_id, v_current_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_current_order);$replacement$
);

select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_set_run_status(uuid, text, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_leave_course(v_run.round_id, v_run.run_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_run.run_order);$replacement$
);

select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_take_out(uuid, text, boolean, uuid, text, text)'),
  $anchor$v_next_run_id := public.scoring_leave_course(p_round_id, v_current.run_order);$anchor$,
  $replacement$v_next_run_id := public.scoring_advance_live_pointer(p_round_id, v_current.run_order);$replacement$
);

-- 2. A call-up puts the pool's first rider on course -------------------------

select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_call_pool(uuid, text, uuid, text, text)'),
  $anchor$  -- Nobody is on course after a call-up (20261107130000): the pool comes
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
    and run.status = 'on_course';$anchor$,
  $replacement$  -- The rider leaving the course goes back to waiting (possibly in another
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
    and run.status = 'pending';$replacement$
);

select pg_temp.scoring_patch_body(
  pg_catalog.to_regprocedure('public.scoring_call_pool(uuid, text, uuid, text, text)'),
  $anchor$    current_run_id = null, -- the judge taps Start (20261107130000)$anchor$,
  $replacement$    current_run_id = v_first_run.id,$replacement$
);

-- 3. Nothing calls scoring_leave_course any more -------------------------------

drop function if exists public.scoring_leave_course(uuid, integer);

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
  if position('scoring_leave_course' in v_record) > 0
    or position('scoring_leave_course' in v_status) > 0
    or position('scoring_leave_course' in v_take_out) > 0
    or position('scoring_advance_live_pointer' in v_record) = 0
    or position('scoring_advance_live_pointer' in v_status) = 0
    or position('scoring_advance_live_pointer' in v_take_out) = 0
  then
    raise exception 'A result, a skip or a take-out still leaves the course empty.';
  end if;

  if position('current_run_id = v_first_run.id' in v_call) = 0
    or position('20261107130000' in v_call) > 0
  then
    raise exception 'scoring_call_pool still leaves the course empty.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_leave_course(uuid, integer)') is not null then
    raise exception 'scoring_leave_course is still there.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
