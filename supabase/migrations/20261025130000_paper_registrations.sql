-- Paper registration: riders who fill in the printed form, keyed in by an
-- administrator.
--
-- Many riders will never register online. Organisers collect the paper form
-- (public/documents/registration-form-solo.pdf or -team.pdf) and an
-- administrator enters it at /admin/paper, which calls
-- admin_create_paper_registration through the service role. The function
-- validates the form with the same bounds as the online paths, refuses a rider
-- who is already registered, inserts the entry, lets the existing trigger
-- assign the confirmation code(s), and writes the audit record — all in one
-- transaction.
--
-- Three things a paper rider lacks, and how each is handled:
--
-- * An account. solo_registrations.profile_id and teams.leader_profile_id
--   become nullable (only if they are not already). Owner-scoped RLS compares
--   those columns with auth.uid(), which never equals null, so a paper row is
--   visible to administrators only — exactly as intended.
-- * An email address, sometimes. The email columns stay NOT NULL, UNIQUE and
--   format-checked, and the one-code-per-rider trigger still matches riders on
--   email, so a rider with no address is stored under a generated placeholder
--   `no-email-<12 random characters>@paper.nezabazipunjab.com`. That domain
--   receives no mail and must never be given MX records: an address nobody can
--   confirm can never be claimed by an account. src/lib/email/resend.ts refuses
--   to send to it, and the app shows it as "No email (paper entry)".
-- * A way to say where the row came from. New columns registration_source
--   ('online' | 'paper', default 'online') and entered_by (the administrator)
--   on solo_registrations and teams. Readable by signed-in users like the rest
--   of the row; never writable from a browser.
--
-- Duplicates. A rider may hold one solo entry and one place on a team — the
-- confirmation-code trigger gives both entries the same code when the email
-- matches (20260728163000_one_confirmation_code_per_rider). So:
--   - within the same kind of entry, a matching email or phone is refused;
--   - across kinds, a matching email is the same rider entering both events
--     and is allowed (they keep one code), but a matching phone under a
--     different or missing email is refused: it is either the same rider, who
--     would otherwise end up with two codes, or a typing mistake.
-- Phones are compared by their digits, so "98765 43210" and "98765-43210"
-- match.
--
-- The live project is migrated by hand in the SQL editor, so every statement
-- is idempotent and checks its own result: a second run changes nothing, and a
-- database that is not the shape this file expects fails loudly instead of
-- being half-patched.

-- 0. Preconditions ------------------------------------------------------------
-- The function below writes the parents' names, which
-- 20261025100000_rider_parent_names.sql adds, and relies on the confirmation
-- code trigger and the audit log. PL/pgSQL does not check column names until a
-- function runs, so check them here instead of at the first paper entry.

do $preconditions$
declare
  missing text;
begin
  select string_agg(format('%s.%s', expected.table_name, expected.column_name), ', ')
  into missing
  from (
    values
      ('solo_registrations', 'profile_id'),
      ('solo_registrations', 'full_name'),
      ('solo_registrations', 'father_name'),
      ('solo_registrations', 'mother_name'),
      ('solo_registrations', 'age'),
      ('solo_registrations', 'location'),
      ('solo_registrations', 'phone'),
      ('solo_registrations', 'email'),
      ('solo_registrations', 'years_experience'),
      ('solo_registrations', 'horse_name'),
      ('solo_registrations', 'horse_age'),
      ('solo_registrations', 'horse_breed'),
      ('solo_registrations', 'emergency_contact_name'),
      ('solo_registrations', 'emergency_contact_phone'),
      ('solo_registrations', 'confirmation_code'),
      ('teams', 'team_name'),
      ('teams', 'leader_profile_id'),
      ('teams', 'emergency_contact_name'),
      ('teams', 'emergency_contact_phone'),
      ('team_members', 'team_id'),
      ('team_members', 'full_name'),
      ('team_members', 'father_name'),
      ('team_members', 'mother_name'),
      ('team_members', 'age'),
      ('team_members', 'location'),
      ('team_members', 'phone'),
      ('team_members', 'email'),
      ('team_members', 'years_experience'),
      ('team_members', 'horse_name'),
      ('team_members', 'horse_age'),
      ('team_members', 'horse_breed'),
      ('team_members', 'is_leader'),
      ('team_members', 'confirmation_code'),
      ('admin_audit_log', 'actor_id'),
      ('admin_audit_log', 'actor_name'),
      ('admin_audit_log', 'actor_email'),
      ('admin_audit_log', 'action'),
      ('admin_audit_log', 'target_table'),
      ('admin_audit_log', 'target_id'),
      ('admin_audit_log', 'details'),
      ('profiles', 'role')
  ) as expected(table_name, column_name)
  where not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = pg_catalog.to_regclass('public.' || expected.table_name)
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  if missing is not null then
    raise exception
      'Paper registration needs columns that do not exist yet: %. Apply the earlier migrations first, in filename order (20261025100000_rider_parent_names.sql adds the parents'' names).',
      missing;
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgname = 'assign_confirmation_code'
      and not trigger_row.tgisinternal
      and trigger_row.tgrelid in (
        'public.solo_registrations'::pg_catalog.regclass,
        'public.team_members'::pg_catalog.regclass
      )
  ) <> 2 then
    raise exception
      'The assign_confirmation_code trigger is missing from solo_registrations or team_members. Apply 20260728143000_registration_confirmation_codes.sql and 20260728163000_one_confirmation_code_per_rider.sql first.';
  end if;
end
$preconditions$;

-- 1. Where a registration came from -------------------------------------------

alter table public.solo_registrations
  add column if not exists registration_source text not null default 'online',
  add column if not exists entered_by uuid
    references public.profiles(id) on delete set null;

alter table public.teams
  add column if not exists registration_source text not null default 'online',
  add column if not exists entered_by uuid
    references public.profiles(id) on delete set null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_registration_source_valid'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_registration_source_valid
      check (registration_source in ('online', 'paper'));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.teams'::pg_catalog.regclass
      and conname = 'teams_registration_source_valid'
  ) then
    alter table public.teams
      add constraint teams_registration_source_valid
      check (registration_source in ('online', 'paper'));
  end if;

  -- Only a paper row records who keyed it in. It may still be null on a paper
  -- row: the administrator's profile can be deleted, and the foreign key then
  -- sets it to null rather than losing the registration.
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_entered_by_paper_only'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_entered_by_paper_only
      check (entered_by is null or registration_source = 'paper');
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.teams'::pg_catalog.regclass
      and conname = 'teams_entered_by_paper_only'
  ) then
    alter table public.teams
      add constraint teams_entered_by_paper_only
      check (entered_by is null or registration_source = 'paper');
  end if;
end
$constraint$;

-- Signed-in users read their own rows (and administrators read every row) with
-- `select *`. `teams` carries column-level SELECT grants, so a new column that
-- is not granted would make every such read fail with "permission denied".
-- Granted on solo_registrations too, where a table-wide grant makes it
-- harmless. No INSERT or UPDATE grant: online rows take the default.
grant select (registration_source, entered_by) on public.solo_registrations to authenticated;
grant select (registration_source, entered_by) on public.teams to authenticated;

-- A table-wide INSERT grant, if solo_registrations still has one, covers new
-- columns automatically and cannot have a single column revoked from it. So
-- the browser roles are pinned by a trigger instead: whatever they send, a row
-- they insert is an online row with no entered_by, and an update they make
-- cannot change either column. The service role — admin_create_paper_registration
-- via the audited admin route — is the only caller that sets them.

create or replace function public.lock_registration_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.registration_source := 'online';
      new.entered_by := null;
    else
      new.registration_source := old.registration_source;
      new.entered_by := old.entered_by;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lock_registration_source on public.solo_registrations;
create trigger lock_registration_source
  before insert or update on public.solo_registrations
  for each row execute function public.lock_registration_source();

drop trigger if exists lock_registration_source on public.teams;
create trigger lock_registration_source
  before insert or update on public.teams
  for each row execute function public.lock_registration_source();

-- Trigger-only function: no client role may call it directly.
revoke execute on function public.lock_registration_source()
  from public, anon, authenticated;

-- 2. A paper rider has no account ---------------------------------------------
-- Dropped only when pg_attribute says the column is still NOT NULL, so a rerun
-- (or a project where it was never NOT NULL) changes nothing and says so.

do $nullable$
declare
  blocking text;
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.solo_registrations'::pg_catalog.regclass
      and attname = 'profile_id'
      and attnotnull
  ) then
    alter table public.solo_registrations alter column profile_id drop not null;
    raise notice 'solo_registrations.profile_id is now nullable: a paper rider has no account.';
  else
    raise notice 'solo_registrations.profile_id is already nullable; left unchanged.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.teams'::pg_catalog.regclass
      and attname = 'leader_profile_id'
      and attnotnull
  ) then
    alter table public.teams alter column leader_profile_id drop not null;
    raise notice 'teams.leader_profile_id is now nullable: a paper team leader has no account.';
  else
    raise notice 'teams.leader_profile_id is already nullable; left unchanged.';
  end if;

  -- A CHECK constraint can require the column just as NOT NULL does, and the
  -- live schema predates this repository. Refuse to continue rather than leave
  -- paper entry failing at its first insert.
  select string_agg(conname, ', ')
  into blocking
  from pg_catalog.pg_constraint
  where contype = 'c'
    and (
      (
        conrelid = 'public.solo_registrations'::pg_catalog.regclass
        and pg_catalog.pg_get_constraintdef(oid) ~* 'profile_id\s+is\s+not\s+null'
      )
      or (
        conrelid = 'public.teams'::pg_catalog.regclass
        and pg_catalog.pg_get_constraintdef(oid) ~* 'leader_profile_id\s+is\s+not\s+null'
      )
    );

  if blocking is not null then
    raise exception
      'CHECK constraint(s) % still require an account on every registration. Review and drop them before applying this migration: paper riders have none.',
      blocking;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where (
        (attrelid = 'public.solo_registrations'::pg_catalog.regclass and attname = 'profile_id')
        or (attrelid = 'public.teams'::pg_catalog.regclass and attname = 'leader_profile_id')
      )
      and attnotnull
  ) then
    raise exception 'profile_id / leader_profile_id are still NOT NULL after the change.';
  end if;
end
$nullable$;

-- 3. Field helpers ------------------------------------------------------------
-- Each raises 22023 with a sentence the administrator can act on; the route
-- passes it through. p_label already carries the rider prefix ("Rider 2: …").

create or replace function public.paper_registration_text(
  p_source jsonb,
  p_key text,
  p_label text,
  p_max_length integer,
  p_required boolean
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  raw_value jsonb := p_source -> p_key;
  trimmed text;
begin
  if raw_value is null or jsonb_typeof(raw_value) = 'null' then
    trimmed := null;
  elsif jsonb_typeof(raw_value) <> 'string' then
    raise exception '% must be text.', p_label using errcode = '22023';
  else
    trimmed := nullif(
      regexp_replace(raw_value #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g'),
      ''
    );
  end if;

  if trimmed is null then
    if p_required then
      raise exception '% is required.', p_label using errcode = '22023';
    end if;

    return null;
  end if;

  if char_length(trimmed) > p_max_length then
    raise exception '% must be % characters or fewer.', p_label, p_max_length
      using errcode = '22023';
  end if;

  return trimmed;
end;
$$;

create or replace function public.paper_registration_integer(
  p_source jsonb,
  p_key text,
  p_label text,
  p_min integer,
  p_max integer
)
returns integer
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  raw_value jsonb := p_source -> p_key;
  text_value text;
  number_value integer;
begin
  if raw_value is null or jsonb_typeof(raw_value) = 'null' then
    raise exception '% is required.', p_label using errcode = '22023';
  end if;

  if jsonb_typeof(raw_value) not in ('number', 'string') then
    raise exception '% must be a whole number.', p_label using errcode = '22023';
  end if;

  text_value := btrim(raw_value #>> '{}');

  if text_value = '' then
    raise exception '% is required.', p_label using errcode = '22023';
  end if;

  -- Same shape the online forms accept: digits only, optional minus. Nine
  -- digits at most so the cast below cannot overflow.
  if text_value !~ '^-?[0-9]{1,9}$' then
    raise exception '% must be a whole number from % to %.', p_label, p_min, p_max
      using errcode = '22023';
  end if;

  number_value := text_value::integer;

  if number_value < p_min or number_value > p_max then
    raise exception '% must be a whole number from % to %.', p_label, p_min, p_max
      using errcode = '22023';
  end if;

  return number_value;
end;
$$;

-- Duplicate phones are compared by digits once there are enough of them to be
-- a number; anything shorter is compared as typed.
create or replace function public.paper_registration_phone_key(p_phone text)
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

-- One rider's fields, validated in the order the paper sheet prints them so
-- the first error is the first one the administrator reaches on the page.
create or replace function public.paper_registration_rider(
  p_rider jsonb,
  p_prefix text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  full_name_value text;
  father_name_value text;
  mother_name_value text;
  age_value integer;
  phone_value text;
  email_value text;
  location_value text;
  years_value integer;
  horse_name_value text;
  horse_age_value integer;
  horse_breed_value text;
begin
  if p_rider is null or jsonb_typeof(p_rider) <> 'object' then
    raise exception '%Rider details are missing.', p_prefix using errcode = '22023';
  end if;

  full_name_value := public.paper_registration_text(p_rider, 'full_name', p_prefix || 'Full name', 200, true);
  father_name_value := public.paper_registration_text(p_rider, 'father_name', p_prefix || 'Father''s name', 200, false);
  mother_name_value := public.paper_registration_text(p_rider, 'mother_name', p_prefix || 'Mother''s name', 200, false);
  age_value := public.paper_registration_integer(p_rider, 'age', p_prefix || 'Age', 1, 120);
  phone_value := public.paper_registration_text(p_rider, 'phone', p_prefix || 'Phone number', 30, true);

  email_value := lower(public.paper_registration_text(p_rider, 'email', p_prefix || 'Email', 254, false));

  if email_value is not null then
    -- The same pattern as src/lib/email-address.ts.
    if email_value !~ '^[^[:space:]@]{1,64}@[^[:space:]@.]{1,63}(\.[^[:space:]@.]{1,63})+$' then
      raise exception '%Enter a valid email address, or leave it blank if the rider has none.', p_prefix
        using errcode = '22023';
    end if;

    if split_part(email_value, '@', 2) = 'paper.nezabazipunjab.com'
      or split_part(email_value, '@', 2) like '%.paper.nezabazipunjab.com' then
      raise exception '%Addresses on paper.nezabazipunjab.com are reserved. Leave the email blank if the rider has none.', p_prefix
        using errcode = '22023';
    end if;
  end if;

  -- The four boxes on the sheet fill the single location column, joined the
  -- way the online location picker joins them.
  location_value := concat_ws(
    ', ',
    public.paper_registration_text(p_rider, 'village_city', p_prefix || 'Village / city', 200, false),
    public.paper_registration_text(p_rider, 'district', p_prefix || 'District', 200, false),
    public.paper_registration_text(p_rider, 'state', p_prefix || 'State', 200, false),
    public.paper_registration_text(p_rider, 'country', p_prefix || 'Country', 200, false)
  );

  if location_value = '' then
    raise exception '%Enter the village or city, district, state or country.', p_prefix
      using errcode = '22023';
  end if;

  if char_length(location_value) > 200 then
    raise exception '%The village, district, state and country together must be 200 characters or fewer.', p_prefix
      using errcode = '22023';
  end if;

  years_value := public.paper_registration_integer(p_rider, 'years_experience', p_prefix || 'Years of tent-pegging experience', 0, 100);
  horse_name_value := public.paper_registration_text(p_rider, 'horse_name', p_prefix || 'Horse name', 200, true);
  horse_age_value := public.paper_registration_integer(p_rider, 'horse_age', p_prefix || 'Horse age', 0, 60);
  horse_breed_value := public.paper_registration_text(p_rider, 'horse_breed', p_prefix || 'Horse breed', 200, true);

  return jsonb_build_object(
    'full_name', full_name_value,
    'father_name', father_name_value,
    'mother_name', mother_name_value,
    'age', age_value,
    'phone', phone_value,
    'email', email_value,
    'location', location_value,
    'years_experience', years_value,
    'horse_name', horse_name_value,
    'horse_age', horse_age_value,
    'horse_breed', horse_breed_value
  );
end;
$$;

-- no-email-<12 random lowercase letters and digits>@paper.nezabazipunjab.com,
-- unique across both registration tables. Not a secret — it only has to be
-- unique — so random() is enough, as for the confirmation codes.
create or replace function public.paper_registration_placeholder_email()
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  candidate text;
  attempts integer := 0;
  character_index integer;
begin
  loop
    attempts := attempts + 1;
    candidate := 'no-email-';

    for character_index in 1..12 loop
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::integer,
        1
      );
    end loop;

    candidate := candidate || '@paper.nezabazipunjab.com';

    exit when not exists (
      select 1 from public.solo_registrations
      where lower(btrim(email)) = candidate
    ) and not exists (
      select 1 from public.team_members
      where lower(btrim(email)) = candidate
    );

    if attempts >= 20 then
      raise exception 'Unable to allocate a unique placeholder email.';
    end if;
  end loop;

  return candidate;
end;
$$;

-- 4. The entry point ----------------------------------------------------------
-- p_payload, solo: the rider fields (full_name, father_name, mother_name, age,
--   phone, email, village_city, district, state, country, years_experience,
--   horse_name, horse_age, horse_breed) plus emergency_contact_name and
--   emergency_contact_phone.
-- p_payload, team: team_name, emergency_contact_name, emergency_contact_phone
--   and riders, an array of exactly four rider objects, team leader first.
-- Returns {type, registration_id, team_name, riders: [{id, full_name, email,
--   confirmation_code, is_leader}]}.

create or replace function public.admin_create_paper_registration(
  p_type text,
  p_payload jsonb,
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
  riders jsonb := '[]'::jsonb;
  rider jsonb;
  rider_index integer;
  rider_prefix text;
  rider_email text;
  rider_phone_key text;
  seen_emails text[] := array[]::text[];
  seen_phones text[] := array[]::text[];
  conflict record;
  conflict_entry text;
  entry_team_name text;
  contact_name text;
  contact_phone text;
  created_id uuid;
  created_member_id uuid;
  created_name text;
  created_email text;
  created_code text;
  created_riders jsonb := '[]'::jsonb;
  created_codes jsonb := '[]'::jsonb;
  constraint_name_value text;
begin
  if p_type is null or p_type not in ('solo', 'team') then
    raise exception 'Choose a solo or a team registration.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'The form data is missing.' using errcode = '22023';
  end if;

  -- The route has already verified the session; this keeps the audit actor
  -- honest even if the function is ever called some other way.
  if p_actor_id is null or not exists (
    select 1 from public.profiles as profile where profile.id = p_actor_id
  ) then
    raise exception 'Administrator profile not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.profiles as profile
    where profile.id = p_actor_id and profile.role = 'admin'
  ) then
    raise exception 'Only an administrator can enter a paper registration.'
      using errcode = '42501';
  end if;

  -- Two administrators keying in the same stack of forms must not both pass
  -- the duplicate checks below for the same rider. Serialise paper entry; it
  -- is a handful of inserts and a desk-speed operation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.admin_create_paper_registration')
  );

  -- Validate everything before writing anything.
  if p_type = 'solo' then
    riders := jsonb_build_array(public.paper_registration_rider(p_payload, ''));
    contact_name := public.paper_registration_text(p_payload, 'emergency_contact_name', 'Emergency contact name', 200, true);
    contact_phone := public.paper_registration_text(p_payload, 'emergency_contact_phone', 'Emergency contact phone', 30, true);
  else
    entry_team_name := public.paper_registration_text(p_payload, 'team_name', 'Team name', 200, true);
    contact_name := public.paper_registration_text(p_payload, 'emergency_contact_name', 'Team emergency contact name', 200, true);
    contact_phone := public.paper_registration_text(p_payload, 'emergency_contact_phone', 'Team emergency contact phone', 30, true);

    -- Two checks, not one OR: SQL does not promise to evaluate the type test
    -- first, and jsonb_array_length fails on anything but an array.
    if jsonb_typeof(p_payload -> 'riders') is distinct from 'array' then
      raise exception 'A team needs exactly four riders, team leader first.'
        using errcode = '22023';
    end if;

    if jsonb_array_length(p_payload -> 'riders') <> 4 then
      raise exception 'A team needs exactly four riders, team leader first.'
        using errcode = '22023';
    end if;

    for rider_index in 0..3 loop
      rider_prefix := case
        when rider_index = 0 then 'Rider 1 (team leader): '
        else format('Rider %s: ', rider_index + 1)
      end;

      riders := riders || jsonb_build_array(
        public.paper_registration_rider(p_payload -> 'riders' -> rider_index, rider_prefix)
      );
    end loop;
  end if;

  -- Duplicates: within this form, then against every existing registration.
  for rider_index in 0..jsonb_array_length(riders) - 1 loop
    rider := riders -> rider_index;
    rider_prefix := case
      when p_type = 'solo' then ''
      when rider_index = 0 then 'Rider 1 (team leader): '
      else format('Rider %s: ', rider_index + 1)
    end;
    rider_email := rider ->> 'email';
    rider_phone_key := public.paper_registration_phone_key(rider ->> 'phone');

    if rider_email is not null and rider_email = any (seen_emails) then
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

    seen_phones := seen_phones || rider_phone_key;

    for conflict in
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
  end loop;

  -- Write. The confirmation-code trigger fills confirmation_code on each
  -- insert; a placeholder email never matches an existing rider, so a rider
  -- without email always gets a fresh code.
  begin
    if p_type = 'solo' then
      rider := riders -> 0;
      rider_email := coalesce(rider ->> 'email', public.paper_registration_placeholder_email());

      insert into public.solo_registrations as registration (
        profile_id,
        full_name,
        father_name,
        mother_name,
        age,
        location,
        phone,
        email,
        years_experience,
        horse_name,
        horse_age,
        horse_breed,
        emergency_contact_name,
        emergency_contact_phone,
        registration_source,
        entered_by
      ) values (
        null,
        rider ->> 'full_name',
        rider ->> 'father_name',
        rider ->> 'mother_name',
        (rider ->> 'age')::integer,
        rider ->> 'location',
        rider ->> 'phone',
        rider_email,
        (rider ->> 'years_experience')::integer,
        rider ->> 'horse_name',
        (rider ->> 'horse_age')::integer,
        rider ->> 'horse_breed',
        contact_name,
        contact_phone,
        'paper',
        p_actor_id
      )
      returning
        registration.id,
        registration.full_name,
        registration.email,
        registration.confirmation_code
      into created_id, created_name, created_email, created_code;

      created_riders := jsonb_build_array(jsonb_build_object(
        'id', created_id,
        'full_name', created_name,
        'email', created_email,
        'confirmation_code', created_code,
        'is_leader', false
      ));
      created_codes := jsonb_build_array(jsonb_build_object(
        'full_name', created_name,
        'confirmation_code', created_code
      ));

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
        'paper_registration',
        'solo_registrations',
        created_id::text,
        p_payload || jsonb_build_object(
          'subject_name', created_name,
          'registration_source', 'paper',
          'confirmation_codes', created_codes
        )
      );

      return jsonb_build_object(
        'type', 'solo',
        'registration_id', created_id,
        'team_name', null,
        'riders', created_riders
      );
    end if;

    insert into public.teams as team (
      team_name,
      leader_profile_id,
      emergency_contact_name,
      emergency_contact_phone,
      registration_source,
      entered_by
    ) values (
      entry_team_name,
      null,
      contact_name,
      contact_phone,
      'paper',
      p_actor_id
    )
    returning team.id into created_id;

    -- Leader first, then the roster in the order it was written on the form.
    for rider_index in 0..3 loop
      rider := riders -> rider_index;
      rider_email := coalesce(rider ->> 'email', public.paper_registration_placeholder_email());

      insert into public.team_members as member (
        team_id,
        full_name,
        father_name,
        mother_name,
        age,
        location,
        phone,
        email,
        years_experience,
        horse_name,
        horse_age,
        horse_breed,
        is_leader
      ) values (
        created_id,
        rider ->> 'full_name',
        rider ->> 'father_name',
        rider ->> 'mother_name',
        (rider ->> 'age')::integer,
        rider ->> 'location',
        rider ->> 'phone',
        rider_email,
        (rider ->> 'years_experience')::integer,
        rider ->> 'horse_name',
        (rider ->> 'horse_age')::integer,
        rider ->> 'horse_breed',
        rider_index = 0
      )
      returning
        member.id,
        member.full_name,
        member.email,
        member.confirmation_code
      into created_member_id, created_name, created_email, created_code;

      created_riders := created_riders || jsonb_build_array(jsonb_build_object(
        'id', created_member_id,
        'full_name', created_name,
        'email', created_email,
        'confirmation_code', created_code,
        'is_leader', rider_index = 0
      ));
      created_codes := created_codes || jsonb_build_array(jsonb_build_object(
        'full_name', created_name,
        'confirmation_code', created_code
      ));
    end loop;

    if (
      select count(*) from public.team_members as member
      where member.team_id = created_id
    ) <> 4 then
      raise exception 'The team was not saved with exactly four riders.';
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
      'paper_registration',
      'teams',
      created_id::text,
      p_payload || jsonb_build_object(
        'subject_name', entry_team_name,
        'registration_source', 'paper',
        'confirmation_codes', created_codes
      )
    );

    return jsonb_build_object(
      'type', 'team',
      'registration_id', created_id,
      'team_name', entry_team_name,
      'riders', created_riders
    );
  exception
    -- An online registration can land between the checks above and these
    -- inserts. The unique indexes catch it; say so in words.
    when unique_violation then
      get stacked diagnostics constraint_name_value = constraint_name;
      raise exception 'This rider was registered by someone else a moment ago (%). Search for them before entering the form again.',
        coalesce(constraint_name_value, 'duplicate email or phone')
        using errcode = '22023', hint = 'duplicate_registration';
  end;
end;
$$;

comment on function public.admin_create_paper_registration(text, jsonb, uuid, text, text) is
  'Creates a solo or team registration from a paper form on the rider''s behalf, '
  'with its audit record, in one transaction. Service role only.';

-- 5. Grants -------------------------------------------------------------------
-- Service role only, like every other admin function: the route verifies the
-- administrator and passes the actor from the session.

revoke execute on function public.paper_registration_text(jsonb, text, text, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.paper_registration_integer(jsonb, text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.paper_registration_phone_key(text)
  from public, anon, authenticated;
revoke execute on function public.paper_registration_rider(jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.paper_registration_placeholder_email()
  from public, anon, authenticated;
revoke execute on function public.admin_create_paper_registration(text, jsonb, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.paper_registration_text(jsonb, text, text, integer, boolean)
  to service_role;
grant execute on function public.paper_registration_integer(jsonb, text, text, integer, integer)
  to service_role;
grant execute on function public.paper_registration_phone_key(text)
  to service_role;
grant execute on function public.paper_registration_rider(jsonb, text)
  to service_role;
grant execute on function public.paper_registration_placeholder_email()
  to service_role;
grant execute on function public.admin_create_paper_registration(text, jsonb, uuid, text, text)
  to service_role;

-- 6. Check the result ---------------------------------------------------------

do $verify$
begin
  if exists (
    select 1
    from (values ('public.solo_registrations'), ('public.teams')) as target(table_name)
    where not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = pg_catalog.to_regclass(target.table_name)
        and attribute.attname = 'registration_source'
        and attribute.attnotnull
        and not attribute.attisdropped
    ) or not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = pg_catalog.to_regclass(target.table_name)
        and attribute.attname = 'entered_by'
        and not attribute.attisdropped
    )
  ) then
    raise exception 'registration_source / entered_by are missing or registration_source is nullable.';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_create_paper_registration(text, jsonb, uuid, text, text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.admin_create_paper_registration(text, jsonb, uuid, text, text)',
    'execute'
  ) then
    raise exception 'admin_create_paper_registration is still executable by a browser role.';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_create_paper_registration(text, jsonb, uuid, text, text)',
    'execute'
  ) then
    raise exception 'service_role cannot execute admin_create_paper_registration.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgname = 'lock_registration_source'
      and not trigger_row.tgisinternal
      and trigger_row.tgrelid in (
        'public.solo_registrations'::pg_catalog.regclass,
        'public.teams'::pg_catalog.regclass
      )
  ) <> 2 then
    raise exception 'The lock_registration_source trigger is missing from solo_registrations or teams.';
  end if;

  -- Both tables replaced their table-wide UPDATE grant with a column list
  -- earlier, so this should never fire; if it does, the trigger above still
  -- keeps the two columns unchanged, so it is a notice rather than a failure.
  if pg_catalog.has_column_privilege('authenticated', 'public.teams', 'registration_source', 'update')
    or pg_catalog.has_column_privilege('authenticated', 'public.teams', 'entered_by', 'update')
    or pg_catalog.has_column_privilege('authenticated', 'public.solo_registrations', 'registration_source', 'update')
    or pg_catalog.has_column_privilege('authenticated', 'public.solo_registrations', 'entered_by', 'update') then
    raise notice 'authenticated holds a table-wide UPDATE grant on solo_registrations or teams; lock_registration_source keeps registration_source and entered_by unchanged regardless.';
  end if;

  if not pg_catalog.has_column_privilege('authenticated', 'public.teams', 'registration_source', 'select')
    or not pg_catalog.has_column_privilege('authenticated', 'public.solo_registrations', 'registration_source', 'select') then
    raise exception 'authenticated cannot read registration_source, so `select *` on the registration tables would fail.';
  end if;
end
$verify$;

-- Tell PostgREST about the new and changed functions straight away.
notify pgrst, 'reload schema';
