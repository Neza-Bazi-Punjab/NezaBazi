-- Dal Panth: one optional line organisers keep about each rider.
--
-- Asked for by the head organiser on 10 Nov 2026, the evening before the
-- event: one blank box per rider, filled in by organisers only (the Solo
-- Riders and Teams lists, paper entry, the check-in desk). Riders never fill
-- it in, and it is staff-only: it names an organisation, and the site names
-- none on any public page, feed or overlay.
--
-- Check-in runs on the existing functions all morning, so this migration only
-- ADDS. It patches, drops, recreates and calls no existing function. It adds:
--   1. a nullable text column dal_panth on solo_registrations and
--      team_members, with a length check (1 to 120 characters once trimmed,
--      when present) and a column SELECT grant for authenticated (the admin
--      lists read with the administrator's own session). No INSERT or UPDATE
--      grant: UPDATE on both tables is a column list since
--      registration_confirmation_codes, so a rider cannot change it;
--   2. admin_set_dal_panth(code, value, actor...), service role only, which
--      sets the value on every entry the rider holds under that code (solo
--      entry and team place stay in step) and writes one audit row, in one
--      transaction. An unchanged value writes nothing;
--   3. admin_sync_dal_panth(), service role only, which copies a solo entry's
--      value onto a team place with the same code that has none. A desk team
--      copies the solo entry with a fixed column list that predates this
--      column, and that function is not touched; the desk-teams route calls
--      this after it instead. No audit row: it repeats a value an
--      administrator already set.
--
-- Old code keeps working after this is applied (nothing names the column),
-- and new code keeps working before it is (it reports that this update is
-- needed). Idempotent: a second run changes nothing.
--
-- Undo: supabase/migrations/revert/20261110100000_rider_dal_panth.revert.sql
-- (refuses while any Dal Panth is stored).

-- 1. Preconditions ------------------------------------------------------------

do $precondition$
declare
  target_table text;
  target_column text;
begin
  foreach target_table in array array['solo_registrations', 'team_members', 'admin_audit_log']
  loop
    if pg_catalog.to_regclass('public.' || target_table) is null then
      raise exception 'public.% is missing. Apply the earlier migrations first.', target_table;
    end if;
  end loop;

  foreach target_table in array array['solo_registrations', 'team_members']
  loop
    foreach target_column in array array['id', 'confirmation_code', 'full_name', 'created_at']
    loop
      if not exists (
        select 1
        from pg_catalog.pg_attribute
        where attrelid = pg_catalog.to_regclass('public.' || target_table)
          and attname = target_column
          and attnum > 0
          and not attisdropped
      ) then
        raise exception 'public.%.% is missing. Apply the earlier migrations first.', target_table, target_column;
      end if;
    end loop;
  end loop;
end
$precondition$;

-- 2. The column ---------------------------------------------------------------

alter table public.solo_registrations
  add column if not exists dal_panth text;

alter table public.team_members
  add column if not exists dal_panth text;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_dal_panth_length'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_dal_panth_length
      check (
        dal_panth is null
        or char_length(btrim(dal_panth)) between 1 and 120
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.team_members'::pg_catalog.regclass
      and conname = 'team_members_dal_panth_length'
  ) then
    alter table public.team_members
      add constraint team_members_dal_panth_length
      check (
        dal_panth is null
        or char_length(btrim(dal_panth)) between 1 and 120
      );
  end if;
end
$constraint$;

-- SELECT is table-wide today; the column grant keeps it readable if that is
-- ever narrowed. Deliberately no INSERT or UPDATE grant (see the header).
grant select (dal_panth) on public.solo_registrations to authenticated;
grant select (dal_panth) on public.team_members to authenticated;

-- 3. admin_set_dal_panth ------------------------------------------------------
-- Modelled on admin_set_check_in: by code across both tables, one audit row,
-- security invoker, empty search path.

create or replace function public.admin_set_dal_panth(
  p_code text,
  p_dal_panth text,
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
  normalized_code text := upper(btrim(p_code));
  new_value text;
  rider_name text;
  value_before text;
  solo_updated integer := 0;
  team_updated integer := 0;
begin
  if normalized_code is null or normalized_code = '' then
    raise exception 'Rider not found.' using errcode = 'P0002';
  end if;

  -- Whitespace runs become one space, then trimmed; blank (or null) clears.
  new_value := nullif(
    btrim(pg_catalog.regexp_replace(coalesce(p_dal_panth, ''), '\s+', ' ', 'g')),
    ''
  );

  if char_length(new_value) > 120 then
    raise exception 'Dal Panth must be 120 characters or fewer.' using errcode = '22023';
  end if;

  -- Lock every entry under this code, solo first then team (the order
  -- admin_set_check_in updates them in), so the value read below is the one
  -- the updates replace.
  perform 1
  from public.solo_registrations as solo
  where upper(btrim(solo.confirmation_code)) = normalized_code
  for update;

  perform 1
  from public.team_members as member
  where upper(btrim(member.confirmation_code)) = normalized_code
  for update;

  -- The name and the value before: the solo entry's when there is one, else
  -- the team place's.
  select entry.full_name, entry.dal_panth
  into rider_name, value_before
  from (
    select 1 as preference, solo.full_name, solo.dal_panth, solo.created_at, solo.id
    from public.solo_registrations as solo
    where upper(btrim(solo.confirmation_code)) = normalized_code
    union all
    select 2 as preference, member.full_name, member.dal_panth, member.created_at, member.id
    from public.team_members as member
    where upper(btrim(member.confirmation_code)) = normalized_code
  ) as entry
  order by entry.preference, entry.created_at, entry.id
  limit 1;

  if not found then
    raise exception 'Rider not found.' using errcode = 'P0002';
  end if;

  -- Every entry under the code ends with the same value; rows that already
  -- hold it are left alone.
  update public.solo_registrations as solo
  set dal_panth = new_value
  where upper(btrim(solo.confirmation_code)) = normalized_code
    and solo.dal_panth is distinct from new_value;

  get diagnostics solo_updated = row_count;

  update public.team_members as member
  set dal_panth = new_value
  where upper(btrim(member.confirmation_code)) = normalized_code
    and member.dal_panth is distinct from new_value;

  get diagnostics team_updated = row_count;

  if solo_updated + team_updated > 0 then
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
      'set_dal_panth',
      'registrations',
      normalized_code,
      jsonb_build_object(
        'subject_name', rider_name,
        'confirmation_code', normalized_code,
        'before', value_before,
        'after', new_value,
        'solo_entries', solo_updated,
        'team_entries', team_updated
      )
    );
  end if;

  return jsonb_build_object(
    'confirmation_code', normalized_code,
    'full_name', rider_name,
    'dal_panth', new_value,
    'solo_entries', solo_updated,
    'team_entries', team_updated,
    'changed', solo_updated + team_updated > 0
  );
end;
$$;

comment on function public.admin_set_dal_panth(text, text, uuid, text, text) is
  'Sets (or clears) a rider''s Dal Panth on every entry under their confirmation code, '
  'with one audit row when anything changed, in one transaction. Service role only.';

revoke execute on function public.admin_set_dal_panth(text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_dal_panth(text, text, uuid, text, text)
  to service_role;

-- 4. admin_sync_dal_panth -----------------------------------------------------

create or replace function public.admin_sync_dal_panth()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  filled integer := 0;
begin
  -- One value per code (the earliest solo entry's, should a code ever be on
  -- two), copied only onto team places that have none.
  update public.team_members as member
  set dal_panth = source.dal_panth
  from (
    select distinct on (upper(btrim(solo.confirmation_code)))
      upper(btrim(solo.confirmation_code)) as code_key,
      solo.dal_panth
    from public.solo_registrations as solo
    where solo.dal_panth is not null
      and solo.confirmation_code is not null
    order by upper(btrim(solo.confirmation_code)), solo.created_at, solo.id
  ) as source
  where member.dal_panth is null
    and member.confirmation_code is not null
    and upper(btrim(member.confirmation_code)) = source.code_key;

  get diagnostics filled = row_count;

  return filled;
end;
$$;

comment on function public.admin_sync_dal_panth() is
  'Copies a solo entry''s Dal Panth onto team places with the same confirmation code '
  'that have none (desk teams). Returns how many were filled. Service role only.';

revoke execute on function public.admin_sync_dal_panth()
  from public, anon, authenticated;
grant execute on function public.admin_sync_dal_panth()
  to service_role;

-- 5. Checks -------------------------------------------------------------------
-- Fail the migration rather than report success over a partial result.

do $verify$
declare
  target_table text;
  target_function text;
begin
  foreach target_table in array array['solo_registrations', 'team_members']
  loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute
      where attrelid = pg_catalog.to_regclass('public.' || target_table)
        and attname = 'dal_panth'
        and atttypid = 'pg_catalog.text'::pg_catalog.regtype
        and not attnotnull
        and not attisdropped
    ) then
      raise exception 'public.%.dal_panth is missing, not text, or not nullable.', target_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass('public.' || target_table)
        and conname = target_table || '_dal_panth_length'
        and contype = 'c'
        and pg_catalog.pg_get_constraintdef(oid) like '%120%'
    ) then
      raise exception 'The length check on public.%.dal_panth is missing.', target_table;
    end if;

    if not pg_catalog.has_column_privilege(
      'authenticated', 'public.' || target_table, 'dal_panth', 'SELECT'
    ) then
      raise exception 'authenticated cannot read public.%.dal_panth, so the admin lists would fail.', target_table;
    end if;

    -- Riders must never be able to change it.
    if pg_catalog.has_column_privilege(
      'authenticated', 'public.' || target_table, 'dal_panth', 'UPDATE'
    ) then
      raise exception 'authenticated can UPDATE public.%.dal_panth; only administrators may set it.', target_table;
    end if;
  end loop;

  foreach target_function in array array[
    'public.admin_set_dal_panth(text, text, uuid, text, text)',
    'public.admin_sync_dal_panth()'
  ]
  loop
    if pg_catalog.to_regprocedure(target_function) is null then
      raise exception '% is missing.', target_function;
    end if;

    if pg_catalog.has_function_privilege('anon', target_function, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', target_function, 'EXECUTE')
    then
      raise exception '% is executable by a browser role.', target_function;
    end if;

    if not pg_catalog.has_function_privilege('service_role', target_function, 'EXECUTE') then
      raise exception 'service_role cannot execute %.', target_function;
    end if;
  end loop;

  if (
    select pg_catalog.format_type(prorettype, null)
    from pg_catalog.pg_proc
    where oid = pg_catalog.to_regprocedure('public.admin_set_dal_panth(text, text, uuid, text, text)')
  ) <> 'jsonb'
    or (
      select pg_catalog.format_type(prorettype, null)
      from pg_catalog.pg_proc
      where oid = pg_catalog.to_regprocedure('public.admin_sync_dal_panth()')
    ) <> 'integer'
  then
    raise exception 'admin_set_dal_panth / admin_sync_dal_panth return the wrong type.';
  end if;

  raise notice 'Dal Panth is ready: column on both rider tables, admin_set_dal_panth and admin_sync_dal_panth installed, service role only.';
end
$verify$;

-- New column and functions: have PostgREST pick them up now rather than on
-- its next schema poll.
notify pgrst, 'reload schema';
