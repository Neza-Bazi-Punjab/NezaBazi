-- Headshots for solo riders who have no account.
--
-- A rider's photo normally lives with their account (Auth metadata
-- `headshot_path`, object at `<profile_id>/<file>.jpg`; see
-- 20260729020000_rider_headshots.sql). A rider entered from a paper form may
-- have no phone, no email and no account, so an administrator taking their
-- photo at the desk has nowhere to put it. This column holds it on the
-- registration instead, at `paper/<registration_id>/<file>.jpg`.
--
-- When the rider later signs up and confirms the email recorded on the entry,
-- the entry is claimed by their account (src/lib/supabase/sync-registration-profile.ts)
-- and the photo is moved onto the account, clearing this column.
--
-- Storage: no policy change. Every rider policy pins the first folder to
-- auth.uid(), which is never the literal 'paper', so no rider can read, write
-- or delete these objects; "Admins read every headshot" already covers them;
-- writes go through the service role in /api/admin/headshots.
--
-- The live project is migrated by hand in the SQL editor, so every statement
-- is idempotent and the file checks its own result.

alter table public.solo_registrations
  add column if not exists headshot_path text;

-- The path can only ever point into this registration's own folder, so a row
-- can never be made to show another rider's photo.
do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_headshot_path_own_folder'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_headshot_path_own_folder
      check (
        headshot_path is null
        or headshot_path ~ ('^paper/' || id::text || '/[A-Za-z0-9._-]{1,200}$')
      );
  end if;
end
$constraint$;

-- Readable like the rest of the row, so `select *` keeps working for signed-in
-- users. No INSERT or UPDATE grant: only the service role sets it.
grant select (headshot_path) on public.solo_registrations to authenticated;

-- Checks ---------------------------------------------------------------------
do $check$
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.solo_registrations'::pg_catalog.regclass
      and attname = 'headshot_path'
      and not attisdropped
  ) then
    raise exception 'solo_registrations.headshot_path is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_headshot_path_own_folder'
  ) then
    raise exception 'The headshot_path own-folder check is missing.';
  end if;

  if not pg_catalog.has_column_privilege(
    'authenticated', 'public.solo_registrations', 'headshot_path', 'select'
  ) then
    raise exception 'authenticated cannot read headshot_path, so `select *` on solo_registrations would fail.';
  end if;

  -- The own-folder check means even a stray UPDATE grant could not point a
  -- row at someone else's photo, so this is a notice rather than a failure.
  if pg_catalog.has_column_privilege(
    'authenticated', 'public.solo_registrations', 'headshot_path', 'update'
  ) then
    raise notice 'authenticated can update headshot_path (a table-wide UPDATE grant?). The own-folder check still limits it to the row''s own folder.';
  end if;

  raise notice 'solo_registrations.headshot_path is ready.';
end
$check$;
