-- Live scoring: a run's location snapshot holds district and state only.
--
-- 20261025120000_live_scoring.sql says runs carry only what is announced over
-- the PA, but its insert trigger copied the rider's registered location whole:
-- "Village, District, State, Country". The village is the rider's own address.
-- The API now cuts it to district and state on the way out (shortLocation and
-- toPublicRun in src/lib/scoring/types.ts), yet scoring_runs and the
-- scoring_leaderboard view are readable with the public key by design (the
-- scoreboard and the realtime subscription need it), and realtime pushes the
-- raw row to every open browser. So the full address must never be stored in
-- the snapshot in the first place. This migration:
--
--   1. adds public.scoring_short_location(text), the SQL twin of shortLocation;
--   2. patches scoring_runs_before_insert so every new run stores the short
--      form, whether the location came from the start-list builder or was
--      filled from the registration by the trigger itself;
--   3. shortens any run written before this migration (there are none on the
--      live project today, but a rehearsal could have drawn some).
--
-- The staff panels lose nothing: the commentary panel reads the village from
-- the registration (src/lib/scoring/rider-detail.ts), not from the run.
--
-- Apply any time after 20261025120000_live_scoring.sql. Until it is applied
-- the public API still shortens, but the raw table, the view and the realtime
-- events carry the full address. Re-running 20261025120000 replaces the
-- trigger with its original body, so run this file again after it.
--
-- The live project is migrated by hand in the SQL editor, so every statement
-- is idempotent and checks its own result: a second run changes nothing, and a
-- database that is not the shape this file expects fails loudly instead of
-- being half-patched.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = pg_catalog.to_regclass('public.scoring_runs')
      and attribute.attname = 'rider_location'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'public.scoring_runs.rider_location not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.scoring_runs_before_insert()') is null then
    raise exception 'scoring_runs_before_insert() not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.scoring_runs'::pg_catalog.regclass
      and trigger_row.tgname = 'scoring_runs_before_insert'
      and trigger_row.tgfoid = 'public.scoring_runs_before_insert()'::pg_catalog.regprocedure
      and not trigger_row.tgisinternal
  ) then
    raise exception 'The scoring_runs_before_insert trigger is missing from public.scoring_runs — apply 20261025120000_live_scoring.sql first.';
  end if;
end
$preconditions$;

-- 1. The helper ----------------------------------------------------------------
-- Must match shortLocation in src/lib/scoring/types.ts exactly: split on
-- commas, trim each part, drop the empty ones; two parts or fewer are joined
-- unchanged, otherwise the two parts before the last.
--
--   'Rehearsal Village, Amritsar, Punjab, India'  ->  'Amritsar, Punjab'
--   'Amritsar, Punjab'                            ->  'Amritsar, Punjab'
--   ' Amritsar '                                  ->  'Amritsar'
--   ',,' or ''                                    ->  null
--   null                                          ->  null (strict)
--
-- "Trim" is JavaScript's String.prototype.trim(): ASCII whitespace plus the
-- Unicode space separators, the line and paragraph separators and the BOM. A
-- plain btrim() would keep a no-break space pasted from a phone keyboard and
-- the two would disagree. The result is idempotent, so shortening a short
-- location changes nothing.
--
-- Security invoker, like every scoring function. Its only caller is
-- scoring_runs_before_insert, which is itself security invoker (section 3 of
-- 20261025120000), so it runs as whoever inserts the run: service_role, via
-- the scoring_* functions the server routes call, or the project owner in the
-- SQL editor, who owns this function. Both can execute it. anon and
-- authenticated cannot, and hold no INSERT on scoring_runs anyway.

create or replace function public.scoring_short_location(p_location text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  -- What String.prototype.trim() removes: tab, line feed, vertical tab, form
  -- feed, carriage return, space, U+00A0, U+1680, U+2000-U+200A, U+2028,
  -- U+2029, U+202F, U+205F, U+3000 and U+FEFF.
  c_trimmed constant text := E'\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF';
  v_parts text[];
  v_count integer;
begin
  select coalesce(pg_catalog.array_agg(split.trimmed order by split.part_number), '{}')
  into v_parts
  from (
    select pg_catalog.btrim(part.value, c_trimmed) as trimmed, part.part_number
    from pg_catalog.unnest(pg_catalog.string_to_array(p_location, ','))
      with ordinality as part(value, part_number)
  ) as split
  where split.trimmed <> '';

  v_count := pg_catalog.cardinality(v_parts);

  if v_count = 0 then
    return null;
  elsif v_count <= 2 then
    return pg_catalog.array_to_string(v_parts, ', ');
  end if;

  return pg_catalog.array_to_string(v_parts[v_count - 2 : v_count - 1], ', ');
end;
$$;

comment on function public.scoring_short_location(text) is
  'District and state from a registered "Village, District, State, Country". '
  'Must agree with shortLocation in src/lib/scoring/types.ts.';

revoke execute on function public.scoring_short_location(text)
  from public, anon, authenticated;
grant execute on function public.scoring_short_location(text)
  to service_role;

-- 2. The insert trigger stores the short form ----------------------------------
-- Patched in place from pg_get_functiondef rather than retyped, the technique
-- 20261025100000_rider_parent_names.sql uses for admin_mutate_registration:
-- the trigger is the identity check on every run, and transcribing it to wrap
-- one expression invites a silent divergence between this file and what is
-- deployed. The anchor must occur exactly once; the patch is skipped when its
-- result is already present, so a second run is a no-op, and a body that has
-- drifted from 20261025120000 fails loudly instead of being half-patched.

do $patch$
declare
  target_function constant regprocedure := pg_catalog.to_regprocedure(
    'public.scoring_runs_before_insert()'
  );
  anchor constant text :=
    $anchor$new.rider_location := coalesce(nullif(btrim(new.rider_location), ''), nullif(btrim(v_location), ''));$anchor$;
  replacement constant text :=
    $replacement$new.rider_location := public.scoring_short_location(coalesce(nullif(btrim(new.rider_location), ''), nullif(btrim(v_location), '')));$replacement$;
  original text;
  definition text;
  occurrences integer;
begin
  if target_function is null then
    raise exception 'scoring_runs_before_insert() not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  original := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');
  definition := original;

  -- Applied by an earlier run of this migration.
  if position(replacement in definition) > 0 then
    raise notice 'scoring_runs_before_insert already stores the short location; left unchanged.';
  else
    occurrences := (
      char_length(definition) - char_length(replace(definition, anchor, ''))
    ) / char_length(anchor);

    if occurrences <> 1 then
      raise exception
        'Could not patch the location snapshot in scoring_runs_before_insert: expected its anchor once, found it % times.',
        occurrences;
    end if;

    definition := replace(definition, anchor, replacement);

    if definition = original then
      raise exception 'Could not patch the location snapshot in scoring_runs_before_insert.';
    end if;

    execute definition;
  end if;

  -- Read the deployed body back rather than trusting the EXECUTE.
  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  if position(replacement in definition) = 0 or position(anchor in definition) > 0 then
    raise exception 'scoring_runs_before_insert does not store the short location.';
  end if;
end
$patch$;

-- CREATE OR REPLACE keeps the grants when the signature is unchanged, as it is
-- here, but restate the revoke so this migration is safe to run standalone.
-- Trigger-only: triggers fire without EXECUTE.
revoke execute on function public.scoring_runs_before_insert() from public, anon, authenticated;

-- 3. Runs written before this migration --------------------------------------
-- Rewrites only the rows whose snapshot is not already short, so a second run
-- touches nothing. Takes the live-state row first, the locking order every
-- scoring function follows, so it cannot interleave with (or deadlock
-- against) a judge recording a result. scoring_runs_set_updated_at stamps
-- updated_at on each changed row and realtime sends one UPDATE per row. Both
-- are harmless: updated_at only keys a viewer's refetch, nothing ranks or
-- decides by it, and no score, status or order changes.

do $backfill$
declare
  v_changed integer;
begin
  perform 1
  from public.scoring_live_state as live
  where live.id is true
  for update;

  update public.scoring_runs as run
  set rider_location = public.scoring_short_location(run.rider_location)
  where run.rider_location is distinct from public.scoring_short_location(run.rider_location);

  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    raise notice 'Shortened the location on % existing run(s).', v_changed;
  end if;
end
$backfill$;

-- 4. Check the result ---------------------------------------------------------

do $verify$
declare
  v_function regprocedure := pg_catalog.to_regprocedure('public.scoring_short_location(text)');
  v_definition text;
  v_fixture record;
begin
  if v_function is null then
    raise exception 'public.scoring_short_location(text) is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid = v_function
      and proc.provolatile = 'i'
      and proc.proisstrict
      and not proc.prosecdef
      and 'search_path=""' = any(proc.proconfig)
  ) then
    raise exception 'scoring_short_location is not immutable, strict, security invoker with an empty search_path.';
  end if;

  if pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
  then
    raise exception 'A browser role can execute scoring_short_location.';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role cannot execute scoring_short_location, so the insert trigger would fail.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.scoring_runs_before_insert()'::pg_catalog.regprocedure);

  if position('new.rider_location := public.scoring_short_location(' in v_definition) = 0 then
    raise exception 'scoring_runs_before_insert does not store the short location.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.scoring_runs'::pg_catalog.regclass
      and trigger_row.tgname = 'scoring_runs_before_insert'
      and trigger_row.tgfoid = 'public.scoring_runs_before_insert()'::pg_catalog.regprocedure
  ) then
    raise exception 'The scoring_runs_before_insert trigger is no longer attached to public.scoring_runs.';
  end if;

  -- The fixtures shortLocation is tested against in public-state.test.mts.
  for v_fixture in
    select fixture.input, fixture.expected
    from (
      values
        ('Rehearsal Village, Amritsar, Punjab, India', 'Amritsar, Punjab'),
        ('Amritsar, Punjab', 'Amritsar, Punjab'),
        (' Amritsar ', 'Amritsar'),
        (',,', null),
        ('', null)
    ) as fixture(input, expected)
  loop
    if public.scoring_short_location(v_fixture.input) is distinct from v_fixture.expected then
      raise exception 'scoring_short_location(%) returned %, expected %.',
        pg_catalog.quote_literal(v_fixture.input),
        pg_catalog.quote_nullable(public.scoring_short_location(v_fixture.input)),
        pg_catalog.quote_nullable(v_fixture.expected);
    end if;
  end loop;

  if exists (
    select 1
    from public.scoring_runs as run
    where run.rider_location like '%,%,%,%'
      or run.rider_location is distinct from public.scoring_short_location(run.rider_location)
  ) then
    raise exception 'A run still holds more than district and state in rider_location.';
  end if;
end
$verify$;

-- Verification (run by hand after applying; expected results in comments) ----
--
-- -- The helper: immutable, strict, empty search_path, service-role only.
-- select p.provolatile, p.proisstrict, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--        has_function_privilege('service_role', p.oid, 'execute') as service_role
-- from pg_proc p where p.oid = 'public.scoring_short_location(text)'::regprocedure;
--   -- i | t | {search_path=""} | f | f | t
--
-- -- It agrees with shortLocation in src/lib/scoring/types.ts.
-- select public.scoring_short_location('Rehearsal Village, Amritsar, Punjab, India') as four_parts,
--        public.scoring_short_location('Amritsar, Punjab') as two_parts,
--        public.scoring_short_location(' Amritsar ') as one_part,
--        public.scoring_short_location(',,') as only_commas,
--        public.scoring_short_location('') as blank;
--   -- Amritsar, Punjab | Amritsar, Punjab | Amritsar | null | null
--
-- -- The insert trigger stores the short form.
-- select position(
--   'new.rider_location := public.scoring_short_location(' in
--   pg_get_functiondef('public.scoring_runs_before_insert()'::regprocedure)
-- ) > 0 as patched;
--   -- t
--
-- -- No run holds more than district and state.
-- select count(*) from public.scoring_runs
-- where rider_location is distinct from public.scoring_short_location(rider_location);
--   -- 0

-- Tell PostgREST about the new function straight away.
notify pgrst, 'reload schema';
