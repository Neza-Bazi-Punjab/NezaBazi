-- Riders may share an email address and a phone number.
--
-- The organisers confirmed on 7 Nov 2026 that several riders may be entered
-- with one email and one phone (a family, a club contact, a rider with no
-- email of their own). Until now both registration tables carried UNIQUE
-- (email) and UNIQUE (phone), the paper entry refused any match, and the
-- confirmation-code trigger reused a code whenever the email matched, so two
-- riders on one email would have shared one code and been checked in
-- together. See docs/superpowers/specs/2026-11-07-registration-is-the-rider.md.
--
-- The rule now. A true duplicate is the same full name already registered in
-- the same kind of entry (solo, or a team place) with the same email OR the
-- same phone. Names are compared lower-cased, trimmed and with runs of
-- whitespace collapsed (rider_name_key); phones by their digits, exactly as
-- paper_registration_phone_key compares them (phone_digits). That is refused;
-- everything else is allowed. Every rider gets their own confirmation code;
-- one rider holding a solo entry and a team place under the same name and
-- email still shares one code and one check-in.
--
-- This migration:
--   1. adds rider_name_key(text) and phone_digits(text), both IMMUTABLE so
--      they can sit in an index;
--   2. refuses to go on if existing rows already break the new rule;
--   3. adds the same-rider guard (two unique indexes per table) and plain
--      lookup indexes on the email and the phone digits;
--   4. drops the four UNIQUE constraints on email and phone;
--   5. replaces assign_confirmation_code: a code is reused only when the
--      email and the name both match an entry of the other kind, and only
--      for an insert the database can trust (see there);
--   6. patches admin_create_paper_registration's duplicate checks to the same
--      rule (asserted anchors, as 20261107100000 does);
--   7. adds team_members.headshot_path, as 20261108100000 did for solo.
--
-- Why phone_digits and not paper_registration_phone_key in the indexes:
-- paper_registration_phone_key is IMMUTABLE, but it is service-role only. The
-- online solo form and the team wizard insert as `authenticated`, and an
-- index expression is run with the inserting role's EXECUTE rights, so an
-- index on it would refuse every online registration. phone_digits is the
-- same body, executable by signed-in users (it reads nothing).
--
-- The live project is migrated by hand (or through the Supabase connector),
-- so every statement is idempotent: a second run changes nothing. Apply after
-- 20261025130000_paper_registrations.sql and 20261108110000. The undo is in
-- supabase/migrations/revert/.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regclass('public.solo_registrations') is null
    or pg_catalog.to_regclass('public.team_members') is null then
    raise exception 'solo_registrations or team_members not found.';
  end if;

  if pg_catalog.to_regprocedure('public.assign_confirmation_code()') is null then
    raise exception 'assign_confirmation_code() not found — apply 20260728163000_one_confirmation_code_per_rider.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.admin_create_paper_registration(text, jsonb, uuid, text, text)') is null
    or pg_catalog.to_regprocedure('public.paper_registration_phone_key(text)') is null then
    raise exception 'admin_create_paper_registration not found — apply 20261025130000_paper_registrations.sql first.';
  end if;

  -- The trigger below asks who is inserting: the request's token (Supabase's
  -- auth.jwt()) and the project's own is_admin().
  if pg_catalog.to_regprocedure('auth.jwt()') is null
    or pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception 'auth.jwt() or public.is_admin() not found; this file is written for a Supabase project.';
  end if;
end
$preconditions$;

-- 1. How two riders are compared ---------------------------------------------

-- Lower-cased, trimmed, runs of whitespace collapsed to one space: the same
-- rule as normaliseIdentityText in src/lib/registration-identity.ts.
create or replace function public.rider_name_key(p_name text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
$$;

-- By the digits once there are enough of them to be a number; anything
-- shorter as typed. The same body as paper_registration_phone_key.
create or replace function public.phone_digits(p_phone text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when char_length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 6
      then regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    else lower(btrim(coalesce(p_phone, '')))
  end;
$$;

-- Pure functions of their argument. Signed-in users need EXECUTE because the
-- indexes below run them on every online insert.
revoke execute on function public.rider_name_key(text) from public, anon;
revoke execute on function public.phone_digits(text) from public, anon;
grant execute on function public.rider_name_key(text) to authenticated, service_role;
grant execute on function public.phone_digits(text) to authenticated, service_role;

-- 2. Nothing already breaks the rule -----------------------------------------
-- Counts only: no rider's details are printed.

do $collisions$
declare
  solo_email_groups integer;
  solo_phone_groups integer;
  team_email_groups integer;
  team_phone_groups integer;
begin
  select count(*) into solo_email_groups from (
    select 1 from public.solo_registrations
    group by public.rider_name_key(full_name), lower(btrim(email))
    having count(*) > 1
  ) as duplicate_group;

  select count(*) into solo_phone_groups from (
    select 1 from public.solo_registrations
    where public.phone_digits(phone) <> ''
    group by public.rider_name_key(full_name), public.phone_digits(phone)
    having count(*) > 1
  ) as duplicate_group;

  select count(*) into team_email_groups from (
    select 1 from public.team_members
    group by public.rider_name_key(full_name), lower(btrim(email))
    having count(*) > 1
  ) as duplicate_group;

  select count(*) into team_phone_groups from (
    select 1 from public.team_members
    where public.phone_digits(phone) <> ''
    group by public.rider_name_key(full_name), public.phone_digits(phone)
    having count(*) > 1
  ) as duplicate_group;

  if solo_email_groups + solo_phone_groups + team_email_groups + team_phone_groups > 0 then
    raise exception 'Existing registrations already repeat a rider (% solo by name and email, % solo by name and phone, % team by name and email, % team by name and phone). Remove the duplicates, then run this file again.',
      solo_email_groups, solo_phone_groups, team_email_groups, team_phone_groups;
  end if;
end
$collisions$;

-- 3. The same-rider guard, and lookups by email and phone --------------------
-- A rider appears at most once per kind of entry: the same name never twice
-- with the same email, nor twice with the same phone. A blank phone is not a
-- match (every form requires one; this keeps an old blank row from blocking).

create unique index if not exists solo_registrations_same_rider_email_key
  on public.solo_registrations (public.rider_name_key(full_name), lower(btrim(email)));

create unique index if not exists solo_registrations_same_rider_phone_key
  on public.solo_registrations (public.rider_name_key(full_name), public.phone_digits(phone))
  where public.phone_digits(phone) <> '';

create unique index if not exists team_members_same_rider_email_key
  on public.team_members (public.rider_name_key(full_name), lower(btrim(email)));

create unique index if not exists team_members_same_rider_phone_key
  on public.team_members (public.rider_name_key(full_name), public.phone_digits(phone))
  where public.phone_digits(phone) <> '';

-- The trigger, the paper entry and the account sync look riders up by email;
-- the duplicate checks by phone. The unique indexes above lead with the name,
-- so they do not serve these.
create index if not exists solo_registrations_email_lower_idx
  on public.solo_registrations (lower(btrim(email)));

create index if not exists solo_registrations_phone_digits_idx
  on public.solo_registrations (public.phone_digits(phone));

create index if not exists team_members_email_lower_idx
  on public.team_members (lower(btrim(email)));

create index if not exists team_members_phone_digits_idx
  on public.team_members (public.phone_digits(phone));

-- 4. Riders may share an email and a phone -----------------------------------
-- The constraint first; then an index of the same name, in case one was ever
-- made as a bare unique index instead.

alter table public.solo_registrations drop constraint if exists solo_registrations_email_key;
alter table public.solo_registrations drop constraint if exists solo_registrations_phone_key;
alter table public.team_members drop constraint if exists team_members_email_key;
alter table public.team_members drop constraint if exists team_members_phone_key;

drop index if exists public.solo_registrations_email_key;
drop index if exists public.solo_registrations_phone_key;
drop index if exists public.team_members_email_key;
drop index if exists public.team_members_phone_key;

-- 5. One confirmation code per rider -----------------------------------------
-- A code, and the arrival state with it, is reused only for the same rider
-- holding the other kind of entry: email and name both match. Two riders on
-- one email get two codes, so checking one in never checks in the other.
-- Only the other table is searched: a match in the same table is a true
-- duplicate, which the guard above refuses under its own name.
--
-- And only for an insert the database can trust. The function runs as its
-- owner, so it reads the request's token instead of current_user: no token
-- (the SQL editor) or the service role (the server routes, the paper desk),
-- an administrator, or a signed-in account entering a row under its own
-- email address (its own entry; a family's shared address). Any other
-- signed-in account could otherwise insert a row under another rider's name
-- and email, through the team wizard or straight through the API, and be
-- handed that rider's code and arrival state. Such a row gets a code of its
-- own; a teammate entered by someone else's account who also holds a solo
-- entry has two codes and is checked in with each, like a paper rider
-- without email. Tokens exist only for confirmed addresses (the project
-- requires email confirmation to sign in).

create or replace function public.assign_confirmation_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
  existing record;
  found_existing boolean := false;
  claims jsonb := auth.jwt();
  claim_role text;
  may_reuse boolean;
begin
  claim_role := claims ->> 'role';
  may_reuse := claim_role is null
    or claim_role = 'service_role'
    or (
      claim_role = 'authenticated'
      and (
        coalesce(public.is_admin(), false)
        or lower(btrim(coalesce(claims ->> 'email', ''))) = lower(btrim(new.email))
      )
    );

  -- The same rider entered in the other event? Take that code, and that
  -- arrival state with it, so the two entries never disagree about whether
  -- the rider is here.
  if may_reuse and tg_table_name = 'solo_registrations' then
    select member.confirmation_code, member.checked_in_at, member.checked_in_by
    into existing
    from public.team_members as member
    where lower(btrim(member.email)) = lower(btrim(new.email))
      and public.rider_name_key(member.full_name) = public.rider_name_key(new.full_name)
    limit 1;
    found_existing := found;
  elsif may_reuse then
    select solo.confirmation_code, solo.checked_in_at, solo.checked_in_by
    into existing
    from public.solo_registrations as solo
    where lower(btrim(solo.email)) = lower(btrim(new.email))
      and public.rider_name_key(solo.full_name) = public.rider_name_key(new.full_name)
    limit 1;
    found_existing := found;
  end if;

  if found_existing then
    if existing.confirmation_code is not null then
      new.confirmation_code := existing.confirmation_code;
      new.checked_in_at := existing.checked_in_at;
      new.checked_in_by := existing.checked_in_by;
      return new;
    end if;
  end if;

  loop
    attempts := attempts + 1;
    candidate := public.generate_confirmation_code();

    exit when not exists (
      select 1 from public.solo_registrations
      where confirmation_code = candidate
    ) and not exists (
      select 1 from public.team_members
      where confirmation_code = candidate
    );

    if attempts >= 20 then
      raise exception 'Unable to allocate a unique confirmation code.';
    end if;
  end loop;

  new.confirmation_code := candidate;
  new.checked_in_at := null;
  new.checked_in_by := null;

  return new;
end;
$$;

-- Trigger-only function: no client role may call it directly.
revoke execute on function public.assign_confirmation_code() from public;
revoke execute on function public.assign_confirmation_code() from anon, authenticated;

-- 6. The paper entry follows the same rule -----------------------------------

-- Replaces one exact piece of a function's body, once; a second run of this
-- file finds the replacement already there and changes nothing. Session-only.
create or replace function pg_temp.registration_patch_body(
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
    raise exception 'The function to patch is missing — apply 20261025130000_paper_registrations.sql first.';
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

-- Within one team form: the same name twice with the same email or the same
-- phone is one rider entered twice. seen_emails and seen_phones now hold the
-- name key and the contact together, so riders sharing a contact pass.
select pg_temp.registration_patch_body(
  pg_catalog.to_regprocedure('public.admin_create_paper_registration(text, jsonb, uuid, text, text)'),
  $anchor$    if rider_email is not null and rider_email = any (seen_emails) then
      raise exception '%Email % is already used by another rider on this form.', rider_prefix, rider_email
        using errcode = '22023', hint = 'duplicate_registration';
    end if;

    if rider_phone_key = any (seen_phones) then
      raise exception '%Phone number % is already used by another rider on this form.', rider_prefix, rider ->> 'phone'
        using errcode = '22023', hint = 'duplicate_registration';
    end if;

    if rider_email is not null then
      seen_emails := seen_emails || rider_email;
    end if;

    seen_phones := seen_phones || rider_phone_key;$anchor$,
  $replacement$    -- Riders may share an email or a phone (20261108120000); the same
    -- name again with the same email or the same phone is one rider twice.
    if rider_email is not null
      and public.rider_name_key(rider ->> 'full_name') || pg_catalog.chr(31) || rider_email = any (seen_emails) then
      raise exception '%Same name and email (%) as another rider on this form.', rider_prefix, rider_email
        using errcode = '22023', hint = 'duplicate_registration';
    end if;

    if public.rider_name_key(rider ->> 'full_name') || pg_catalog.chr(31) || rider_phone_key = any (seen_phones) then
      raise exception '%Same name and phone number (%) as another rider on this form.', rider_prefix, rider ->> 'phone'
        using errcode = '22023', hint = 'duplicate_registration';
    end if;

    if rider_email is not null then
      seen_emails := seen_emails || (public.rider_name_key(rider ->> 'full_name') || pg_catalog.chr(31) || rider_email);
    end if;

    seen_phones := seen_phones || (public.rider_name_key(rider ->> 'full_name') || pg_catalog.chr(31) || rider_phone_key);$replacement$
);

-- Against existing registrations: only the same kind of entry, and only the
-- same name with the same email or phone. The other kind of entry is always
-- allowed now; the same name and email there is the same rider, and the
-- trigger gives both entries one code. The old refusal of a phone already
-- used under a different email goes.
select pg_temp.registration_patch_body(
  pg_catalog.to_regprocedure('public.admin_create_paper_registration(text, jsonb, uuid, text, text)'),
  $anchor$    for conflict in
      select
        'solo'::text as entry,
        solo.full_name,
        null::text as team_name,
        lower(btrim(solo.email)) as email,
        public.paper_registration_phone_key(solo.phone) as phone_key
      from public.solo_registrations as solo
      where (rider_email is not null and lower(btrim(solo.email)) = rider_email)
        or public.paper_registration_phone_key(solo.phone) = rider_phone_key
      union all
      select
        'team'::text,
        member.full_name,
        team.team_name,
        lower(btrim(member.email)),
        public.paper_registration_phone_key(member.phone)
      from public.team_members as member
      join public.teams as team on team.id = member.team_id
      where (rider_email is not null and lower(btrim(member.email)) = rider_email)
        or public.paper_registration_phone_key(member.phone) = rider_phone_key
    loop
      conflict_entry := case
        when conflict.entry = 'solo' then 'solo entry'
        else format('team %s', conflict.team_name)
      end;

      if conflict.entry = p_type then
        -- Same kind of entry: a rider holds at most one of each.
        if rider_email is not null and conflict.email = rider_email then
          raise exception '%Email % is already registered to % (%).',
            rider_prefix, rider_email, conflict.full_name, conflict_entry
            using errcode = '22023', hint = 'duplicate_registration';
        end if;

        raise exception '%Phone number % is already registered to % (%).',
          rider_prefix, rider ->> 'phone', conflict.full_name, conflict_entry
          using errcode = '22023', hint = 'duplicate_registration';
      end if;

      -- The other kind of entry: allowed only for the same rider by the email
      -- rule, in which case the trigger gives both entries one code.
      if rider_email is null or conflict.email is distinct from rider_email then
        raise exception '%Phone number % is already registered to % (%) under a different email. If this is the same rider, both entries need the same email address so they share one confirmation code; otherwise check the phone number.',
          rider_prefix, rider ->> 'phone', conflict.full_name, conflict_entry
          using errcode = '22023', hint = 'duplicate_registration';
      end if;
    end loop;
  end loop;$anchor$,
  $replacement$    -- The same rider in the same kind of entry (20261108120000): same name,
    -- and the same email or the same phone. Riders sharing a contact pass;
    -- the same name and email in the other kind of entry shares one code.
    for conflict in
      select
        'solo'::text as entry,
        solo.full_name,
        null::text as team_name,
        lower(btrim(solo.email)) as email
      from public.solo_registrations as solo
      where p_type = 'solo'
        and public.rider_name_key(solo.full_name) = public.rider_name_key(rider ->> 'full_name')
        and (
          (rider_email is not null and lower(btrim(solo.email)) = rider_email)
          or public.phone_digits(solo.phone) = rider_phone_key
        )
      union all
      select
        'team'::text,
        member.full_name,
        team.team_name,
        lower(btrim(member.email))
      from public.team_members as member
      join public.teams as team on team.id = member.team_id
      where p_type = 'team'
        and public.rider_name_key(member.full_name) = public.rider_name_key(rider ->> 'full_name')
        and (
          (rider_email is not null and lower(btrim(member.email)) = rider_email)
          or public.phone_digits(member.phone) = rider_phone_key
        )
    loop
      conflict_entry := case
        when conflict.entry = 'solo' then 'solo entry'
        else format('team %s', conflict.team_name)
      end;

      if rider_email is not null and conflict.email = rider_email then
        raise exception '%', rider_prefix || format(
          '%s is already registered with email %s (%s).',
          conflict.full_name, rider_email, conflict_entry
        )
          using errcode = '22023', hint = 'duplicate_registration';
      end if;

      raise exception '%', rider_prefix || format(
        '%s is already registered with phone number %s (%s).',
        conflict.full_name, rider ->> 'phone', conflict_entry
      )
        using errcode = '22023', hint = 'duplicate_registration';
    end loop;
  end loop;$replacement$
);

revoke execute on function public.admin_create_paper_registration(text, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_paper_registration(text, jsonb, uuid, text, text)
  to service_role;

-- 7. Photos for team riders --------------------------------------------------
-- As 20261108100000 did for solo: a team rider's own photo, at
-- `paper/<team_member_id>/<file>.jpg`, set only by the service role through
-- /api/admin/headshots. The path can only point into the row's own folder.

alter table public.team_members
  add column if not exists headshot_path text;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.team_members'::pg_catalog.regclass
      and conname = 'team_members_headshot_path_own_folder'
  ) then
    alter table public.team_members
      add constraint team_members_headshot_path_own_folder
      check (
        headshot_path is null
        or headshot_path ~ ('^paper/' || id::text || '/[A-Za-z0-9._-]{1,200}$')
      );
  end if;
end
$constraint$;

-- Readable like the rest of the row, so `select *` keeps working for signed-in
-- users. No INSERT or UPDATE grant: only the service role sets it.
grant select (headshot_path) on public.team_members to authenticated;

-- 8. Check the result --------------------------------------------------------

do $verify$
declare
  paper_body text := replace(
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.admin_create_paper_registration(text, jsonb, uuid, text, text)')
    ),
    E'\r\n',
    E'\n'
  );
  trigger_body text := pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.assign_confirmation_code()')
  );
  shared_code_pairs integer;
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conname in (
      'solo_registrations_email_key',
      'solo_registrations_phone_key',
      'team_members_email_key',
      'team_members_phone_key'
    )
  ) or exists (
    select 1
    from pg_catalog.pg_class
    where relkind = 'i'
      and relnamespace = 'public'::pg_catalog.regnamespace
      and relname in (
        'solo_registrations_email_key',
        'solo_registrations_phone_key',
        'team_members_email_key',
        'team_members_phone_key'
      )
  ) then
    raise exception 'A UNIQUE constraint on email or phone is still in place.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_index as index_row
    join pg_catalog.pg_class as index_class on index_class.oid = index_row.indexrelid
    where index_row.indisunique
      and index_class.relname in (
        'solo_registrations_same_rider_email_key',
        'solo_registrations_same_rider_phone_key',
        'team_members_same_rider_email_key',
        'team_members_same_rider_phone_key'
      )
  ) <> 4 then
    raise exception 'The same-rider guard indexes are missing.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_class
    where relkind = 'i'
      and relnamespace = 'public'::pg_catalog.regnamespace
      and relname in (
        'solo_registrations_email_lower_idx',
        'solo_registrations_phone_digits_idx',
        'team_members_email_lower_idx',
        'team_members_phone_digits_idx'
      )
  ) <> 4 then
    raise exception 'The email and phone lookup indexes are missing.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc
    where oid in (
      pg_catalog.to_regprocedure('public.rider_name_key(text)'),
      pg_catalog.to_regprocedure('public.phone_digits(text)')
    )
      and provolatile = 'i'
  ) <> 2 then
    raise exception 'rider_name_key and phone_digits must both exist and be IMMUTABLE.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.phone_digits(text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.rider_name_key(text)', 'execute') then
    raise exception 'authenticated cannot execute the index functions, so online registrations would fail.';
  end if;

  if position('rider_name_key' in trigger_body) = 0 then
    raise exception 'assign_confirmation_code does not match on the rider''s name.';
  end if;

  if position('auth.jwt()' in trigger_body) = 0
    or position('public.is_admin()' in trigger_body) = 0 then
    raise exception 'assign_confirmation_code does not check who is inserting.';
  end if;

  if pg_catalog.has_function_privilege('authenticated', 'public.assign_confirmation_code()', 'execute') then
    raise exception 'assign_confirmation_code is executable by a browser role.';
  end if;

  if position('under a different email' in paper_body) > 0 then
    raise exception 'admin_create_paper_registration still refuses a phone used under a different email.';
  end if;

  if position('rider_name_key' in paper_body) = 0 then
    raise exception 'admin_create_paper_registration does not compare names.';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_create_paper_registration(text, jsonb, uuid, text, text)',
    'execute'
  ) then
    raise exception 'admin_create_paper_registration is executable by a browser role.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.team_members'::pg_catalog.regclass
      and attname = 'headshot_path'
      and not attisdropped
  ) then
    raise exception 'team_members.headshot_path is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.team_members'::pg_catalog.regclass
      and conname = 'team_members_headshot_path_own_folder'
  ) then
    raise exception 'The team_members headshot_path own-folder check is missing.';
  end if;

  if not pg_catalog.has_column_privilege(
    'authenticated', 'public.team_members', 'headshot_path', 'select'
  ) then
    raise exception 'authenticated cannot read team_members.headshot_path, so `select *` would fail.';
  end if;

  -- Entries that share a code under the old email-only rule but are not the
  -- same rider by name. None on 7 Nov (no teams yet); a count, never names.
  select count(*) into shared_code_pairs
  from public.solo_registrations as solo
  join public.team_members as member
    on member.confirmation_code = solo.confirmation_code
  where public.rider_name_key(member.full_name) <> public.rider_name_key(solo.full_name);

  if shared_code_pairs > 0 then
    raise notice '% solo/team pair(s) share a code but differ by name. Check them at the desk before check-in.', shared_code_pairs;
  end if;

  raise notice 'Riders may now share an email and a phone; the same name is refused per kind of entry.';
end
$verify$;

-- Tell PostgREST about the changed functions and the new column straight away.
notify pgrst, 'reload schema';
