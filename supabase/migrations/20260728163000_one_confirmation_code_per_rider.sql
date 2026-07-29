-- One confirmation code per rider, not per registration.
--
-- A rider may hold two entries: a solo registration and a place on a team.
-- The first version of this feature gave each row its own code, which was wrong
-- in two ways. The rider received two codes and had to know to present both,
-- and — worse — checking one in left the other showing as absent, so a rider
-- standing at the desk could still be counted missing from their team roster
-- and hold the whole section out of the brackets.
--
-- Check-in records whether a person arrived. That is a fact about the person,
-- so the code and the arrival state now follow the person across both entries.
--
-- Identity here is the normalized email address, which is what the rest of the
-- app already uses to connect a rider to entries created by someone else (see
-- the account sync). It is unique within each registration table, so a rider
-- has at most one solo row and one team row. When verified `profile_id`
-- linking replaces email matching, this should move with it.

-- 1. Reuse an existing code for the same person ------------------------------

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
  -- Already registered elsewhere? Take that code, and that arrival state with
  -- it, so the two entries can never disagree about whether the rider is here.
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

-- 2. Collapse any rider who already holds two codes --------------------------
-- No rows match today, but this keeps the migration correct if it is ever
-- replayed against a database where someone registered both ways first.

update public.team_members as member
set
  confirmation_code = solo.confirmation_code,
  checked_in_at = coalesce(member.checked_in_at, solo.checked_in_at),
  checked_in_by = coalesce(member.checked_in_by, solo.checked_in_by)
from public.solo_registrations as solo
where lower(btrim(member.email)) = lower(btrim(solo.email))
  and member.confirmation_code is distinct from solo.confirmation_code;

-- 3. Check in by code, across every entry the rider holds --------------------
-- Replaces admin_set_check_in(text, uuid, boolean, ...), which worked on a
-- single row and could therefore leave a rider half-arrived.

drop function if exists public.admin_set_check_in(text, uuid, boolean, uuid, text, text);

create or replace function public.admin_set_check_in(
  p_code text,
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
  normalized_code text := upper(btrim(p_code));
  rider_name text;
  was_checked_in boolean;
  solo_updated integer := 0;
  team_updated integer := 0;
begin
  select entry.full_name, entry.checked_in_at is not null
  into rider_name, was_checked_in
  from (
    select full_name, checked_in_at, confirmation_code
    from public.solo_registrations
    union all
    select full_name, checked_in_at, confirmation_code
    from public.team_members
  ) as entry
  where upper(btrim(entry.confirmation_code)) = normalized_code
  limit 1;

  if rider_name is null then
    raise exception 'Rider not found.' using errcode = 'P0002';
  end if;

  -- Re-scanning an arrived rider is the common desk mistake, so it fails
  -- rather than quietly resetting the original time and administrator.
  if p_checked_in and was_checked_in then
    raise exception 'This rider is already checked in.' using errcode = '22023';
  end if;

  if not p_checked_in and not was_checked_in then
    raise exception 'This rider is not checked in.' using errcode = '22023';
  end if;

  update public.solo_registrations
  set
    checked_in_at = case when p_checked_in then now() else null end,
    checked_in_by = case when p_checked_in then p_actor_id else null end
  where upper(btrim(confirmation_code)) = normalized_code;

  get diagnostics solo_updated = row_count;

  update public.team_members
  set
    checked_in_at = case when p_checked_in then now() else null end,
    checked_in_by = case when p_checked_in then p_actor_id else null end
  where upper(btrim(confirmation_code)) = normalized_code;

  get diagnostics team_updated = row_count;

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
    'registrations',
    normalized_code,
    jsonb_build_object(
      'subject_name', rider_name,
      'confirmation_code', normalized_code,
      'solo_entries', solo_updated,
      'team_entries', team_updated
    )
  );

  return jsonb_build_object(
    'confirmation_code', normalized_code,
    'full_name', rider_name,
    'checked_in', p_checked_in,
    'solo_entries', solo_updated,
    'team_entries', team_updated
  );
end;
$$;

revoke execute on function public.admin_set_check_in(text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_check_in(text, boolean, uuid, text, text)
  to service_role;
