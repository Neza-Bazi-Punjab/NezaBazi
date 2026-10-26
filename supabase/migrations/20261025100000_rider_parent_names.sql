-- Father's and mother's names for every rider.
--
-- The commentary panel introduces a rider the way the announcer at a village
-- tournament does — "son of …" — and nothing we hold gives them the names. Both
-- columns go on solo_registrations and on team_members: a team rider is
-- announced on their own, so each of the four needs their own pair.
--
-- Optional, on purpose. Registrations stay open for weeks yet and keep arriving
-- right up to check-in, and the names exist to help the announcer, not to
-- decide who rides: a required field would turn an entry away over a detail
-- the event does not depend on. Rows registered before this migration stay
-- null and remain editable by an administrator. The checks below therefore
-- tolerate null and constrain only the shape of a value that is present, like
-- the team emergency contact. If the organisers later want the names required,
-- enforce it in the submit routes rather than here — a NOT NULL would make
-- every older row uneditable.
--
-- The live project is migrated by hand in the SQL editor, so every statement
-- is idempotent and checks its own result: a second run changes nothing, and a
-- database that is not the shape this file expects fails loudly instead of
-- being half-patched.

alter table public.solo_registrations
  add column if not exists father_name text,
  add column if not exists mother_name text;

alter table public.team_members
  add column if not exists father_name text,
  add column if not exists mother_name text;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_father_name_length'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_father_name_length
      check (
        father_name is null
        or char_length(btrim(father_name)) between 1 and 200
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_mother_name_length'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_mother_name_length
      check (
        mother_name is null
        or char_length(btrim(mother_name)) between 1 and 200
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.team_members'::pg_catalog.regclass
      and conname = 'team_members_father_name_length'
  ) then
    alter table public.team_members
      add constraint team_members_father_name_length
      check (
        father_name is null
        or char_length(btrim(father_name)) between 1 and 200
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.team_members'::pg_catalog.regclass
      and conname = 'team_members_mother_name_length'
  ) then
    alter table public.team_members
      add constraint team_members_mother_name_length
      check (
        mother_name is null
        or char_length(btrim(mother_name)) between 1 and 200
      );
  end if;
end
$constraint$;

-- Riders write these themselves: a solo entrant inserts their own row from the
-- browser, and a team leader's session inserts the four team_members rows.
-- registration_confirmation_codes replaced the table-wide UPDATE grant on both
-- tables with an explicit column list, so new columns are not covered by it
-- and an owner's edit would silently drop them. The SELECT and INSERT grants
-- are restated per column for the same reason; where a table-wide grant still
-- exists they are harmless. confirmation_code and the check-in columns stay
-- out of every list.
grant select (father_name, mother_name) on public.solo_registrations to authenticated;
grant insert (father_name, mother_name) on public.solo_registrations to authenticated;
grant update (father_name, mother_name) on public.solo_registrations to authenticated;

grant select (father_name, mother_name) on public.team_members to authenticated;
grant insert (father_name, mother_name) on public.team_members to authenticated;
grant update (father_name, mother_name) on public.team_members to authenticated;

-- Let administrators edit both names, and record a change in the audit diff.
--
-- Patched in place from pg_get_functiondef rather than retyped, for the same
-- reason as admin_edit_team_horse_name and team_emergency_contact: this is
-- ~7 KB guarding every admin write and its audit record, and transcribing it
-- to add a few lines invites a silent divergence between this file and what is
-- deployed. Each substitution must find its anchor exactly once and is skipped
-- when its result is already present, so a second run is a no-op and an
-- unrecognised body fails loudly instead of being half-patched.
--
-- Both UPDATEs store nullif(btrim(…), '') so a cleared box becomes null rather
-- than a blank the length check would reject. A payload that omits a key keeps
-- the stored value: a dashboard tab loaded before this release sends no parent
-- names, and an edit made from it must not wipe the ones a rider supplied.

do $patch$
declare
  target_function constant regprocedure := pg_catalog.to_regprocedure(
    'public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)'
  );
  -- {what is being patched, anchor in the deployed body, replacement}
  substitutions constant text[] := array[
    array[
      'the team-member editable field list',
      E'    ''horse_breed''\n  ];\n  solo_editable_fields',
      E'    ''horse_breed'',\n    ''father_name'',\n    ''mother_name''\n  ];\n  solo_editable_fields'
    ],
    array[
      'the solo editable field list',
      E'    ''emergency_contact_phone''\n  ];\nbegin',
      E'    ''emergency_contact_phone'',\n    ''father_name'',\n    ''mother_name''\n  ];\nbegin'
    ],
    array[
      'the solo UPDATE',
      E'      emergency_contact_phone = p_payload ->> ''emergency_contact_phone''\n    where registration.id = p_target_id',
      E'      emergency_contact_phone = p_payload ->> ''emergency_contact_phone'',\n      father_name = case\n        when p_payload ? ''father_name'' then nullif(btrim(p_payload ->> ''father_name''), '''')\n        else registration.father_name\n      end,\n      mother_name = case\n        when p_payload ? ''mother_name'' then nullif(btrim(p_payload ->> ''mother_name''), '''')\n        else registration.mother_name\n      end\n    where registration.id = p_target_id'
    ],
    array[
      'the team member UPDATE',
      E'        horse_breed = member_payload ->> ''horse_breed''\n      where member.id = member_id',
      E'        horse_breed = member_payload ->> ''horse_breed'',\n        father_name = case\n          when member_payload ? ''father_name'' then nullif(btrim(member_payload ->> ''father_name''), '''')\n          else member.father_name\n        end,\n        mother_name = case\n          when member_payload ? ''mother_name'' then nullif(btrim(member_payload ->> ''mother_name''), '''')\n          else member.mother_name\n        end\n      where member.id = member_id'
    ]
  ];
  substitution text[];
  original text;
  definition text;
  patched text;
  occurrences integer;
begin
  if target_function is null then
    raise exception 'admin_mutate_registration() not found — apply the earlier migrations first.';
  end if;

  -- The anchors are written with \n so they do not depend on the line endings
  -- of whichever working copy the function was last pasted from.
  original := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');
  definition := original;

  foreach substitution slice 1 in array substitutions
  loop
    -- Applied by an earlier run of this migration.
    continue when position(substitution[3] in definition) > 0;

    occurrences := (
      char_length(definition) - char_length(replace(definition, substitution[2], ''))
    ) / char_length(substitution[2]);

    if occurrences <> 1 then
      raise exception
        'Could not add the parents'' names to %: expected its anchor once, found it % times.',
        substitution[1],
        occurrences;
    end if;

    patched := replace(definition, substitution[2], substitution[3]);

    if patched = definition then
      raise exception 'Could not add the parents'' names to %.', substitution[1];
    end if;

    definition := patched;
  end loop;

  if definition = original then
    raise notice 'admin_mutate_registration already writes father_name and mother_name; left unchanged.';
  else
    execute definition;
  end if;

  -- Read the deployed body back rather than trusting the EXECUTE.
  definition := replace(pg_catalog.pg_get_functiondef(target_function), E'\r\n', E'\n');

  foreach substitution slice 1 in array substitutions
  loop
    if position(substitution[3] in definition) = 0 then
      raise exception 'admin_mutate_registration does not write the parents'' names in %.', substitution[1];
    end if;
  end loop;
end
$patch$;

-- CREATE OR REPLACE keeps the grants when the signature is unchanged, as it is
-- here, but restate them so this migration is safe to run standalone.
revoke execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  to service_role;

-- Show both names on the check-in desk's rider record.
--
-- The return type changes, which CREATE OR REPLACE refuses, so the function is
-- dropped and created again. Everything else is as admin_rider_check_in wrote
-- it except one fix: the team branch now returns the rider's own horse_name,
-- which team_member_horse_name added after the function was written (it
-- returned null, so the desk never saw a team rider's horse). The team
-- branch's emergency contact stays null: a team's contact lives on `teams`
-- and the check-in route reads it from there.
drop function if exists public.admin_find_rider_by_code(text);

create function public.admin_find_rider_by_code(p_code text)
returns table (
  id uuid,
  source text,
  team_id uuid,
  team_name text,
  is_leader boolean,
  full_name text,
  father_name text,
  mother_name text,
  age integer,
  location text,
  phone text,
  email text,
  years_experience integer,
  horse_name text,
  horse_age integer,
  horse_breed text,
  emergency_contact_name text,
  emergency_contact_phone text,
  confirmation_code text,
  checked_in_at timestamptz,
  checked_in_by uuid,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    registration.id,
    'solo'::text as source,
    null::uuid as team_id,
    null::text as team_name,
    null::boolean as is_leader,
    registration.full_name,
    registration.father_name,
    registration.mother_name,
    registration.age,
    registration.location,
    registration.phone,
    registration.email,
    registration.years_experience,
    registration.horse_name,
    registration.horse_age,
    registration.horse_breed,
    registration.emergency_contact_name,
    registration.emergency_contact_phone,
    registration.confirmation_code,
    registration.checked_in_at,
    registration.checked_in_by,
    registration.created_at
  from public.solo_registrations as registration
  where upper(btrim(registration.confirmation_code)) = upper(btrim(p_code))

  union all

  select
    member.id,
    'team'::text as source,
    member.team_id,
    team.team_name,
    member.is_leader,
    member.full_name,
    member.father_name,
    member.mother_name,
    member.age,
    member.location,
    member.phone,
    member.email,
    member.years_experience,
    member.horse_name,
    member.horse_age,
    member.horse_breed,
    null::text as emergency_contact_name,
    null::text as emergency_contact_phone,
    member.confirmation_code,
    member.checked_in_at,
    member.checked_in_by,
    member.created_at
  from public.team_members as member
  left join public.teams as team on team.id = member.team_id
  where upper(btrim(member.confirmation_code)) = upper(btrim(p_code));
$$;

-- A new function is executable by PUBLIC, and Supabase's default privileges
-- add anon and authenticated, so the drop above lost the earlier revoke.
revoke execute on function public.admin_find_rider_by_code(text)
  from public, anon, authenticated;
grant execute on function public.admin_find_rider_by_code(text)
  to service_role;

-- Fail the migration rather than report success over a partial result.
do $verify$
declare
  target_table text;
  target_column text;
  privilege text;
begin
  foreach target_table in array array['solo_registrations', 'team_members']
  loop
    foreach target_column in array array['father_name', 'mother_name']
    loop
      if not exists (
        select 1
        from pg_catalog.pg_attribute
        where attrelid = pg_catalog.to_regclass('public.' || target_table)
          and attname = target_column
          and not attisdropped
      ) then
        raise exception 'public.%.% is missing.', target_table, target_column;
      end if;

      if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid = pg_catalog.to_regclass('public.' || target_table)
          and conname = target_table || '_' || target_column || '_length'
      ) then
        raise exception 'The length check on public.%.% is missing.', target_table, target_column;
      end if;

      foreach privilege in array array['SELECT', 'INSERT', 'UPDATE']
      loop
        if not pg_catalog.has_column_privilege(
          'authenticated', 'public.' || target_table, target_column, privilege
        ) then
          raise exception 'authenticated lacks % on public.%.%.', privilege, target_table, target_column;
        end if;
      end loop;
    end loop;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = pg_catalog.to_regprocedure('public.admin_find_rider_by_code(text)')
      and 'father_name' = any(proargnames)
      and 'mother_name' = any(proargnames)
  ) then
    raise exception 'admin_find_rider_by_code does not return the parents'' names.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.admin_find_rider_by_code(text)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.admin_find_rider_by_code(text)', 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'anon', 'public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)', 'EXECUTE'
    )
  then
    raise exception 'A browser role can execute an admin registration function.';
  end if;

  if not pg_catalog.has_function_privilege('service_role', 'public.admin_find_rider_by_code(text)', 'EXECUTE') then
    raise exception 'service_role cannot execute admin_find_rider_by_code.';
  end if;
end
$verify$;

-- The function's result shape changed; have PostgREST pick it up now rather
-- than on its next schema poll.
notify pgrst, 'reload schema';
