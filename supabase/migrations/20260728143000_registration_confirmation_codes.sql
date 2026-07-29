-- Confirmation codes for every registered rider.
--
-- Solo entrants and all four riders on a team each receive a unique code when
-- they register. The rider brings that code to check-in the day before the
-- event; an administrator looks it up and confirms they arrived, and only
-- checked-in riders are eligible for the brackets.
--
-- The code is random rather than sequential on purpose. A sequential number
-- would leak the total registration count to anyone holding a code, would let
-- a stranger guess a valid one and check in as someone else, and would collide
-- with the separate bracket numbering assigned once registration closes.

-- 1. Code generation --------------------------------------------------------

create or replace function public.generate_confirmation_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No O/0, I/1 or U. Staff read these aloud across a noisy check-in desk.
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTVWXYZ';
  code text := '';
  character_index integer;
begin
  for character_index in 1..6 loop
    code := code || substr(
      alphabet,
      1 + floor(random() * length(alphabet))::integer,
      1
    );
  end loop;

  return 'NBP-' || code;
end;
$$;

comment on function public.generate_confirmation_code() is
  'Returns a random NBP-XXXXXX check-in code. Uniqueness is enforced by the '
  'caller and by the unique indexes on the registration tables.';

-- 2. Columns ----------------------------------------------------------------

alter table public.solo_registrations
  add column if not exists confirmation_code text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid
    references public.profiles(id) on delete set null;

alter table public.team_members
  add column if not exists confirmation_code text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid
    references public.profiles(id) on delete set null;

-- 3. Backfill the rows that registered before codes existed -----------------

do $backfill$
declare
  target record;
  candidate text;
begin
  for target in
    select id from public.solo_registrations where confirmation_code is null
  loop
    loop
      candidate := public.generate_confirmation_code();
      exit when not exists (
        select 1 from public.solo_registrations
        where confirmation_code = candidate
      ) and not exists (
        select 1 from public.team_members
        where confirmation_code = candidate
      );
    end loop;

    update public.solo_registrations
    set confirmation_code = candidate
    where id = target.id;
  end loop;

  for target in
    select id from public.team_members where confirmation_code is null
  loop
    loop
      candidate := public.generate_confirmation_code();
      exit when not exists (
        select 1 from public.solo_registrations
        where confirmation_code = candidate
      ) and not exists (
        select 1 from public.team_members
        where confirmation_code = candidate
      );
    end loop;

    update public.team_members
    set confirmation_code = candidate
    where id = target.id;
  end loop;
end
$backfill$;

-- 4. Uniqueness and required-ness -------------------------------------------
-- Codes are unique across both tables: the check-in desk types one code and
-- the lookup searches solo entrants and team riders together, so a shared code
-- would be ambiguous. Per-table unique indexes catch any insert race; the
-- assignment trigger below does the cross-table check.

create unique index if not exists solo_registrations_confirmation_code_key
  on public.solo_registrations(confirmation_code);

create unique index if not exists team_members_confirmation_code_key
  on public.team_members(confirmation_code);

alter table public.solo_registrations
  alter column confirmation_code set not null;

alter table public.team_members
  alter column confirmation_code set not null;

-- Check-in lookups scan by code; the admin dashboard counts by arrival.
create index if not exists solo_registrations_checked_in_at_idx
  on public.solo_registrations(checked_in_at);

create index if not exists team_members_checked_in_at_idx
  on public.team_members(checked_in_at);

-- 5. Server-side assignment --------------------------------------------------
-- Solo registrations are inserted straight from the browser under RLS, so the
-- code can never be taken from client input. This trigger overwrites whatever
-- arrived and clears the check-in columns, making a self-checked-in
-- registration impossible to forge at insert time.

create or replace function public.assign_confirmation_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
begin
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

drop trigger if exists assign_confirmation_code on public.solo_registrations;
create trigger assign_confirmation_code
  before insert on public.solo_registrations
  for each row execute function public.assign_confirmation_code();

drop trigger if exists assign_confirmation_code on public.team_members;
create trigger assign_confirmation_code
  before insert on public.team_members
  for each row execute function public.assign_confirmation_code();

-- Trigger-only function: no client role may call it directly, matching
-- revoke_execute_from_public_on_trigger_functions.
revoke execute on function public.assign_confirmation_code() from public;
revoke execute on function public.assign_confirmation_code() from anon, authenticated;

-- 6. Keep codes and check-in state out of browser reach ----------------------
-- Postgres cannot revoke a single column from a table-wide UPDATE grant, so
-- the table grant is replaced by an explicit column list. A player editing
-- their own registration keeps working; confirmation_code, checked_in_at and
-- checked_in_by are simply not in the list, so only the service role -- that
-- is, the audited admin route -- can write them.

revoke update on public.solo_registrations from authenticated;
grant update (
  full_name,
  age,
  location,
  phone,
  email,
  years_experience,
  horse_name,
  horse_age,
  horse_breed,
  emergency_contact_name,
  emergency_contact_phone
) on public.solo_registrations to authenticated;

revoke update on public.team_members from authenticated;
grant update (
  full_name,
  age,
  location,
  phone,
  email,
  years_experience,
  horse_age,
  horse_breed
) on public.team_members to authenticated;
