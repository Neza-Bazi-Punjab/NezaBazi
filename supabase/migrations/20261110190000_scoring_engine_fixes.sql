-- Live scoring: fixes to the auto engine, from the review of 10 Nov 2026.
--
-- The engine's three migrations (20261110130000, 140000, 150000) were
-- applied to the live project before their code was reviewed. This file
-- repairs what the review found in the database, by patching the functions
-- as they are deployed (pg_get_functiondef, an anchor that must occur exactly
-- once, a marker that makes a second run a no-op). It patches only the
-- engine's own functions: nothing the manual Scoring page or check-in used
-- before the engine is touched.
--
--   1. Garbled text. 150000 reached the database with its punctuation
--      mis-decoded: a round name read "Teams Round 3 [junk] Full House", and
--      the "Auto:" notes and the switch's audit lines carried the same junk.
--      Every scoring_* function body is repaired, and any round name or
--      override note already written with it.
--   2. Singles, who goes through. The rule (the 4s; with no 4, the 2s; with
--      everyone on 0, everyone) was chosen from riders WITHOUT an override
--      only. If the 2s had been marked through by hand, only the 0s were
--      left, the rule became "everyone got 0", and every 0 went through too.
--      The rule is now chosen from every rider not overridden Out.
--   3. Undo next round removed every override still carrying an "Auto:"
--      note, including one an administrator had since turned to Out (the
--      editor keeps the note). Undo now removes only the ones still Through.
--   4. Check-in can never wait long. The two functions the check-in triggers
--      call get lock_timeout 1500ms: a check-in that cannot get the round
--      gives up placing the rider (the trigger already swallows that) instead
--      of hanging until the request is cancelled, which the trigger cannot
--      catch.
--   5. A rider who checks in late (Automatic mode) was given all three
--      attempts, even when the riding had moved past Round 1: that run sat
--      behind the pointer, was never ridden, and blocked Start next round.
--      A pass the riding has moved beyond is no longer given; a rider too
--      late for every pass is not added ("too_late").
--   6. The desk's "Pool C, rider 4" looked only at attempt 1, so such a late
--      rider had no pool shown. It now reads the rider's first run.
--   7. A team round made by hand (no stage) was taken for an engine round:
--      the card could offer "Start the Teams Final" after a hand-run Final.
--      The team plan now leaves a hand-made round to the administrator.
--
-- This file is plain ASCII on purpose (other characters are written with
-- chr()), so it cannot be damaged the way 150000 was.
--
-- Apply after 20261110150000_scoring_auto_teams.sql. Idempotent. Re-running
-- 130000, 140000 or 150000 puts their original functions back: run this file
-- again after them. No revert: each change is a correction, and the engine's
-- own reverts remove the functions altogether.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_next_team_round_plan(uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_auto_place_rider(uuid, boolean, uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_auto_place_team(uuid, uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_next_round_plan(uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_undo_next_round(uuid, uuid, text, text)') is null
     or pg_catalog.to_regprocedure('public.scoring_desk_pool(text)') is null then
    raise exception 'The auto engine is not fully applied: run 20261110130000, 140000 and 150000 first.';
  end if;
end
$preconditions$;

-- The patch helper: lives for this session only.
create or replace function pg_temp.patch_scoring_function(
  p_function regprocedure,
  p_anchor text,
  p_replacement text,
  p_marker text
)
returns text
language plpgsql
as $$
declare
  v_definition text;
  v_found integer;
  -- Line endings are made the same on BOTH sides. The SQL editor sends this
  -- file with Windows line endings when it is pasted from a Windows machine,
  -- so a patch text that spans lines arrives with CR LF while the function
  -- body is compared with LF. Without this such a patch is "found 0 times"
  -- (which is what the first run of this file did, changing nothing).
  v_anchor constant text := replace(p_anchor, E'\r\n', E'\n');
  v_replacement constant text := replace(p_replacement, E'\r\n', E'\n');
  v_marker constant text := replace(p_marker, E'\r\n', E'\n');
begin
  v_definition := replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n');

  if position(v_marker in v_definition) > 0 then
    return 'already applied';
  end if;

  v_found := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);

  if v_found <> 1 then
    raise exception '%: expected the text to patch exactly once, found % times: %',
      p_function, v_found, left(v_anchor, 70);
  end if;

  execute replace(v_definition, v_anchor, v_replacement);

  if position(v_marker in replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n')) = 0 then
    raise exception '%: the patch did not take.', p_function;
  end if;

  return 'patched';
end;
$$;

-- 1. Garbled text -------------------------------------------------------------
-- What was stored            What it should be
--   chr(8218) chr(196) chr(238)   an em dash       chr(8212)
--   chr(8218) chr(196) chr(182)   an ellipsis      chr(8230)
--   chr(172)  chr(8721)           a middle dot     chr(183)

create or replace function pg_temp.repair_text(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(p_text,
    chr(8218) || chr(196) || chr(238), chr(8212)),
    chr(8218) || chr(196) || chr(182), chr(8230)),
    chr(172) || chr(8721), chr(183));
$$;

do $repair$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select procedure.oid::regprocedure as signature
    from pg_catalog.pg_proc as procedure
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.prokind = 'f'
      and procedure.proname like 'scoring\_%'
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_function.signature);

    if v_definition <> pg_temp.repair_text(v_definition) then
      execute pg_temp.repair_text(v_definition);
      raise notice 'Repaired the text of %', v_function.signature;
    end if;
  end loop;
end
$repair$;

update public.scoring_rounds
set name = pg_temp.repair_text(name)
where name <> pg_temp.repair_text(name);

update public.scoring_advance_overrides
set note = pg_temp.repair_text(note)
where note is not null and note <> pg_temp.repair_text(note);

-- 2. Singles: the rule is chosen from every rider not overridden Out ------------

select pg_temp.patch_scoring_function(
  'public.scoring_next_round_plan(uuid)'::regprocedure,
  $anchor$where element -> 'override' = 'null'::jsonb and (element ->> 'carried')::boolean$anchor$,
  $new$where coalesce((element ->> 'override')::integer, 1) = 1 and (element ->> 'carried')::boolean$new$,
  $marker$where coalesce((element ->> 'override')::integer, 1) = 1 and (element ->> 'carried')::boolean$marker$
);

select pg_temp.patch_scoring_function(
  'public.scoring_next_round_plan(uuid)'::regprocedure,
  $anchor$where element -> 'override' = 'null'::jsonb and (element ->> 'struck')::boolean$anchor$,
  $new$where coalesce((element ->> 'override')::integer, 1) = 1 and (element ->> 'struck')::boolean$new$,
  $marker$where coalesce((element ->> 'override')::integer, 1) = 1 and (element ->> 'struck')::boolean$marker$
);

-- 3. Undo removes only the "Auto:" decisions that are still Through ------------

select pg_temp.patch_scoring_function(
  'public.scoring_undo_next_round(uuid, uuid, text, text)'::regprocedure,
  $anchor$    where advance_override.round_id = v_round.parent_round_id
      and advance_override.note in ($anchor$,
  $new$    where advance_override.round_id = v_round.parent_round_id
      and advance_override.advanced is true
      and advance_override.note in ($new$,
  $marker$      and advance_override.advanced is true
      and advance_override.note in ($marker$
);

-- 4. Check-in never waits long for the scoring tables ---------------------------

alter function public.scoring_auto_place_rider(uuid, boolean, uuid) set lock_timeout = '1500ms';
alter function public.scoring_auto_place_team(uuid, uuid) set lock_timeout = '1500ms';

-- 5. A late rider gets only the passes still to be ridden ------------------------

select pg_temp.patch_scoring_function(
  'public.scoring_auto_place_rider(uuid, boolean, uuid)'::regprocedure,
  $anchor$    for v_attempt in 1 .. v_round.attempts_per_rider loop
      v_run_order := v_run_order + 1;
$anchor$,
  $new$    for v_attempt in 1 .. v_round.attempts_per_rider loop
      -- A pass the riding has already moved beyond is not given to a late
      -- rider: that run would sit behind the pointer and never be ridden.
      if exists (
        select 1 from public.scoring_runs as ridden
        where ridden.round_id = v_round.id
          and ridden.status in ('scored', 'on_course')
          and ridden.attempt_number > v_attempt
      ) then
        continue;
      end if;

      v_run_order := v_run_order + 1;
$new$,
  $marker$and ridden.attempt_number > v_attempt$marker$
);

select pg_temp.patch_scoring_function(
  'public.scoring_auto_place_rider(uuid, boolean, uuid)'::regprocedure,
  $anchor$    -- Each attempt goes to the end of its own pass in that pool.
    perform public.scoring_renumber_round(v_round.id);
$anchor$,
  $new$    -- Too late for every pass: not added, and nothing is recorded.
    if not exists (
      select 1 from public.scoring_runs as placed
      where placed.round_id = v_round.id and placed.entrant_key = v_entrant_key
    ) then
      return 'too_late';
    end if;

    -- Each attempt goes to the end of its own pass in that pool.
    perform public.scoring_renumber_round(v_round.id);
$new$,
  $marker$return 'too_late';$marker$
);

-- 6. The desk reads the rider's first run, whichever attempt that is -----------

select pg_temp.patch_scoring_function(
  'public.scoring_desk_pool(text)'::regprocedure,
  $anchor$    select
      run.entrant_key,
      run.pool_label,
      (row_number() over (partition by run.pool_label order by run.run_order))::integer as position
    from public.scoring_runs as run
    where run.round_id = v_round_id
      and run.attempt_number = 1
  ) as ranked$anchor$,
  $new$    select
      first_run.entrant_key,
      first_run.pool_label,
      (row_number() over (partition by first_run.pool_label order by first_run.run_order))::integer as position
    from (
      select distinct on (run.entrant_key) run.entrant_key, run.pool_label, run.run_order
      from public.scoring_runs as run
      where run.round_id = v_round_id
      order by run.entrant_key, run.attempt_number, run.run_order
    ) as first_run
  ) as ranked$new$,
  $marker$select distinct on (run.entrant_key) run.entrant_key, run.pool_label, run.run_order$marker$
);

-- 7. A team round made by hand is left to the administrator --------------------

select pg_temp.patch_scoring_function(
  'public.scoring_next_team_round_plan(uuid)'::regprocedure,
  $anchor$  v_stage := coalesce(v_round.stage, 'section');
$anchor$,
  $new$  v_stage := coalesce(v_round.stage, 'section');

  -- Made by hand (no stage): the engine never takes over a round it did not
  -- make, as for Singles.
  if v_round.stage is null then
    return jsonb_build_object(
      'round_id', v_round.id,
      'round_name', v_round.name,
      'stage', null,
      'state', 'manual',
      'message', format('%s was made by hand, so Teams carry on by hand.', v_round.name)
    );
  end if;
$new$,
  $marker$was made by hand, so Teams carry on by hand.$marker$
);

-- 8. Check the result -----------------------------------------------------------

do $verify$
declare
  v_garbled integer;
begin
  select count(*)
  into v_garbled
  from pg_catalog.pg_proc as procedure
  where procedure.pronamespace = 'public'::regnamespace
    and procedure.prokind = 'f'
    and procedure.proname like 'scoring\_%'
    and pg_catalog.pg_get_functiondef(procedure.oid)
      <> pg_temp.repair_text(pg_catalog.pg_get_functiondef(procedure.oid));

  if v_garbled > 0 then
    raise exception '% scoring function(s) still carry garbled text.', v_garbled;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.scoring_auto_place_rider(uuid, boolean, uuid)'::regprocedure
      and 'lock_timeout=1500ms' = any (procedure.proconfig)
  ) or not exists (
    select 1 from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.scoring_auto_place_team(uuid, uuid)'::regprocedure
      and 'lock_timeout=1500ms' = any (procedure.proconfig)
  ) then
    raise exception 'lock_timeout is not set on the check-in placement functions.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.scoring_next_round_plan(uuid)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.scoring_auto_place_rider(uuid, boolean, uuid)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.scoring_desk_pool(text)', 'execute') then
    raise exception 'A browser role can execute an engine function after patching.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
