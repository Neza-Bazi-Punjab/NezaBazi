-- Audited rider check-in.
--
-- Administrators have no direct write access to the registration tables (see
-- lock_admin_registration_write_paths), so check-in goes through a
-- service-role-only function that flips the arrival state and writes its audit
-- record in the same transaction. This is a separate function from
-- admin_mutate_registration rather than another branch inside it: check-in has
-- no editable payload, and a same-day desk operation should not share a code
-- path with edits and deletes.

create or replace function public.admin_set_check_in(
  p_target_table text,
  p_target_id uuid,
  p_checked_in boolean,
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
  old_row jsonb;
  new_row jsonb;
begin
  if p_target_table not in ('solo_registrations', 'team_members') then
    raise exception 'Unsupported check-in target.' using errcode = '22023';
  end if;

  if p_target_table = 'solo_registrations' then
    select to_jsonb(registration.*)
    into old_row
    from public.solo_registrations as registration
    where registration.id = p_target_id
    for update;
  else
    select to_jsonb(member.*)
    into old_row
    from public.team_members as member
    where member.id = p_target_id
    for update;
  end if;

  if old_row is null then
    raise exception 'Rider not found.' using errcode = 'P0002';
  end if;

  -- Re-scanning a code that is already checked in is the common desk mistake,
  -- so it fails loudly instead of silently overwriting the original arrival
  -- time and the administrator who recorded it.
  if p_checked_in and old_row ->> 'checked_in_at' is not null then
    raise exception 'This rider is already checked in.' using errcode = '22023';
  end if;

  if not p_checked_in and old_row ->> 'checked_in_at' is null then
    raise exception 'This rider is not checked in.' using errcode = '22023';
  end if;

  if p_target_table = 'solo_registrations' then
    update public.solo_registrations as registration
    set
      checked_in_at = case when p_checked_in then now() else null end,
      checked_in_by = case when p_checked_in then p_actor_id else null end
    where registration.id = p_target_id
    returning to_jsonb(registration.*) into new_row;
  else
    update public.team_members as member
    set
      checked_in_at = case when p_checked_in then now() else null end,
      checked_in_by = case when p_checked_in then p_actor_id else null end
    where member.id = p_target_id
    returning to_jsonb(member.*) into new_row;
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
    case when p_checked_in then 'check_in_rider' else 'undo_check_in_rider' end,
    p_target_table,
    p_target_id::text,
    jsonb_build_object(
      'subject_name', new_row ->> 'full_name',
      'confirmation_code', new_row ->> 'confirmation_code',
      'checked_in_at', new_row ->> 'checked_in_at'
    )
  );

  return new_row;
end;
$$;

-- Look a rider up by the code they bring to the desk. Returns at most one row
-- because codes are unique across both tables. Kept server-side so the desk
-- never needs read access to the full registration list to resolve one code.
create or replace function public.admin_find_rider_by_code(p_code text)
returns table (
  id uuid,
  source text,
  team_id uuid,
  team_name text,
  is_leader boolean,
  full_name text,
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
    member.age,
    member.location,
    member.phone,
    member.email,
    member.years_experience,
    null::text as horse_name,
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

revoke execute on function public.admin_set_check_in(text, uuid, boolean, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.admin_find_rider_by_code(text)
  from public, anon, authenticated;

grant execute on function public.admin_set_check_in(text, uuid, boolean, uuid, text, text)
  to service_role;
grant execute on function public.admin_find_rider_by_code(text)
  to service_role;
