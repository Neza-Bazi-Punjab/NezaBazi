-- Staff roles: judges and commentators.
--
-- Until now a profile was either a `player` or an `admin`. Live scoring needs
-- two more kinds of staff who are not administrators:
--
--   judge        records results at the track and moves the live pointer
--                (/judge), and reads the commentary panel;
--   commentator  reads the commentary panel (/commentary): who is on course,
--                who is next, and the rider's background for the announcer.
--
-- Administrators can do everything both can. Nothing about `is_admin()`
-- changes: every existing admin-only policy keeps meaning exactly what it
-- meant, and a judge gains no access to the registration tables, the audit log
-- or anything else under /admin.
--
-- What this migration does, in order:
--
--   1. Replaces the CHECK on profiles.role so it accepts the four roles.
--   2. Replaces admin_set_profile_role() — same signature, same grants, same
--      audit action names — so administrators can assign the two new roles
--      from the Profiles tab. It remains the only role write path: the
--      existing lock (lock_profiles_prevent_role_self_escalation) still stops
--      anyone changing their own role from a browser.
--   3. Adds public.has_role(variadic text[]), the role-list counterpart of
--      is_admin(), for policies that admit more than one role.
--   4. Lets staff read every rider headshot (read only), so the commentary
--      panel can show the rider's photo while they are introduced.
--
-- The live project is migrated by hand in the Supabase SQL editor, so every
-- statement is idempotent and the file asserts its own preconditions: a second
-- run changes nothing, and a database that is not the shape this file expects
-- fails loudly instead of being half-patched.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
declare
  v_unknown_roles text;
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'public.profiles not found — this migration extends the existing schema.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.profiles'::pg_catalog.regclass
      and attribute.attname = 'role'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'public.profiles.role not found — apply the earlier migrations first.';
  end if;

  if pg_catalog.to_regclass('public.admin_audit_log') is null then
    raise exception 'public.admin_audit_log not found — apply harden_admin_audit_log first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found — the profiles RLS helpers are missing.';
  end if;

  if pg_catalog.to_regprocedure(
    'public.admin_set_profile_role(uuid, text, text, uuid, text, text)'
  ) is null then
    raise exception 'admin_set_profile_role() not found — apply harden_admin_audit_log first.';
  end if;

  if pg_catalog.to_regclass('storage.objects') is null
    or pg_catalog.to_regclass('storage.buckets') is null then
    raise exception 'Supabase storage tables not found — this must run on a Supabase project.';
  end if;

  if not exists (select 1 from storage.buckets where id = 'rider-headshots') then
    raise exception 'The rider-headshots bucket is missing — apply rider_headshots first.';
  end if;

  -- The new CHECK would reject these rows, and the failure would name only
  -- the constraint. Say which values are in the way instead.
  select string_agg(distinct profile.role, ', ')
  into v_unknown_roles
  from public.profiles as profile
  where profile.role is not null
    and profile.role not in ('player', 'judge', 'commentator', 'admin');

  if v_unknown_roles is not null then
    raise exception 'profiles.role holds values outside player/judge/commentator/admin: %', v_unknown_roles;
  end if;
end
$preconditions$;

-- 1. Allow the four roles ----------------------------------------------------
-- The original CHECK was created in the dashboard before this repository
-- tracked SQL, so its name is not known for certain. Every CHECK on profiles
-- whose definition mentions `role` is looked up in pg_constraint (by conrelid
-- and definition text) and dropped, then one named constraint is added. When
-- there is none, the loop does nothing and the constraint is simply added. On
-- a second run this drops and re-adds profiles_role_check. The definitions
-- dropped are reported as NOTICEs so whoever applies this can see what was
-- replaced.

do $role_check$
declare
  v_constraint record;
begin
  for v_constraint in
    select
      con.conname,
      pg_catalog.pg_get_constraintdef(con.oid) as definition
    from pg_catalog.pg_constraint as con
    where con.conrelid = 'public.profiles'::pg_catalog.regclass
      and con.contype = 'c'
      and pg_catalog.pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    raise notice 'Dropping profiles constraint %: %', v_constraint.conname, v_constraint.definition;
    execute pg_catalog.format(
      'alter table public.profiles drop constraint %I',
      v_constraint.conname
    );
  end loop;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('player', 'judge', 'commentator', 'admin'));
end
$role_check$;

-- 2. Role changes accept all four roles --------------------------------------
-- Same signature as harden_admin_audit_log's version, so /api/admin/users
-- keeps calling it unchanged. Audit action names are kept for the history
-- that already exists: `promote_admin` when the new role is admin,
-- `demote_admin` when the old role was admin, and `set_role` for every other
-- change (player <-> judge <-> commentator). old_role and new_role are always
-- in the details, so the audit log reads correctly whichever action it is.

create or replace function public.admin_set_profile_role(
  p_profile_id uuid,
  p_new_role text,
  p_subject_name text,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_role text;
  v_action text;
begin
  if p_new_role is null
    or p_new_role not in ('player', 'judge', 'commentator', 'admin') then
    raise exception 'Invalid profile role.' using errcode = '22023';
  end if;

  select profile.role
  into v_old_role
  from public.profiles as profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_new_role
  where id = p_profile_id;

  v_action := case
    when p_new_role = 'admin' then 'promote_admin'
    when v_old_role = 'admin' then 'demote_admin'
    else 'set_role'
  end;

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
    v_action,
    'profiles',
    p_profile_id::text,
    jsonb_build_object(
      'subject_name', p_subject_name,
      'old_role', v_old_role,
      'new_role', p_new_role
    )
  );
end;
$$;

revoke execute on function public.admin_set_profile_role(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_profile_role(uuid, text, text, uuid, text, text)
  to service_role;

-- 3. has_role() --------------------------------------------------------------
-- `security definer` is required, not a convenience. This function reads
-- public.profiles, and profiles is protected by RLS whose policies themselves
-- call is_admin(). Run as the caller (security invoker), the read would be
-- filtered through those policies, and any profiles policy that consulted
-- has_role() would recurse into itself. Running as the owner bypasses RLS for
-- this one lookup, exactly as is_admin() does, which is what "recursion-safe"
-- means here.
--
-- It is safe because it can only ever answer a yes/no question about the
-- caller's own row: the id compared is auth.uid(), never an argument, so it
-- cannot be used to probe anyone else's role. search_path is empty so nothing
-- a caller creates can shadow public.profiles or auth.uid().
--
-- Granted to `authenticated` only: anonymous visitors have no role, and the
-- storage policy below is scoped to authenticated as well.

create or replace function public.has_role(variadic p_roles text[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = any (p_roles)
  );
$$;

comment on function public.has_role(text[]) is
  'True when the signed-in user''s profiles.role is one of the arguments. '
  'Security definer and recursion-safe in the same way as is_admin().';

revoke execute on function public.has_role(text[]) from public, anon, authenticated;
grant execute on function public.has_role(text[]) to authenticated;

-- 4. Staff read every headshot -----------------------------------------------
-- Mirrors "Admins read every headshot" from rider_headshots: read only, no
-- insert/update/delete policy, so a photo can still only be changed by the
-- rider it belongs to. Commentators need it to put a face to the name they
-- announce; judges have the commentary panel too. The server mints the
-- panel's signed URLs with the service role today, so this policy is what lets
-- a staff member's own session do the same if a panel ever signs URLs from the
-- browser. `(select ...)` evaluates the role lookup once per statement rather
-- than once per object row.

drop policy if exists "Staff read every headshot" on storage.objects;
create policy "Staff read every headshot"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'rider-headshots'
    and (select public.has_role('judge', 'commentator', 'admin'))
  );

-- Verification (run by hand after applying; expected results in comments) ----
--
-- -- The one role CHECK, allowing exactly the four roles:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.profiles'::regclass and contype = 'c';
--   -- profiles_role_check | CHECK ((role = ANY (ARRAY['player'::text, 'judge'::text, 'commentator'::text, 'admin'::text])))
--
-- -- has_role is security definer, executable by authenticated only:
-- select p.prosecdef,
--        has_function_privilege('anon', p.oid, 'execute') as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated
-- from pg_proc p where p.oid = 'public.has_role(text[])'::regprocedure;
--   -- t | f | t
--
-- -- admin_set_profile_role is service-role only:
-- select has_function_privilege(
--   'authenticated',
--   'public.admin_set_profile_role(uuid, text, text, uuid, text, text)'::regprocedure,
--   'execute'
-- );
--   -- f
--
-- -- The read-only staff policy exists:
-- select policyname, cmd from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and policyname = 'Staff read every headshot';
--   -- Staff read every headshot | SELECT

-- Tell PostgREST about the new and changed functions straight away.
notify pgrst, 'reload schema';
