-- Live scoring: check-ins after qualifying has started (Automatic mode).
--
-- From testing the auto engine on the live project, 11 Nov 2026 (a whole
-- event ridden through it inside rolled-back transactions):
--
--   1. Once qualifying has started, each check-in renumbers the whole start
--      list: about 270 ms with 135 riders, and 930 ms to undo one. Several
--      desks at once queue on the round, and the 1500 ms limit set by
--      20261110190000 was short enough for a queued check-in to give up
--      placing the rider. The limit is now 4000 ms: long enough for a queue
--      of desks to clear, still well inside the 8 s the request is allowed.
--   2. A rider who checked in after EVERY qualifying run had been ridden was
--      still added, with one run, which reopened a finished round ("1 ride
--      still to go") just as the next round was about to start. Once
--      qualifying has been ridden to the end a check-in adds nobody; an
--      administrator adds a late rider with the late-entrant tool.
--   3. A rider who is checked in but in no pool (a placement that gave up, or
--      case 2) looked the same at the desk as any other check-in. The desk's
--      pool reading now says so ("missing"), and the panel tells the
--      administrator to send the rider to the scoring desk.
--   4. Before qualifying starts the desk said "Pool given when qualifying
--      starts" in Manual mode too, where no pool is ever given on check-in.
--      The reading now carries the mode.
--
-- Patches the engine's functions as deployed, each by one asserted anchor.
-- Plain ASCII, and line endings are normalised on both sides, so it survives
-- being pasted from any machine. Apply after 20261110190000. Idempotent.
-- Re-running 20261110140000 or 20261110190000 undoes parts of this: run it
-- again after them.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_auto_place_rider(uuid, boolean, uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_auto_place_team(uuid, uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_desk_pool(text)') is null then
    raise exception 'The auto engine is not applied: run 20261110130000, 140000, 150000 and 190000 first.';
  end if;

  if position(
    'select distinct on (run.entrant_key) run.entrant_key, run.pool_label, run.run_order'
    in pg_catalog.pg_get_functiondef('public.scoring_desk_pool(text)'::regprocedure)
  ) = 0 then
    raise exception 'Apply 20261110190000_scoring_engine_fixes.sql first.';
  end if;
end
$preconditions$;

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

-- 1. A queued check-in waits long enough for the desks ahead of it ------------

alter function public.scoring_auto_place_rider(uuid, boolean, uuid) set lock_timeout = '4000ms';
alter function public.scoring_auto_place_team(uuid, uuid) set lock_timeout = '4000ms';

-- 2. Qualifying ridden to the end is not reopened by a check-in ----------------

select pg_temp.patch_scoring_function(
  'public.scoring_auto_place_rider(uuid, boolean, uuid)'::regprocedure,
  $anchor$      return 'already_in';
    end if;
$anchor$,
  $new$      return 'already_in';
    end if;

    -- Qualifying has been ridden to the end: a check-in does not reopen it.
    -- An administrator adds a late rider with the late-entrant tool.
    if exists (
      select 1 from public.scoring_runs as ridden
      where ridden.round_id = v_round.id and ridden.status = 'scored'
    ) and not exists (
      select 1 from public.scoring_runs as waiting
      where waiting.round_id = v_round.id and waiting.status in ('pending', 'on_course')
    ) then
      return 'qualifying_ridden';
    end if;
$new$,
  $marker$return 'qualifying_ridden';$marker$
);

-- 3. The desk learns when a checked-in rider is in no pool ----------------------

select pg_temp.patch_scoring_function(
  'public.scoring_desk_pool(text)'::regprocedure,
  $anchor$  return jsonb_build_object('started', true, 'pool', v_pool, 'position', v_position);$anchor$,
  $new$  return jsonb_build_object(
    'started', true,
    'pool', v_pool,
    'position', v_position,
    -- Automatic mode, an engine-made qualifying round with no round after it,
    -- the rider checked in, and yet no run of theirs in it.
    'missing', (
      v_position is null
      and coalesce((
        select engine.auto_on from public.scoring_engine_switch as engine where engine.id is true
      ), false)
      and exists (
        select 1 from public.scoring_rounds as qualifier
        where qualifier.id = v_round_id
          and qualifier.stage = 'qualifier'
          and not exists (
            select 1 from public.scoring_rounds as later
            where later.event_type = 'single' and later.sort_order > qualifier.sort_order
          )
      )
      and exists (
        select 1 from public.solo_registrations as checked
        where checked.id = v_solo_id and checked.checked_in_at is not null
      )
    )
  );$new$,
  $marker$'missing', ($marker$
);

-- 4. Before qualifying starts, the desk knows the mode --------------------------

select pg_temp.patch_scoring_function(
  'public.scoring_desk_pool(text)'::regprocedure,
  $anchor$    return jsonb_build_object('started', false, 'pool', null, 'position', null);$anchor$,
  $new$    return jsonb_build_object(
      'started', false,
      'pool', null,
      'position', null,
      'auto', coalesce((
        select engine.auto_on from public.scoring_engine_switch as engine where engine.id is true
      ), false)
    );$new$,
  $marker$'auto', coalesce(($marker$
);

-- 5. Check the result -----------------------------------------------------------

do $verify$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.scoring_auto_place_rider(uuid, boolean, uuid)'::regprocedure
      and 'lock_timeout=4000ms' = any (procedure.proconfig)
  ) or not exists (
    select 1 from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.scoring_auto_place_team(uuid, uuid)'::regprocedure
      and 'lock_timeout=4000ms' = any (procedure.proconfig)
  ) then
    raise exception 'lock_timeout is not 4000ms on the check-in placement functions.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.scoring_desk_pool(text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.scoring_desk_pool(text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.scoring_auto_place_rider(uuid, boolean, uuid)', 'execute') then
    raise exception 'A browser role can execute an engine function after patching.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
