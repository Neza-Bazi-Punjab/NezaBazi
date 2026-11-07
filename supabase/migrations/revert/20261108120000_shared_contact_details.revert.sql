-- Undo for 20261108120000_shared_contact_details.sql: one email and one phone
-- per rider again, the email-only confirmation-code trigger, the paper entry's
-- old duplicate checks, and no team_members.headshot_path.
--
-- Use only if the organisers decide riders must not share contact details
-- after all. It refuses to run while any rows share an email or a phone, or
-- while a team rider has a photo on their row: those must be dealt with first
-- (it prints counts, never rider details). Idempotent.

-- 0. Nothing would break -----------------------------------------------------

do $preconditions$
declare
  shared_solo_emails integer;
  shared_solo_phones integer;
  shared_team_emails integer;
  shared_team_phones integer;
  team_photos integer := 0;
begin
  select count(*) into shared_solo_emails from (
    select 1 from public.solo_registrations group by email having count(*) > 1
  ) as shared;
  select count(*) into shared_solo_phones from (
    select 1 from public.solo_registrations group by phone having count(*) > 1
  ) as shared;
  select count(*) into shared_team_emails from (
    select 1 from public.team_members group by email having count(*) > 1
  ) as shared;
  select count(*) into shared_team_phones from (
    select 1 from public.team_members group by phone having count(*) > 1
  ) as shared;

  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.team_members'::pg_catalog.regclass
      and attname = 'headshot_path'
      and not attisdropped
  ) then
    execute 'select count(*) from public.team_members where headshot_path is not null'
      into team_photos;
  end if;

  if shared_solo_emails + shared_solo_phones + shared_team_emails + shared_team_phones > 0 then
    raise exception 'Riders share contact details (% solo emails, % solo phones, % team emails, % team phones). UNIQUE (email) and UNIQUE (phone) cannot come back until they are changed.',
      shared_solo_emails, shared_solo_phones, shared_team_emails, shared_team_phones;
  end if;

  if team_photos > 0 then
    raise exception '% team rider(s) have a photo on their row. Remove those photos from the Teams list first.', team_photos;
  end if;
end
$preconditions$;

-- 1. The paper entry's old duplicate checks -----------------------------------
-- The reverse of the migration's two patches: each replacement swapped back
-- for its anchor, asserted the same way.

create or replace function pg_temp.registration_unpatch_body(
  p_function regprocedure,
  p_patched text,
  p_original text
)
returns void
language plpgsql
as $$
declare
  v_definition text;
  v_occurrences integer;
begin
  v_definition := replace(pg_catalog.pg_get_functiondef(p_function), E'\r\n', E'\n');
  -- Normalised like the body: a paste from a Windows checkout carries CR LF.
  p_patched := replace(p_patched, E'\r\n', E'\n');
  p_original := replace(p_original, E'\r\n', E'\n');

  if position(p_patched in v_definition) = 0 then
    raise notice '% does not carry this patch; left unchanged.', p_function;
    return;
  end if;

  v_occurrences := (
    char_length(v_definition) - char_length(replace(v_definition, p_patched, ''))
  ) / char_length(p_patched);

  if v_occurrences <> 1 then
    raise exception 'Could not undo the patch on %: found it % times.', p_function, v_occurrences;
  end if;

  execute replace(v_definition, p_patched, p_original);
end;
$$;

select pg_temp.registration_unpatch_body(
  pg_catalog.to_regprocedure('public.admin_create_paper_registration(text, jsonb, uuid, text, text)'),
  $patched$    -- Riders may share an email or a phone (20261108120000); the same
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

    seen_phones := seen_phones || (public.rider_name_key(rider ->> 'full_name') || pg_catalog.chr(31) || rider_phone_key);$patched$,
  $original$    if rider_email is not null and rider_email = any (seen_emails) then
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

    seen_phones := seen_phones || rider_phone_key;$original$
);

select pg_temp.registration_unpatch_body(
  pg_catalog.to_regprocedure('public.admin_create_paper_registration(text, jsonb, uuid, text, text)'),
  $patched$    -- The same rider in the same kind of entry (20261108120000): same name,
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
  end loop;$patched$,
  $original$    for conflict in
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
  end loop;$original$
);

revoke execute on function public.admin_create_paper_registration(text, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_paper_registration(text, jsonb, uuid, text, text)
  to service_role;

-- 2. The email-only confirmation-code trigger, as 20260728163000 had it --------

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
begin
  select entry.confirmation_code, entry.checked_in_at, entry.checked_in_by
  into existing
  from (
    select confirmation_code, checked_in_at, checked_in_by, email
    from public.solo_registrations
    union all
    select confirmation_code, checked_in_at, checked_in_by, email
    from public.team_members
  ) as entry
  where lower(btrim(entry.email)) = lower(btrim(new.email))
  limit 1;

  if existing.confirmation_code is not null then
    new.confirmation_code := existing.confirmation_code;
    new.checked_in_at := existing.checked_in_at;
    new.checked_in_by := existing.checked_in_by;
    return new;
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

revoke execute on function public.assign_confirmation_code() from public;
revoke execute on function public.assign_confirmation_code() from anon, authenticated;

-- 3. One email and one phone per rider ------------------------------------------

do $constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'solo_registrations_email_key') then
    alter table public.solo_registrations add constraint solo_registrations_email_key unique (email);
  end if;

  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'solo_registrations_phone_key') then
    alter table public.solo_registrations add constraint solo_registrations_phone_key unique (phone);
  end if;

  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'team_members_email_key') then
    alter table public.team_members add constraint team_members_email_key unique (email);
  end if;

  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'team_members_phone_key') then
    alter table public.team_members add constraint team_members_phone_key unique (phone);
  end if;
end
$constraints$;

drop index if exists public.solo_registrations_same_rider_email_key;
drop index if exists public.solo_registrations_same_rider_phone_key;
drop index if exists public.team_members_same_rider_email_key;
drop index if exists public.team_members_same_rider_phone_key;
drop index if exists public.solo_registrations_email_lower_idx;
drop index if exists public.solo_registrations_phone_digits_idx;
drop index if exists public.team_members_email_lower_idx;
drop index if exists public.team_members_phone_digits_idx;

-- 4. No photo on a team rider's row ---------------------------------------------

alter table public.team_members drop constraint if exists team_members_headshot_path_own_folder;
alter table public.team_members drop column if exists headshot_path;

-- 5. The helpers, once nothing uses them -----------------------------------------

drop function if exists public.rider_name_key(text);
drop function if exists public.phone_digits(text);

notify pgrst, 'reload schema';
