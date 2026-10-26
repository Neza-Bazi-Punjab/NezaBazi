-- Live scoring: rounds, runs, the live pointer and advance overrides.
--
-- On event day judges record every run from a phone, the public scoreboard
-- (/live) and the stream overlays follow along within a second or two, and the
-- commentary panel tells the announcer who is on course and who is next. This
-- migration is the whole database side of that:
--
--   scoring_rounds             one row per round (Single qualification, Aarhi
--                              knockouts, Section rounds, finals);
--   scoring_runs               one row per pass of one rider at one peg, with
--                              a display snapshot of the rider so nobody
--                              outside the server ever reads a registration
--                              table to show a scoreboard;
--   scoring_live_state         a single row: which round and run are live,
--                              which pool has been called, what the screens
--                              show;
--   scoring_advance_overrides  an administrator's decision that overrides the
--                              round's rule for one entrant;
--   scoring_leaderboard        a view ranking every entrant in every round.
--
-- Security model ("bulletproof" is the brief):
--
--   * Every table is READ-ONLY from the browser. anon and authenticated get
--     SELECT and a permissive SELECT policy (the public scoreboard and the
--     realtime subscription need it) and nothing else: no INSERT, UPDATE or
--     DELETE grant and no write policy for any client role.
--   * Every write goes through one of the scoring_* functions below. They are
--     security invoker, search_path '', executable by service_role only, so
--     the only way in is a server route that has already checked the caller's
--     role. Each one locks what it changes (`for update`), validates the
--     transition, and writes its admin_audit_log row in the same transaction,
--     so a change and its audit record commit or fail together.
--   * Errors meant for a person use errcode P0002 (not found) or 22023 (not
--     allowed right now) with a message fit to show a judge on a phone. The
--     routes pass only those two through; anything else is a generic 500.
--   * Runs carry only what is announced over the PA: name, horse, team, home
--     location. Never age, phone, email, parents or emergency contacts.
--
-- Locking order, to keep two judges and an administrator from deadlocking:
-- scoring_live_state first, then the round row, then the round's runs in
-- run_order. A function that changes more than one run of a round locks all
-- of that round's runs in run_order before changing any of them.
--
-- The live project is migrated by hand in the Supabase SQL editor, after
-- 20261025110000_staff_roles.sql. Everything here is idempotent (if not
-- exists / drop ... if exists / create or replace) and the preconditions are
-- asserted up front, so a second run changes nothing and a database that is
-- not the shape this file expects fails loudly instead of being half-built.
--
-- Pre-existing drift: the live project has two undocumented tables,
-- score_attempts and solo_scoresheet. They are left untouched; every object
-- here is named scoring_* so nothing collides.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
declare
  v_missing text;
begin
  -- UNIQUE NULLS NOT DISTINCT (below) arrived in Postgres 15.
  if pg_catalog.current_setting('server_version_num')::integer < 150000 then
    raise exception 'Live scoring needs Postgres 15 or newer; this server is %.',
      pg_catalog.current_setting('server_version');
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ')
  into v_missing
  from (
    values
      ('profiles', 'id'),
      ('profiles', 'role'),
      ('solo_registrations', 'id'),
      ('solo_registrations', 'full_name'),
      ('solo_registrations', 'horse_name'),
      ('solo_registrations', 'location'),
      ('solo_registrations', 'checked_in_at'),
      ('teams', 'id'),
      ('teams', 'team_name'),
      ('team_members', 'id'),
      ('team_members', 'team_id'),
      ('team_members', 'full_name'),
      ('team_members', 'horse_name'),
      ('team_members', 'location'),
      ('team_members', 'is_leader'),
      ('team_members', 'checked_in_at'),
      ('team_members', 'created_at'),
      ('admin_audit_log', 'actor_id'),
      ('admin_audit_log', 'actor_name'),
      ('admin_audit_log', 'actor_email'),
      ('admin_audit_log', 'action'),
      ('admin_audit_log', 'target_table'),
      ('admin_audit_log', 'target_id'),
      ('admin_audit_log', 'details')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = pg_catalog.to_regclass('public.' || required.table_name)
      and attribute.attname = required.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  if v_missing is not null then
    raise exception 'Live scoring needs columns that are missing: %. Apply the earlier migrations first.', v_missing;
  end if;

  if pg_catalog.to_regprocedure('public.admin_audit_diff(jsonb, jsonb, text[])') is null then
    raise exception 'admin_audit_diff() not found — apply harden_admin_audit_log first.';
  end if;

  -- Judges are a role; the panels are useless without it. Enforces the order
  -- in which the two files are applied.
  if pg_catalog.to_regprocedure('public.has_role(text[])') is null then
    raise exception 'public.has_role() not found — apply 20261025110000_staff_roles.sql first.';
  end if;
end
$preconditions$;

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.scoring_rounds (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    constraint scoring_rounds_event_type_check check (event_type in ('single', 'section')),
  name text not null
    constraint scoring_rounds_name_check check (char_length(btrim(name)) between 1 and 80),
  -- 0 is the Single qualification round; knockout rounds count from 1.
  round_number integer not null
    constraint scoring_rounds_round_number_check check (round_number between 0 and 50),
  attempts_per_rider integer not null default 1
    constraint scoring_rounds_attempts_check check (attempts_per_rider between 1 and 3),
  -- Section rounds only (8, 12, 16). Null for Single, where a carry is the
  -- only way through.
  target_points integer
    constraint scoring_rounds_target_points_check
    check (target_points is null or target_points between 1 and 16),
  status text not null default 'upcoming'
    constraint scoring_rounds_status_check check (status in ('upcoming', 'live', 'complete')),
  sort_order integer not null,
  -- Entrants per pool, roughly. Null: the round is not split into pools.
  pool_size integer
    constraint scoring_rounds_pool_size_check
    check (pool_size is null or pool_size between 2 and 100),
  -- [{place, entrant_key, name}], validated by scoring_upsert_round.
  podium jsonb
    constraint scoring_rounds_podium_check
    check (podium is null or jsonb_typeof(podium) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scoring_rounds_event_round_key unique (event_type, round_number),
  constraint scoring_rounds_sort_order_key unique (sort_order)
);

comment on table public.scoring_rounds is
  'Live scoring rounds. Read-only to clients; written only by the scoring_* functions.';

create table if not exists public.scoring_runs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.scoring_rounds(id) on delete cascade,
  run_order integer not null
    constraint scoring_runs_run_order_check check (run_order >= 1),
  attempt_number integer not null default 1
    constraint scoring_runs_attempt_number_check check (attempt_number between 1 and 3),
  pool_label text
    constraint scoring_runs_pool_label_check
    check (pool_label is null or pool_label ~ '^[A-Z]{1,2}$'),
  solo_registration_id uuid references public.solo_registrations(id) on delete set null,
  team_member_id uuid references public.team_members(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  -- "solo:<solo_registration_id>" or "team:<team_id>". Stored rather than
  -- generated, so it is not derived from columns that ON DELETE SET NULL can
  -- clear. Set by the builder; the insert trigger fills it when empty and
  -- refuses one that does not match the ids.
  entrant_key text not null
    constraint scoring_runs_entrant_key_check
    check (entrant_key ~ '^(solo|team):[0-9a-f-]{36}$'),
  -- Display snapshot: only what is announced over the PA.
  rider_name text not null
    constraint scoring_runs_rider_name_check check (char_length(btrim(rider_name)) between 1 and 200),
  horse_name text
    constraint scoring_runs_horse_name_check check (horse_name is null or char_length(horse_name) <= 200),
  team_name text
    constraint scoring_runs_team_name_check check (team_name is null or char_length(team_name) <= 200),
  rider_location text
    constraint scoring_runs_rider_location_check
    check (rider_location is null or char_length(rider_location) <= 300),
  status text not null default 'pending'
    constraint scoring_runs_status_check
    check (status in ('pending', 'on_course', 'scored', 'void')),
  result text
    constraint scoring_runs_result_check
    check (result is null or result in ('carry', 'strike', 'miss')),
  -- The database computes points; the browser never sends them.
  points integer generated always as (
    case result when 'carry' then 4 when 'strike' then 2 when 'miss' then 0 else null end
  ) stored,
  scored_by uuid references public.profiles(id) on delete set null,
  scored_at timestamptz,
  -- Single rounds with more than one attempt: a carry qualifies the rider, so
  -- scoring_record_result voids their remaining attempts and records here the
  -- run that carried. Clearing or changing that carry puts them back; restoring
  -- a run by hand clears it.
  auto_voided_by uuid references public.scoring_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scoring_runs_round_order_key unique (round_id, run_order),
  constraint scoring_runs_auto_void_is_void check (auto_voided_by is null or status = 'void'),
  -- NULLS NOT DISTINCT: a solo run has no team_member_id, and without this a
  -- solo rider could be given two attempt-1 runs in one round.
  constraint scoring_runs_entrant_attempt_key
    unique nulls not distinct (round_id, entrant_key, team_member_id, attempt_number),
  -- A scored run has a result; an unscored one does not.
  constraint scoring_runs_result_matches_status check ((status = 'scored') = (result is not null)),
  -- Exactly one identity, and a team rider always names their team.
  constraint scoring_runs_one_identity check (num_nonnulls(solo_registration_id, team_member_id) = 1),
  constraint scoring_runs_team_pairing check ((team_member_id is null) = (team_id is null))
);

-- A note on deleting registrations. The identity checks above mean ON DELETE
-- SET NULL on solo_registration_id / team_member_id / team_id can never
-- complete: nulling the id would leave a run with no identity, so the delete
-- of a registration that appears in any start list fails on
-- scoring_runs_one_identity (or, for a team, on the pairing / unique key).
-- That is the intended protection — a rider's recorded results cannot vanish
-- because their registration was deleted. Remove the entrant from the round
-- (or clear the start list) first; then the registration can be deleted.

comment on table public.scoring_runs is
  'One pass of one rider at one peg, with a public display snapshot. Read-only to clients.';

create index if not exists scoring_runs_round_status_order_idx
  on public.scoring_runs (round_id, status, run_order);
create index if not exists scoring_runs_round_entrant_idx
  on public.scoring_runs (round_id, entrant_key);
create index if not exists scoring_runs_scored_at_idx
  on public.scoring_runs (scored_at desc) where scored_at is not null;
-- Foreign-key lookups: the commentary panel's "today" list per rider, and the
-- referential checks when a registration is deleted.
create index if not exists scoring_runs_solo_registration_idx
  on public.scoring_runs (solo_registration_id) where solo_registration_id is not null;
create index if not exists scoring_runs_team_member_idx
  on public.scoring_runs (team_member_id) where team_member_id is not null;
create index if not exists scoring_runs_team_idx
  on public.scoring_runs (team_id) where team_id is not null;

create table if not exists public.scoring_live_state (
  id boolean primary key default true
    constraint scoring_live_state_single_row check (id),
  current_round_id uuid references public.scoring_rounds(id) on delete set null,
  current_run_id uuid references public.scoring_runs(id) on delete set null,
  called_pool_label text
    constraint scoring_live_state_called_pool_check
    check (called_pool_label is null or called_pool_label ~ '^[A-Z]{1,2}$'),
  display_mode text not null default 'scoreboard'
    constraint scoring_live_state_display_mode_check
    check (display_mode in ('scoreboard', 'leaderboard', 'rider', 'pool_call', 'message', 'blank')),
  message text
    constraint scoring_live_state_message_check
    check (message is null or char_length(message) <= 200),
  updated_at timestamptz not null default now()
);

insert into public.scoring_live_state (id) values (true) on conflict do nothing;

comment on table public.scoring_live_state is
  'Single row: what every scoreboard, overlay and panel is following. Read-only to clients.';

create table if not exists public.scoring_advance_overrides (
  round_id uuid not null references public.scoring_rounds(id) on delete cascade,
  entrant_key text not null,
  advanced boolean not null,
  note text
    constraint scoring_advance_overrides_note_check
    check (note is null or char_length(note) <= 300),
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (round_id, entrant_key)
);

comment on table public.scoring_advance_overrides is
  'An administrator''s decision on whether one entrant goes through, overriding the round''s rule.';

-- 2. updated_at ---------------------------------------------------------------
-- Same pattern as registration_drafts: the database stamps every change, so
-- nothing depends on a client clock.

create or replace function public.scoring_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger-only: no client role may call it directly (triggers fire without
-- EXECUTE), matching revoke_execute_from_public_on_trigger_functions.
revoke execute on function public.scoring_set_updated_at() from public, anon, authenticated;

drop trigger if exists scoring_rounds_set_updated_at on public.scoring_rounds;
create trigger scoring_rounds_set_updated_at
  before update on public.scoring_rounds
  for each row execute function public.scoring_set_updated_at();

drop trigger if exists scoring_runs_set_updated_at on public.scoring_runs;
create trigger scoring_runs_set_updated_at
  before update on public.scoring_runs
  for each row execute function public.scoring_set_updated_at();

drop trigger if exists scoring_live_state_set_updated_at on public.scoring_live_state;
create trigger scoring_live_state_set_updated_at
  before update on public.scoring_live_state
  for each row execute function public.scoring_set_updated_at();

drop trigger if exists scoring_advance_overrides_set_updated_at on public.scoring_advance_overrides;
create trigger scoring_advance_overrides_set_updated_at
  before update on public.scoring_advance_overrides
  for each row execute function public.scoring_set_updated_at();

-- 3. Snapshot and identity trigger ---------------------------------------------
-- Every run is born from a real registration row. The trigger checks the ids
-- against those rows (the solo registration exists; the team rider belongs to
-- the team named), derives entrant_key when it was left empty and refuses one
-- that does not match, and fills any blank display field from the
-- registration. A new run always starts pending with no result, whatever the
-- insert said.

create or replace function public.scoring_runs_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected_key text;
  v_rider_name text;
  v_horse_name text;
  v_location text;
  v_team_name text;
  v_member_team_id uuid;
begin
  if new.solo_registration_id is not null then
    if new.team_member_id is not null or new.team_id is not null then
      raise exception 'A run belongs to a solo rider or a team rider, not both.'
        using errcode = '22023';
    end if;

    select registration.full_name, registration.horse_name, registration.location
    into v_rider_name, v_horse_name, v_location
    from public.solo_registrations as registration
    where registration.id = new.solo_registration_id;

    if not found then
      raise exception 'That rider is no longer registered.' using errcode = 'P0002';
    end if;

    v_expected_key := 'solo:' || new.solo_registration_id::text;
    v_team_name := null;
  elsif new.team_member_id is not null then
    select member.team_id, member.full_name, member.horse_name, member.location, team.team_name
    into v_member_team_id, v_rider_name, v_horse_name, v_location, v_team_name
    from public.team_members as member
    join public.teams as team on team.id = member.team_id
    where member.id = new.team_member_id;

    if not found then
      raise exception 'That team rider is no longer registered.' using errcode = 'P0002';
    end if;

    if new.team_id is null then
      new.team_id := v_member_team_id;
    elsif new.team_id <> v_member_team_id then
      raise exception 'That rider is not on this team.' using errcode = '22023';
    end if;

    v_expected_key := 'team:' || v_member_team_id::text;
  else
    raise exception 'A run needs a solo rider or a team rider.' using errcode = '22023';
  end if;

  if new.entrant_key is null or btrim(new.entrant_key) = '' then
    new.entrant_key := v_expected_key;
  elsif new.entrant_key <> v_expected_key then
    raise exception 'The entrant does not match the rider on this run.' using errcode = '22023';
  end if;

  new.rider_name := coalesce(nullif(btrim(new.rider_name), ''), btrim(v_rider_name));
  new.horse_name := coalesce(nullif(btrim(new.horse_name), ''), nullif(btrim(v_horse_name), ''));
  new.rider_location := coalesce(nullif(btrim(new.rider_location), ''), nullif(btrim(v_location), ''));
  new.team_name := case
    when new.team_member_id is null then null
    else coalesce(nullif(btrim(new.team_name), ''), nullif(btrim(v_team_name), ''))
  end;

  new.status := 'pending';
  new.result := null;
  new.scored_by := null;
  new.scored_at := null;
  new.auto_voided_by := null;

  return new;
end;
$$;

revoke execute on function public.scoring_runs_before_insert() from public, anon, authenticated;

drop trigger if exists scoring_runs_before_insert on public.scoring_runs;
create trigger scoring_runs_before_insert
  before insert on public.scoring_runs
  for each row execute function public.scoring_runs_before_insert();

-- 4. Leaderboard view -----------------------------------------------------------
-- One row per (round_id, entrant_key). security_invoker = true: the view reads
-- the tables with the caller's own privileges and RLS, so it can never show
-- an anonymous visitor anything the tables themselves would not.
--
--   points       Single: the best points across the entrant's scored runs.
--                Section: the sum of the team's scored runs.
--   best_result  carry > strike > miss.
--   runs_scored / runs_total exclude void runs.
--   advanced     An override row wins (advanced_overridden = true).
--                Otherwise: a Single rider who has carried is through at once
--                (the remaining attempts are unnecessary). While any run is
--                still to be ridden the answer is null (undecided). Once all
--                are in: Single -> best_result = 'carry'; Section ->
--                points >= target_points, or null when the round has no
--                target.
--   rank         Within the round: points desc, runs_scored asc, name asc.
--   pool_rank    The same ordering within the entrant's pool.
--   members      Section only: the team's runs in riding order.

create or replace view public.scoring_leaderboard
with (security_invoker = true)
as
with entrant_totals as (
  select
    round.id as round_id,
    run.entrant_key,
    round.event_type,
    round.target_points,
    min(run.pool_label) as pool_label,
    (array_agg(run.rider_name order by run.run_order))[1] as first_rider_name,
    (array_agg(run.team_name order by run.run_order))[1] as first_team_name,
    (array_agg(run.horse_name order by run.run_order))[1] as first_horse_name,
    (array_agg(run.rider_location order by run.run_order))[1] as first_location,
    case
      when round.event_type = 'single'
        then coalesce(max(run.points) filter (where run.status = 'scored'), 0)
      else coalesce(sum(run.points) filter (where run.status = 'scored'), 0)
    end::integer as points,
    case
      when bool_or(run.result = 'carry') then 'carry'
      when bool_or(run.result = 'strike') then 'strike'
      when bool_or(run.result = 'miss') then 'miss'
      else null
    end as best_result,
    (count(*) filter (where run.status = 'scored'))::integer as runs_scored,
    (count(*) filter (where run.status <> 'void'))::integer as runs_total,
    case
      when round.event_type = 'section' then
        jsonb_agg(
          jsonb_build_object(
            'team_member_id', run.team_member_id,
            'rider_name', run.rider_name,
            'horse_name', run.horse_name,
            'result', run.result,
            'points', run.points,
            'status', run.status
          )
          order by run.run_order
        )
      else null
    end as members
  from public.scoring_runs as run
  join public.scoring_rounds as round on round.id = run.round_id
  group by round.id, run.entrant_key
),
named as (
  select
    totals.*,
    case
      when totals.event_type = 'section'
        then coalesce(totals.first_team_name, totals.first_rider_name)
      else totals.first_rider_name
    end as entrant_name,
    advance_override.advanced as override_advanced,
    (advance_override.round_id is not null) as advanced_overridden
  from entrant_totals as totals
  left join public.scoring_advance_overrides as advance_override
    on advance_override.round_id = totals.round_id
   and advance_override.entrant_key = totals.entrant_key
)
select
  named.round_id,
  named.entrant_key,
  named.event_type,
  (rank() over (
    partition by named.round_id
    order by named.points desc, named.runs_scored asc, named.entrant_name asc
  ))::integer as rank,
  (rank() over (
    partition by named.round_id, named.pool_label
    order by named.points desc, named.runs_scored asc, named.entrant_name asc
  ))::integer as pool_rank,
  named.pool_label,
  named.entrant_name as name,
  named.first_team_name as team_name,
  case when named.event_type = 'single' then named.first_horse_name else null end as horse_name,
  named.first_location as location,
  named.points,
  named.best_result,
  named.runs_scored,
  named.runs_total,
  case
    when named.advanced_overridden then named.override_advanced
    when named.event_type = 'single' and named.best_result = 'carry' then true
    when named.runs_scored < named.runs_total then null
    when named.event_type = 'single' then false
    when named.target_points is null then null
    else named.points >= named.target_points
  end as advanced,
  named.advanced_overridden,
  named.members
from named;

comment on view public.scoring_leaderboard is
  'Standings per round and pool. security_invoker; readable by anon and authenticated.';

-- 5. Row level security and grants ---------------------------------------------
-- Supabase's default privileges hand new public tables to anon and
-- authenticated with ALL privileges, so everything is revoked first and SELECT
-- granted back explicitly. RLS is enabled on all four tables with a permissive
-- SELECT policy only; there is no INSERT/UPDATE/DELETE policy for any client
-- role, so even a stray grant could not write. service_role keeps full access
-- (it bypasses RLS) and is what the scoring functions run as.

alter table public.scoring_rounds enable row level security;
alter table public.scoring_runs enable row level security;
alter table public.scoring_live_state enable row level security;
alter table public.scoring_advance_overrides enable row level security;

drop policy if exists "Anyone can read scoring rounds" on public.scoring_rounds;
create policy "Anyone can read scoring rounds"
  on public.scoring_rounds for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read scoring runs" on public.scoring_runs;
create policy "Anyone can read scoring runs"
  on public.scoring_runs for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read the live scoring state" on public.scoring_live_state;
create policy "Anyone can read the live scoring state"
  on public.scoring_live_state for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read advance overrides" on public.scoring_advance_overrides;
create policy "Anyone can read advance overrides"
  on public.scoring_advance_overrides for select
  to anon, authenticated
  using (true);

revoke all on table public.scoring_rounds from public, anon, authenticated;
revoke all on table public.scoring_runs from public, anon, authenticated;
revoke all on table public.scoring_live_state from public, anon, authenticated;
revoke all on table public.scoring_advance_overrides from public, anon, authenticated;
revoke all on table public.scoring_leaderboard from public, anon, authenticated;

grant select on table public.scoring_rounds to anon, authenticated;
grant select on table public.scoring_runs to anon, authenticated;
grant select on table public.scoring_live_state to anon, authenticated;
-- Column list: the public needs to know whether an override exists and which
-- way it went (the view reads exactly these columns), not the administrator's
-- note or who set it. Staff read the note through the service-role routes.
grant select (round_id, entrant_key, advanced, updated_at)
  on table public.scoring_advance_overrides to anon, authenticated;
grant select on table public.scoring_leaderboard to anon, authenticated;

grant all on table public.scoring_rounds to service_role;
grant all on table public.scoring_runs to service_role;
grant all on table public.scoring_live_state to service_role;
grant all on table public.scoring_advance_overrides to service_role;
grant select on table public.scoring_leaderboard to service_role;

-- 6. Internal helpers -------------------------------------------------------------
-- Not callable by any client role. They are granted to service_role because
-- the public functions below are security invoker: when a route calls
-- scoring_build_start_list as service_role, the helpers it calls run as
-- service_role too and need EXECUTE.

-- Pool labels A, B, ..., Z, AA, AB, ... for a 0-based index. Must match
-- poolLabelForIndex in src/lib/scoring/types.ts exactly.
create or replace function public.scoring_pool_label(p_index integer)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_label text := '';
  v_remaining integer := p_index;
begin
  if p_index is null or p_index < 0 or p_index > 701 then
    raise exception 'Pool index out of range.' using errcode = '22023';
  end if;

  loop
    v_label := chr(65 + (v_remaining % 26)) || v_label;
    v_remaining := (v_remaining / 26) - 1;
    exit when v_remaining < 0;
  end loop;

  return v_label;
end;
$$;

revoke execute on function public.scoring_pool_label(integer) from public, anon, authenticated;
grant execute on function public.scoring_pool_label(integer) to service_role;

-- The inverse: 'A' -> 0, 'Z' -> 25, 'AA' -> 26. Pool order is draw order, and
-- plain text order would put 'AA' between 'A' and 'B'. Labels are one or two
-- letters (see the CHECK on pool_label).
create or replace function public.scoring_pool_index(p_label text)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case char_length(p_label)
    when 1 then ascii(p_label) - 65
    when 2 then (ascii(substr(p_label, 1, 1)) - 64) * 26 + (ascii(substr(p_label, 2, 1)) - 65)
    else null
  end;
$$;

revoke execute on function public.scoring_pool_index(text) from public, anon, authenticated;
grant execute on function public.scoring_pool_index(text) to service_role;

-- A whole number from a jsonb payload, with a message a person can act on.
-- JSON null (or a missing key) is SQL null.
create or replace function public.scoring_json_int(
  p_value jsonb,
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
  v_number numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) <> 'number' then
    raise exception '% must be a whole number.', p_label using errcode = '22023';
  end if;

  v_number := (p_value #>> '{}')::numeric;

  if v_number <> trunc(v_number) or v_number < p_min or v_number > p_max then
    raise exception '% must be a whole number from % to %.', p_label, p_min, p_max
      using errcode = '22023';
  end if;

  return v_number::integer;
end;
$$;

revoke execute on function public.scoring_json_int(jsonb, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.scoring_json_int(jsonb, text, integer, integer)
  to service_role;

-- A uuid from a jsonb payload. JSON null is SQL null; anything that is not a
-- well-formed uuid string is refused before the cast can raise a raw error.
create or replace function public.scoring_json_uuid(p_value jsonb, p_label text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) <> 'string'
    or (p_value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '% is not a valid id.', p_label using errcode = '22023';
  end if;

  return (p_value #>> '{}')::uuid;
end;
$$;

revoke execute on function public.scoring_json_uuid(jsonb, text) from public, anon, authenticated;
grant execute on function public.scoring_json_uuid(jsonb, text) to service_role;

-- What an entrant is called in a round: the team name for a Section entrant,
-- the rider's name for a Single one. Null when the entrant has no run there.
create or replace function public.scoring_entrant_name(p_round_id uuid, p_entrant_key text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_entrant_key like 'team:%' then coalesce(run.team_name, run.rider_name)
    else run.rider_name
  end
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.entrant_key = p_entrant_key
  order by run.run_order
  limit 1;
$$;

revoke execute on function public.scoring_entrant_name(uuid, text) from public, anon, authenticated;
grant execute on function public.scoring_entrant_name(uuid, text) to service_role;

-- Locks the single live-state row (creating it if someone removed it) and
-- returns it. Every function that may change the live state calls this first,
-- which is the first step of the locking order described at the top.
create or replace function public.scoring_lock_live()
returns public.scoring_live_state
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.scoring_live_state%rowtype;
begin
  select * into v_live
  from public.scoring_live_state as live
  where live.id is true
  for update;

  if not found then
    insert into public.scoring_live_state (id) values (true) on conflict (id) do nothing;

    select * into v_live
    from public.scoring_live_state as live
    where live.id is true
    for update;
  end if;

  return v_live;
end;
$$;

revoke execute on function public.scoring_lock_live() from public, anon, authenticated;
grant execute on function public.scoring_lock_live() to service_role;

-- Renumbers a round's runs 1..n by (pool, attempt pass, current order): the
-- layout every start list has — Pool A's passes, then Pool B's, and within a
-- pool every entrant's attempt 1, then every attempt 2.
--
-- Two-phase, so the unique (round_id, run_order) key never trips while the
-- statement is half done: phase one moves every row clear of the target range
-- (above the current maximum), phase two writes the final numbers. The spec's
-- "negative offsets" would break the run_order >= 1 CHECK, so the shift goes
-- upward instead; it is the same technique. Run orders are distinct positive
-- integers, so max >= n, and every phase-one value (> max) is clear of 1..n.
create or replace function public.scoring_renumber_round(p_round_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift integer;
begin
  select coalesce(max(run.run_order), 0) + 1
  into v_shift
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  -- Phase 1: every row above the current maximum.
  update public.scoring_runs as run
  set run_order = run.run_order + v_shift
  where run.round_id = p_round_id;

  -- Phase 2: the final contiguous numbering.
  update public.scoring_runs as run
  set run_order = ordered.new_order
  from (
    select
      inner_run.id,
      (row_number() over (
        order by
          public.scoring_pool_index(inner_run.pool_label) asc nulls first,
          inner_run.attempt_number asc,
          inner_run.run_order asc
      ))::integer as new_order
    from public.scoring_runs as inner_run
    where inner_run.round_id = p_round_id
  ) as ordered
  where run.id = ordered.id;
end;
$$;

revoke execute on function public.scoring_renumber_round(uuid) from public, anon, authenticated;
grant execute on function public.scoring_renumber_round(uuid) to service_role;

-- Moves the live pointer on after the current run is scored or skipped: the
-- pending run with the lowest run_order after p_after_order in the same round
-- becomes on_course and current; none left -> no current run. The called pool
-- is kept in step when the riding has moved past it (a pool called ahead of
-- time is left alone). Caller holds the live-state lock.
create or replace function public.scoring_advance_live_pointer(
  p_round_id uuid,
  p_after_order integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next_run_id uuid;
  v_next_pool text;
begin
  select run.id, run.pool_label
  into v_next_run_id, v_next_pool
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.status = 'pending'
    and run.run_order > p_after_order
  order by run.run_order
  limit 1
  for update;

  if v_next_run_id is not null then
    update public.scoring_runs as run
    set status = 'on_course'
    where run.id = v_next_run_id;
  end if;

  update public.scoring_live_state as live
  set
    current_run_id = v_next_run_id,
    called_pool_label = case
      when v_next_pool is not null
        and (
          live.called_pool_label is null
          or public.scoring_pool_index(live.called_pool_label)
             < public.scoring_pool_index(v_next_pool)
        )
        then v_next_pool
      else live.called_pool_label
    end
  where live.id is true;

  return v_next_run_id;
end;
$$;

revoke execute on function public.scoring_advance_live_pointer(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.scoring_advance_live_pointer(uuid, integer)
  to service_role;

-- Puts back the attempts a carry made unnecessary, when that carry is cleared
-- or changed to another result: every run still void with auto_voided_by =
-- p_run_id returns to pending. If the entrant has another carry in the round
-- the attempts stay unnecessary, so they are handed to that carry instead (and
-- come back if it is cleared in turn). Returns the ids restored, in run order.
-- Caller holds the live-state lock and the round's runs.
create or replace function public.scoring_restore_auto_voided(p_run_id uuid)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.scoring_runs%rowtype;
  v_other_carry uuid;
  v_restored uuid[];
begin
  select * into v_run
  from public.scoring_runs as run
  where run.id = p_run_id;

  if not found then
    return '{}'::uuid[];
  end if;

  select other.id into v_other_carry
  from public.scoring_runs as other
  where other.round_id = v_run.round_id
    and other.entrant_key = v_run.entrant_key
    and other.id <> p_run_id
    and other.result = 'carry'
  order by other.run_order
  limit 1;

  if v_other_carry is not null then
    update public.scoring_runs as run
    set auto_voided_by = v_other_carry
    where run.auto_voided_by = p_run_id;

    return '{}'::uuid[];
  end if;

  with restored as (
    update public.scoring_runs as run
    set status = 'pending', auto_voided_by = null
    where run.auto_voided_by = p_run_id
      and run.status = 'void'
    returning run.id, run.run_order
  )
  select coalesce(array_agg(restored.id order by restored.run_order), '{}'::uuid[])
  into v_restored
  from restored;

  return v_restored;
end;
$$;

revoke execute on function public.scoring_restore_auto_voided(uuid)
  from public, anon, authenticated;
grant execute on function public.scoring_restore_auto_voided(uuid)
  to service_role;

-- 7. Judge functions --------------------------------------------------------------

-- Record (or, with p_override, replace) a run's result. Scoring the current
-- run moves the pointer to the next rider; the first fresh result while the
-- screens show a pool call returns them to the scoreboard.
--
-- Qualification (a Single round with more than one attempt): one carried peg
-- qualifies the rider, so a carry voids their remaining pending attempts in
-- the same transaction (auto_voided_by = this run) and the pointer skips them,
-- exactly as "Skip run" would. Changing that carry to another result puts them
-- back. The audit row records how many were voided or restored, and which.
create or replace function public.scoring_record_result(
  p_run_id uuid,
  p_result text,
  p_override boolean,
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
  v_live public.scoring_live_state%rowtype;
  v_run public.scoring_runs%rowtype;
  v_previous_result text;
  v_next_run_id uuid;
  v_round_id uuid;
  v_multi_attempt_single boolean;
  v_auto_voided uuid[] := '{}'::uuid[];
  v_auto_restored uuid[] := '{}'::uuid[];
  v_current_order integer;
begin
  if p_result is null or p_result not in ('carry', 'strike', 'miss') then
    raise exception 'Choose Carried, Struck or Miss.' using errcode = '22023';
  end if;

  v_live := public.scoring_lock_live();

  select run.round_id into v_round_id
  from public.scoring_runs as run
  where run.id = p_run_id;

  if v_round_id is null then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  select round.event_type = 'single' and round.attempts_per_rider > 1
  into v_multi_attempt_single
  from public.scoring_rounds as round
  where round.id = v_round_id;

  -- A carry here can change the rider's other runs too, so the whole round is
  -- locked in run_order first (see the locking order at the top).
  if coalesce(v_multi_attempt_single, false) then
    perform 1
    from public.scoring_runs as run
    where run.round_id = v_round_id
    order by run.run_order
    for update;
  end if;

  select * into v_run
  from public.scoring_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  if v_run.status = 'void' then
    raise exception 'This run was skipped. Restore it before recording a result.'
      using errcode = '22023';
  end if;

  -- Two judges cannot both score one run: the second is refused unless they
  -- explicitly chose to change the result.
  if v_run.status = 'scored' and not coalesce(p_override, false) then
    raise exception 'This run already has a result. Use Change result to replace it.'
      using errcode = '22023';
  end if;

  v_previous_result := v_run.result;

  update public.scoring_runs as run
  set
    result = p_result,
    status = 'scored',
    scored_by = p_actor_id,
    scored_at = now()
  where run.id = p_run_id
  returning * into v_run;

  if coalesce(v_multi_attempt_single, false) then
    if p_result = 'carry' then
      -- Only this rider's runs still to be ridden; scored runs are never
      -- touched, and the rider's own on_course run (if the pointer is on a
      -- later attempt) is skipped like any other.
      with voided as (
        update public.scoring_runs as run
        set status = 'void', auto_voided_by = p_run_id
        where run.round_id = v_run.round_id
          and run.entrant_key = v_run.entrant_key
          and run.id <> p_run_id
          and run.status in ('pending', 'on_course')
        returning run.id, run.run_order
      )
      select coalesce(array_agg(voided.id order by voided.run_order), '{}'::uuid[])
      into v_auto_voided
      from voided;
    elsif v_previous_result = 'carry' then
      v_auto_restored := public.scoring_restore_auto_voided(p_run_id);
    end if;
  end if;

  if v_live.current_run_id = p_run_id then
    v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_run.run_order);
  elsif v_live.current_run_id = any (v_auto_voided) then
    -- The rider was already on course for a later attempt: move on past it.
    select run.run_order into v_current_order
    from public.scoring_runs as run
    where run.id = v_live.current_run_id;

    v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_current_order);
  end if;

  if v_previous_result is null
    and v_live.display_mode = 'pool_call'
    and v_live.current_round_id = v_run.round_id then
    update public.scoring_live_state as live
    set display_mode = 'scoreboard'
    where live.id is true;
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
    case when v_previous_result is null then 'record_score' else 'rescore' end,
    'scoring_runs',
    p_run_id::text,
    jsonb_build_object(
      'subject_name', v_run.rider_name,
      'team_name', v_run.team_name,
      'round_id', v_run.round_id,
      'run_order', v_run.run_order,
      'attempt_number', v_run.attempt_number,
      'pool_label', v_run.pool_label,
      'entrant_key', v_run.entrant_key,
      'before', v_previous_result,
      'after', p_result,
      'points', v_run.points,
      'next_run_id', v_next_run_id,
      'auto_voided', cardinality(v_auto_voided),
      'auto_voided_run_ids', to_jsonb(v_auto_voided),
      'auto_restored', cardinality(v_auto_restored),
      'auto_restored_run_ids', to_jsonb(v_auto_restored)
    )
  );

  return to_jsonb(v_run);
end;
$$;

revoke execute on function public.scoring_record_result(uuid, text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_record_result(uuid, text, boolean, uuid, text, text)
  to service_role;

-- "Call Pool B": the call-up that brings a pool to the start. Makes the round
-- live, points the live run at the pool's first rider still to ride, records
-- the pool as called and switches every screen to the pool roster.
create or replace function public.scoring_call_pool(
  p_round_id uuid,
  p_pool_label text,
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
  v_live public.scoring_live_state%rowtype;
  v_before jsonb;
  v_round public.scoring_rounds%rowtype;
  v_first_run public.scoring_runs%rowtype;
begin
  if p_pool_label is null or p_pool_label !~ '^[A-Z]{1,2}$' then
    raise exception 'Choose a pool to call.' using errcode = '22023';
  end if;

  v_live := public.scoring_lock_live();
  v_before := to_jsonb(v_live) - 'id';

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  if not exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.pool_label = p_pool_label
  ) then
    raise exception 'Pool % is not in %.', p_pool_label, v_round.name using errcode = 'P0002';
  end if;

  -- The first rider still to ride. A rider already on course counts, so
  -- pressing "Call Pool B" twice does not skip Pool B's first rider.
  select * into v_first_run
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.pool_label = p_pool_label
    and run.status in ('pending', 'on_course')
  order by run.run_order
  limit 1;

  if not found then
    raise exception 'Every rider in Pool % has already ridden.', p_pool_label
      using errcode = '22023';
  end if;

  -- The rider leaving the course goes back to waiting (possibly in another
  -- round). Scored and void runs are never touched.
  if v_live.current_run_id is not null and v_live.current_run_id <> v_first_run.id then
    update public.scoring_runs as run
    set status = 'pending'
    where run.id = v_live.current_run_id
      and run.status = 'on_course';
  end if;

  update public.scoring_runs as run
  set status = 'pending'
  where run.round_id = p_round_id
    and run.status = 'on_course'
    and run.id <> v_first_run.id;

  update public.scoring_runs as run
  set status = 'on_course'
  where run.id = v_first_run.id
    and run.status = 'pending';

  if v_round.status = 'upcoming' then
    update public.scoring_rounds as round
    set status = 'live'
    where round.id = p_round_id;
  end if;

  update public.scoring_live_state as live
  set
    current_round_id = p_round_id,
    current_run_id = v_first_run.id,
    called_pool_label = p_pool_label,
    display_mode = 'pool_call'
  where live.id is true
  returning * into v_live;

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
    'call_pool',
    'scoring_live_state',
    'live',
    jsonb_build_object(
      'subject_name', 'Pool ' || p_pool_label,
      'round_id', p_round_id,
      'round_name', v_round.name,
      'pool_label', p_pool_label,
      'first_run_id', v_first_run.id,
      'first_rider', v_first_run.rider_name,
      'before', v_before,
      'after', to_jsonb(v_live) - 'id'
    )
  );

  return to_jsonb(v_live) - 'id';
end;
$$;

revoke execute on function public.scoring_call_pool(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_call_pool(uuid, text, uuid, text, text)
  to service_role;

-- Removes a recorded result. Without p_make_current the run goes back to
-- on_course when it is still the current run, otherwise to pending.
--
-- p_make_current is the judge's "Undo last result": scoring a rider moved the
-- pointer on to the next one, and that pointer must not stay there while this
-- rider's result is gone. In the same transaction the run's round becomes the
-- live round, the run becomes the current run (on_course), and any other
-- on_course run in that round — or the previous current run elsewhere — goes
-- back to pending. Scored and void runs are never touched.
--
-- p_make_current has no SQL default: Postgres does not allow a defaulted
-- parameter before the actor parameters, which stay last like every other
-- scoring function. POST /api/judge/clear always sends it (false unless the
-- panel asked).
--
-- The first draft of this function had no p_make_current; drop that signature
-- so a database that saw the draft does not keep a second, stale overload.
drop function if exists public.scoring_clear_result(uuid, uuid, text, text);

create or replace function public.scoring_clear_result(
  p_run_id uuid,
  p_make_current boolean,
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
  v_live public.scoring_live_state%rowtype;
  v_run public.scoring_runs%rowtype;
  v_round_id uuid;
  v_previous_result text;
  v_make_current boolean := coalesce(p_make_current, false);
  v_multi_attempt_single boolean;
  v_auto_restored uuid[] := '{}'::uuid[];
begin
  v_live := public.scoring_lock_live();

  select run.round_id into v_round_id
  from public.scoring_runs as run
  where run.id = p_run_id;

  if v_round_id is null then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  select round.event_type = 'single' and round.attempts_per_rider > 1
  into v_multi_attempt_single
  from public.scoring_rounds as round
  where round.id = v_round_id;

  -- Making the run current, or undoing a carry that voided the rider's other
  -- attempts, changes other runs of the round too, so the whole round is
  -- locked in run_order first (see the locking order at the top).
  if v_make_current or coalesce(v_multi_attempt_single, false) then
    perform 1
    from public.scoring_runs as run
    where run.round_id = v_round_id
    order by run.run_order
    for update;
  end if;

  select * into v_run
  from public.scoring_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  if v_run.status <> 'scored' then
    raise exception 'This run has no result to clear.' using errcode = '22023';
  end if;

  v_previous_result := v_run.result;

  update public.scoring_runs as run
  set
    result = null,
    status = case
      when v_make_current or v_live.current_run_id = p_run_id then 'on_course'
      else 'pending'
    end,
    scored_by = null,
    scored_at = null
  where run.id = p_run_id
  returning * into v_run;

  -- Undoing a qualifying carry: the attempts it made unnecessary are needed
  -- again.
  if coalesce(v_multi_attempt_single, false) and v_previous_result = 'carry' then
    v_auto_restored := public.scoring_restore_auto_voided(p_run_id);
  end if;

  if v_make_current then
    -- The rider the pointer had moved on to goes back to waiting.
    if v_live.current_run_id is not null and v_live.current_run_id <> p_run_id then
      update public.scoring_runs as run
      set status = 'pending'
      where run.id = v_live.current_run_id
        and run.status = 'on_course';
    end if;

    update public.scoring_runs as run
    set status = 'pending'
    where run.round_id = v_run.round_id
      and run.status = 'on_course'
      and run.id <> p_run_id;

    update public.scoring_live_state as live
    set
      current_round_id = v_run.round_id,
      current_run_id = p_run_id,
      called_pool_label = case
        when live.current_round_id is distinct from v_run.round_id then v_run.pool_label
        when v_run.pool_label is not null
          and (
            live.called_pool_label is null
            or public.scoring_pool_index(live.called_pool_label)
               < public.scoring_pool_index(v_run.pool_label)
          )
          then v_run.pool_label
        else live.called_pool_label
      end
    where live.id is true;
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
    'clear_score',
    'scoring_runs',
    p_run_id::text,
    jsonb_build_object(
      'subject_name', v_run.rider_name,
      'team_name', v_run.team_name,
      'round_id', v_run.round_id,
      'run_order', v_run.run_order,
      'attempt_number', v_run.attempt_number,
      'entrant_key', v_run.entrant_key,
      'before', v_previous_result,
      'after', null,
      'make_current', v_make_current,
      'replaced_current_run_id', case
        when v_make_current and v_live.current_run_id is distinct from p_run_id
          then v_live.current_run_id
        else null
      end,
      'auto_restored', cardinality(v_auto_restored),
      'auto_restored_run_ids', to_jsonb(v_auto_restored)
    )
  );

  return to_jsonb(v_run);
end;
$$;

revoke execute on function public.scoring_clear_result(uuid, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_clear_result(uuid, boolean, uuid, text, text)
  to service_role;

-- "Skip run" (void) and "Restore" (back to pending). A scored run must be
-- cleared first. Skipping the current run moves the pointer on, as scoring it
-- would.
create or replace function public.scoring_set_run_status(
  p_run_id uuid,
  p_status text,
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
  v_live public.scoring_live_state%rowtype;
  v_run public.scoring_runs%rowtype;
  v_previous_status text;
  v_next_run_id uuid;
begin
  if p_status is null or p_status not in ('pending', 'void') then
    raise exception 'A run can only be skipped or restored.' using errcode = '22023';
  end if;

  v_live := public.scoring_lock_live();

  select * into v_run
  from public.scoring_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  if v_run.status = 'scored' then
    raise exception 'This run has a result. Clear the result first.' using errcode = '22023';
  end if;

  v_previous_status := v_run.status;

  if p_status = 'void' then
    if v_run.status = 'void' then
      raise exception 'This run is already skipped.' using errcode = '22023';
    end if;

    update public.scoring_runs as run
    set status = 'void'
    where run.id = p_run_id
    returning * into v_run;

    if v_live.current_run_id = p_run_id then
      v_next_run_id := public.scoring_advance_live_pointer(v_run.round_id, v_run.run_order);
    end if;
  else
    if v_run.status <> 'void' then
      raise exception 'Only a skipped run can be restored.' using errcode = '22023';
    end if;

    -- Restoring by hand also undoes an automatic skip after a carry; the run
    -- is then the administrator's to ride.
    update public.scoring_runs as run
    set status = 'pending', auto_voided_by = null
    where run.id = p_run_id
    returning * into v_run;
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
    case when p_status = 'void' then 'void_run' else 'restore_run' end,
    'scoring_runs',
    p_run_id::text,
    jsonb_build_object(
      'subject_name', v_run.rider_name,
      'team_name', v_run.team_name,
      'round_id', v_run.round_id,
      'run_order', v_run.run_order,
      'attempt_number', v_run.attempt_number,
      'entrant_key', v_run.entrant_key,
      'before', v_previous_status,
      'after', v_run.status,
      'next_run_id', v_next_run_id
    )
  );

  return to_jsonb(v_run);
end;
$$;

revoke execute on function public.scoring_set_run_status(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_run_status(uuid, text, uuid, text, text)
  to service_role;

-- Partial update of the live state. Keys present in p_payload are applied:
-- current_round_id, current_run_id, called_pool_label, display_mode, message.
--
--   * A run must belong to the (new) current round, and must still be to
--     ride (not scored, not skipped). Setting it marks it on_course and puts
--     any other on_course run of that round back to pending; scored and void
--     runs are never touched.
--   * Switching to another round without naming a run leaves no current run.
--     Naming the round that is already live keeps the current run.
--   * The called pool follows the run when the riding has moved past it, and
--     resets to the new run's pool when the round changes, unless the payload
--     sets it.
--   * A round that becomes live while still "upcoming" is marked live.
create or replace function public.scoring_set_live(
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
  v_live public.scoring_live_state%rowtype;
  v_before jsonb;
  v_round public.scoring_rounds%rowtype;
  v_run public.scoring_runs%rowtype;
  v_round_id uuid;
  v_run_id uuid;
  v_round_changed boolean;
  v_called text;
  v_mode text;
  v_message text;
  v_round_promoted boolean := false;
begin
  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ?| array['current_round_id', 'current_run_id', 'called_pool_label', 'display_mode', 'message']) then
    raise exception 'Nothing to change.' using errcode = '22023';
  end if;

  v_live := public.scoring_lock_live();
  v_before := to_jsonb(v_live) - 'id';

  -- Round.
  if p_payload ? 'current_round_id' then
    v_round_id := public.scoring_json_uuid(p_payload -> 'current_round_id', 'Round');
  else
    v_round_id := v_live.current_round_id;
  end if;

  v_round_changed := v_round_id is distinct from v_live.current_round_id;

  if v_round_id is not null then
    select * into v_round
    from public.scoring_rounds as round
    where round.id = v_round_id
    for update;

    if not found then
      raise exception 'That round no longer exists.' using errcode = 'P0002';
    end if;

    perform 1
    from public.scoring_runs as run
    where run.round_id = v_round_id
    order by run.run_order
    for update;
  end if;

  -- Run.
  if p_payload ? 'current_run_id' then
    v_run_id := public.scoring_json_uuid(p_payload -> 'current_run_id', 'Run');
  elsif v_round_changed then
    v_run_id := null;
  else
    v_run_id := v_live.current_run_id;
  end if;

  if v_run_id is not null then
    if v_round_id is null then
      raise exception 'Choose a round before choosing a rider.' using errcode = '22023';
    end if;

    select * into v_run
    from public.scoring_runs as run
    where run.id = v_run_id;

    if not found then
      raise exception 'That run is no longer in the start list. Refresh and try again.'
        using errcode = 'P0002';
    end if;

    if v_run.round_id <> v_round_id then
      raise exception 'That rider is not in the live round.' using errcode = '22023';
    end if;

    if v_run.status = 'scored' then
      raise exception 'That run already has a result. Clear it before making it current.'
        using errcode = '22023';
    end if;

    if v_run.status = 'void' then
      raise exception 'That run was skipped. Restore it before making it current.'
        using errcode = '22023';
    end if;
  end if;

  -- Called pool.
  if p_payload ? 'called_pool_label' then
    if jsonb_typeof(p_payload -> 'called_pool_label') = 'null' then
      v_called := null;
    elsif jsonb_typeof(p_payload -> 'called_pool_label') <> 'string'
      or (p_payload ->> 'called_pool_label') !~ '^[A-Z]{1,2}$' then
      raise exception 'Choose a pool by its letter.' using errcode = '22023';
    else
      v_called := p_payload ->> 'called_pool_label';

      if v_round_id is null or not exists (
        select 1
        from public.scoring_runs as run
        where run.round_id = v_round_id
          and run.pool_label = v_called
      ) then
        raise exception 'Pool % is not in the live round.', v_called using errcode = '22023';
      end if;
    end if;
  elsif v_round_changed then
    v_called := v_run.pool_label;
  else
    v_called := v_live.called_pool_label;

    if v_run.pool_label is not null
      and (
        v_called is null
        or public.scoring_pool_index(v_called) < public.scoring_pool_index(v_run.pool_label)
      ) then
      v_called := v_run.pool_label;
    end if;
  end if;

  -- Display mode.
  if p_payload ? 'display_mode' then
    v_mode := p_payload ->> 'display_mode';

    if v_mode is null
      or v_mode not in ('scoreboard', 'leaderboard', 'rider', 'pool_call', 'message', 'blank') then
      raise exception 'Unknown display mode.' using errcode = '22023';
    end if;

    if v_mode = 'pool_call' and v_called is null then
      raise exception 'Call a pool before showing the pool call screen.' using errcode = '22023';
    end if;
  else
    v_mode := v_live.display_mode;

    -- A pool call screen with no pool left to show (the round was cleared or
    -- switched) falls back to the scoreboard rather than failing.
    if v_mode = 'pool_call' and v_called is null then
      v_mode := 'scoreboard';
    end if;
  end if;

  -- Message.
  if p_payload ? 'message' then
    if jsonb_typeof(p_payload -> 'message') = 'null' then
      v_message := null;
    elsif jsonb_typeof(p_payload -> 'message') <> 'string' then
      raise exception 'The message must be text.' using errcode = '22023';
    else
      v_message := nullif(btrim(p_payload ->> 'message'), '');

      if char_length(v_message) > 200 then
        raise exception 'Keep the message to 200 characters.' using errcode = '22023';
      end if;
    end if;
  else
    v_message := v_live.message;
  end if;

  -- The rider leaving the course goes back to waiting.
  if v_live.current_run_id is not null
    and v_live.current_run_id is distinct from v_run_id then
    update public.scoring_runs as run
    set status = 'pending'
    where run.id = v_live.current_run_id
      and run.status = 'on_course';
  end if;

  if v_round_id is not null then
    update public.scoring_runs as run
    set status = 'pending'
    where run.round_id = v_round_id
      and run.status = 'on_course'
      and (v_run_id is null or run.id <> v_run_id);
  end if;

  if v_run_id is not null then
    update public.scoring_runs as run
    set status = 'on_course'
    where run.id = v_run_id
      and run.status = 'pending';
  end if;

  if v_round_changed and v_round_id is not null and v_round.status = 'upcoming' then
    update public.scoring_rounds as round
    set status = 'live'
    where round.id = v_round_id;

    v_round_promoted := true;
  end if;

  update public.scoring_live_state as live
  set
    current_round_id = v_round_id,
    current_run_id = v_run_id,
    called_pool_label = v_called,
    display_mode = v_mode,
    message = v_message
  where live.id is true
  returning * into v_live;

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
    'set_live',
    'scoring_live_state',
    'live',
    jsonb_build_object(
      'subject_name', coalesce(v_run.rider_name, v_round.name, 'Live display'),
      'round_name', v_round.name,
      'round_marked_live', v_round_promoted,
      'before', v_before,
      'after', to_jsonb(v_live) - 'id'
    )
  );

  return to_jsonb(v_live) - 'id';
end;
$$;

revoke execute on function public.scoring_set_live(jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_live(jsonb, uuid, text, text)
  to service_role;

-- 8. Administrator functions --------------------------------------------------------

-- Create (p_round_id null) or edit a round. On edit only the keys present are
-- changed. event_type, attempts_per_rider and pool_size are frozen once the
-- round has a start list, because every run was laid out from them. A podium
-- is rebuilt from the round's own runs: places 1-3, each once, each entrant
-- once, and the name taken from the start list rather than from the browser.
create or replace function public.scoring_upsert_round(
  p_round_id uuid,
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
  v_existing public.scoring_rounds%rowtype;
  v_saved public.scoring_rounds%rowtype;
  v_before jsonb;
  v_run_count integer := 0;
  v_event_type text;
  v_name text;
  v_round_number integer;
  v_attempts integer;
  v_target integer;
  v_sort_order integer;
  v_pool_size integer;
  v_status text;
  v_podium jsonb;
  v_entry jsonb;
  v_place integer;
  v_places integer[] := '{}';
  v_keys text[] := '{}';
  v_entrant_key text;
  v_entrant_name text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'The round details are missing.' using errcode = '22023';
  end if;

  if p_round_id is not null then
    select * into v_existing
    from public.scoring_rounds as round
    where round.id = p_round_id
    for update;

    if not found then
      raise exception 'That round no longer exists.' using errcode = 'P0002';
    end if;

    v_before := to_jsonb(v_existing);

    select count(*)::integer
    into v_run_count
    from public.scoring_runs as run
    where run.round_id = p_round_id;
  end if;

  -- A key in the payload is applied; a missing key keeps the stored value
  -- (or the default, for a new round).
  v_event_type := case
    when p_payload ? 'event_type' then p_payload ->> 'event_type'
    else v_existing.event_type
  end;

  if v_event_type is null or v_event_type not in ('single', 'section') then
    raise exception 'Choose Single or Section for the event.' using errcode = '22023';
  end if;

  if p_payload ? 'name' then
    if jsonb_typeof(p_payload -> 'name') <> 'string' then
      raise exception 'Give the round a name of up to 80 characters.' using errcode = '22023';
    end if;

    v_name := btrim(p_payload ->> 'name');
  else
    v_name := v_existing.name;
  end if;

  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'Give the round a name of up to 80 characters.' using errcode = '22023';
  end if;

  v_round_number := case
    when p_payload ? 'round_number'
      then public.scoring_json_int(p_payload -> 'round_number', 'Round number', 0, 50)
    else v_existing.round_number
  end;

  if v_round_number is null then
    raise exception 'Give the round a number from 0 to 50.' using errcode = '22023';
  end if;

  v_attempts := case
    when p_payload ? 'attempts_per_rider'
      then public.scoring_json_int(p_payload -> 'attempts_per_rider', 'Attempts per rider', 1, 3)
    else coalesce(v_existing.attempts_per_rider, 1)
  end;

  if v_attempts is null then
    raise exception 'Attempts per rider must be 1, 2 or 3.' using errcode = '22023';
  end if;

  v_target := case
    when p_payload ? 'target_points'
      then public.scoring_json_int(p_payload -> 'target_points', 'Target points', 1, 16)
    else v_existing.target_points
  end;

  v_sort_order := case
    when p_payload ? 'sort_order'
      then public.scoring_json_int(p_payload -> 'sort_order', 'Sort order', 0, 10000)
    else v_existing.sort_order
  end;

  if v_sort_order is null then
    raise exception 'Give the round a sort order from 0 to 10000.' using errcode = '22023';
  end if;

  v_pool_size := case
    when p_payload ? 'pool_size'
      then public.scoring_json_int(p_payload -> 'pool_size', 'Pool size', 2, 100)
    else v_existing.pool_size
  end;

  v_status := case
    when p_payload ? 'status' then p_payload ->> 'status'
    else coalesce(v_existing.status, 'upcoming')
  end;

  if v_status is null or v_status not in ('upcoming', 'live', 'complete') then
    raise exception 'Status must be upcoming, live or complete.' using errcode = '22023';
  end if;

  if v_run_count > 0 and (
    v_event_type is distinct from v_existing.event_type
    or v_attempts is distinct from v_existing.attempts_per_rider
    or v_pool_size is distinct from v_existing.pool_size
  ) then
    raise exception 'This round already has a start list. Clear it before changing the event, attempts per rider or pool size.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.scoring_rounds as other
    where other.event_type = v_event_type
      and other.round_number = v_round_number
      and other.id is distinct from p_round_id
  ) then
    raise exception 'There is already a % round %.', initcap(v_event_type), v_round_number
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.scoring_rounds as other
    where other.sort_order = v_sort_order
      and other.id is distinct from p_round_id
  ) then
    raise exception 'Another round already uses sort order %.', v_sort_order
      using errcode = '22023';
  end if;

  if p_payload ? 'podium' then
    if jsonb_typeof(p_payload -> 'podium') = 'null' then
      v_podium := null;
    elsif jsonb_typeof(p_payload -> 'podium') <> 'array' then
      raise exception 'The podium must be a list of places.' using errcode = '22023';
    elsif jsonb_array_length(p_payload -> 'podium') = 0 then
      v_podium := null;
    elsif jsonb_array_length(p_payload -> 'podium') > 3 then
      raise exception 'A podium has at most three places.' using errcode = '22023';
    else
      v_podium := '[]'::jsonb;

      for v_entry in
        select element.value
        from jsonb_array_elements(p_payload -> 'podium') as element
      loop
        if jsonb_typeof(v_entry) <> 'object' then
          raise exception 'Each podium place needs a place and an entrant.' using errcode = '22023';
        end if;

        v_place := public.scoring_json_int(v_entry -> 'place', 'Podium place', 1, 3);

        if v_place is null then
          raise exception 'Each podium place needs a place from 1 to 3.' using errcode = '22023';
        end if;

        if v_place = any (v_places) then
          raise exception 'Each podium place can only be given once.' using errcode = '22023';
        end if;

        v_places := v_places || v_place;

        if jsonb_typeof(v_entry -> 'entrant_key') is distinct from 'string' then
          raise exception 'Each podium place needs an entrant.' using errcode = '22023';
        end if;

        v_entrant_key := v_entry ->> 'entrant_key';

        if v_entrant_key = any (v_keys) then
          raise exception 'An entrant can only hold one podium place.' using errcode = '22023';
        end if;

        v_keys := v_keys || v_entrant_key;
        v_entrant_name := public.scoring_entrant_name(p_round_id, v_entrant_key);

        if v_entrant_name is null then
          raise exception 'That podium entrant did not ride in this round.' using errcode = '22023';
        end if;

        v_podium := v_podium || jsonb_build_array(
          jsonb_build_object(
            'place', v_place,
            'entrant_key', v_entrant_key,
            'name', v_entrant_name
          )
        );
      end loop;

      select jsonb_agg(element.value order by (element.value ->> 'place')::integer)
      into v_podium
      from jsonb_array_elements(v_podium) as element;
    end if;
  else
    v_podium := v_existing.podium;
  end if;

  if p_round_id is null then
    insert into public.scoring_rounds (
      event_type,
      name,
      round_number,
      attempts_per_rider,
      target_points,
      status,
      sort_order,
      pool_size,
      podium
    ) values (
      v_event_type,
      v_name,
      v_round_number,
      v_attempts,
      v_target,
      v_status,
      v_sort_order,
      v_pool_size,
      v_podium
    )
    returning * into v_saved;
  else
    update public.scoring_rounds as round
    set
      event_type = v_event_type,
      name = v_name,
      round_number = v_round_number,
      attempts_per_rider = v_attempts,
      target_points = v_target,
      status = v_status,
      sort_order = v_sort_order,
      pool_size = v_pool_size,
      podium = v_podium
    where round.id = p_round_id
    returning * into v_saved;
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
    case when p_round_id is null then 'create_round' else 'edit_round' end,
    'scoring_rounds',
    v_saved.id::text,
    jsonb_build_object('subject_name', v_saved.name)
      || public.admin_audit_diff(
        v_before,
        to_jsonb(v_saved),
        array[
          'event_type',
          'name',
          'round_number',
          'attempts_per_rider',
          'target_points',
          'status',
          'sort_order',
          'pool_size',
          'podium'
        ]::text[]
      )
  );

  return to_jsonb(v_saved);
end;
$$;

revoke execute on function public.scoring_upsert_round(uuid, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_upsert_round(uuid, jsonb, uuid, text, text)
  to service_role;

-- Delete a round and (by cascade) its runs and overrides. Refused while any
-- result is recorded, unless p_force. Clears the live pointer if it pointed
-- here.
create or replace function public.scoring_delete_round(
  p_round_id uuid,
  p_force boolean,
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
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_total integer;
  v_scored integer;
begin
  v_live := public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    (count(*) filter (where run.status = 'scored'))::integer
  into v_total, v_scored
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  if v_scored > 0 and not coalesce(p_force, false) then
    raise exception '% has % recorded results. Deleting it removes them too; confirm the forced delete to go ahead.',
      v_round.name, v_scored
      using errcode = '22023';
  end if;

  if v_live.current_round_id = p_round_id then
    update public.scoring_live_state as live
    set
      current_round_id = null,
      current_run_id = null,
      called_pool_label = null,
      display_mode = case when live.display_mode = 'pool_call' then 'scoreboard' else live.display_mode end
    where live.id is true;
  end if;

  delete from public.scoring_rounds as round
  where round.id = p_round_id;

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
    'delete_round',
    'scoring_rounds',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_round.name,
      'event_type', v_round.event_type,
      'round_number', v_round.round_number,
      'runs', v_total,
      'results', v_scored,
      'forced', coalesce(p_force, false)
    )
  );

  return jsonb_build_object('runs_deleted', v_total, 'results_deleted', v_scored);
end;
$$;

revoke execute on function public.scoring_delete_round(uuid, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_delete_round(uuid, boolean, uuid, text, text)
  to service_role;

-- Draw a round's start list.
--
--   all_checked_in  Single: every solo registration that has checked in.
--                   Section: every team of exactly four riders, all four
--                   checked in.
--   advanced        The entrants marked advanced (rule or override) in the
--                   previous round of the same event type — the one with the
--                   highest sort_order below this round's.
--
-- Entrants are shuffled with random() and split into pools exactly as
-- balancedPoolSizes() in src/lib/scoring/types.ts does: ceil(n / pool_size)
-- pools, sizes differing by at most one, the larger pools first, labelled A,
-- B, ... (a null pool_size is one unlabelled pool). Runs are laid out pool by
-- pool; within a pool, attempt 1 for every entrant, then attempt 2, then 3;
-- a Section team's four riders ride consecutively, leader first then in the
-- order they were registered. run_order runs 1..n without gaps.
--
-- Refused once any result is recorded in the round: clear results first.
create or replace function public.scoring_build_start_list(
  p_round_id uuid,
  p_mode text,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_previous public.scoring_rounds%rowtype;
  v_entrant_ids uuid[];
  v_entrant_count integer;
  v_pool_count integer;
  v_base_size integer;
  v_remainder integer;
  v_pool_index integer;
  v_pool_size integer;
  v_pool_start integer := 1;
  v_label text;
  v_attempt integer;
  v_position integer;
  v_run_order integer := 0;
  v_runs_replaced integer := 0;
  v_pools jsonb := '{}'::jsonb;
  v_solo record;
  v_member record;
begin
  if p_mode is null or p_mode not in ('all_checked_in', 'advanced') then
    raise exception 'Choose who to draw: every checked-in entrant, or those who advanced.'
      using errcode = '22023';
  end if;

  v_live := public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  if exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.status = 'scored'
  ) then
    raise exception 'This round already has results. Clear results before redrawing.'
      using errcode = '22023';
  end if;

  if p_mode = 'advanced' then
    select * into v_previous
    from public.scoring_rounds as earlier
    where earlier.event_type = v_round.event_type
      and earlier.sort_order < v_round.sort_order
    order by earlier.sort_order desc
    limit 1;

    if not found then
      raise exception 'There is no earlier % round to take qualifiers from.', initcap(v_round.event_type)
        using errcode = '22023';
    end if;
  end if;

  -- Collect the entrants, already shuffled.
  if v_round.event_type = 'single' then
    if p_mode = 'all_checked_in' then
      select coalesce(array_agg(registration.id order by random()), '{}'::uuid[])
      into v_entrant_ids
      from public.solo_registrations as registration
      where registration.checked_in_at is not null;
    else
      select coalesce(array_agg(registration.id order by random()), '{}'::uuid[])
      into v_entrant_ids
      from public.solo_registrations as registration
      where ('solo:' || registration.id::text) in (
        select board.entrant_key
        from public.scoring_leaderboard as board
        where board.round_id = v_previous.id
          and board.advanced is true
      );
    end if;
  else
    if p_mode = 'all_checked_in' then
      select coalesce(array_agg(team.id order by random()), '{}'::uuid[])
      into v_entrant_ids
      from public.teams as team
      where (
          select count(*)
          from public.team_members as member
          where member.team_id = team.id
        ) = 4
        and not exists (
          select 1
          from public.team_members as member
          where member.team_id = team.id
            and member.checked_in_at is null
        );
    else
      select coalesce(array_agg(team.id order by random()), '{}'::uuid[])
      into v_entrant_ids
      from public.teams as team
      where ('team:' || team.id::text) in (
          select board.entrant_key
          from public.scoring_leaderboard as board
          where board.round_id = v_previous.id
            and board.advanced is true
        )
        and exists (
          select 1
          from public.team_members as member
          where member.team_id = team.id
        );
    end if;
  end if;

  v_entrant_count := coalesce(array_length(v_entrant_ids, 1), 0);

  if v_entrant_count = 0 then
    if p_mode = 'advanced' then
      raise exception 'Nobody is marked as advanced from %.', v_previous.name using errcode = '22023';
    elsif v_round.event_type = 'single' then
      raise exception 'No solo riders have checked in yet.' using errcode = '22023';
    else
      raise exception 'No team has all four riders checked in yet.' using errcode = '22023';
    end if;
  end if;

  -- The live pointer must not point into a start list that is being replaced.
  if v_live.current_round_id = p_round_id then
    update public.scoring_live_state as live
    set
      current_run_id = null,
      called_pool_label = null,
      display_mode = case when live.display_mode = 'pool_call' then 'scoreboard' else live.display_mode end
    where live.id is true;
  end if;

  delete from public.scoring_runs as run
  where run.round_id = p_round_id;

  get diagnostics v_runs_replaced = row_count;

  -- balancedPoolSizes(): ceil(n / pool_size) pools; the first n % pools of
  -- them take one extra entrant.
  if v_round.pool_size is null then
    v_pool_count := 1;
  else
    v_pool_count := ceil(v_entrant_count::numeric / v_round.pool_size)::integer;
  end if;

  v_base_size := v_entrant_count / v_pool_count;
  v_remainder := v_entrant_count % v_pool_count;

  for v_pool_index in 0 .. v_pool_count - 1 loop
    v_pool_size := v_base_size + case when v_pool_index < v_remainder then 1 else 0 end;
    v_label := case
      when v_round.pool_size is null then null
      else public.scoring_pool_label(v_pool_index)
    end;

    if v_label is not null then
      v_pools := v_pools || jsonb_build_object(v_label, v_pool_size);
    end if;

    for v_attempt in 1 .. v_round.attempts_per_rider loop
      for v_position in v_pool_start .. v_pool_start + v_pool_size - 1 loop
        if v_round.event_type = 'single' then
          select registration.id, registration.full_name, registration.horse_name, registration.location
          into v_solo
          from public.solo_registrations as registration
          where registration.id = v_entrant_ids[v_position];

          -- A registration deleted since it was collected is skipped, so
          -- run_order stays contiguous.
          if found then
            v_run_order := v_run_order + 1;

            insert into public.scoring_runs (
              round_id,
              run_order,
              attempt_number,
              pool_label,
              solo_registration_id,
              entrant_key,
              rider_name,
              horse_name,
              team_name,
              rider_location
            ) values (
              p_round_id,
              v_run_order,
              v_attempt,
              v_label,
              v_solo.id,
              'solo:' || v_solo.id::text,
              btrim(v_solo.full_name),
              nullif(btrim(v_solo.horse_name), ''),
              null,
              nullif(btrim(v_solo.location), '')
            );
          end if;
        else
          for v_member in
            select
              member.id,
              member.team_id,
              member.full_name,
              member.horse_name,
              member.location,
              team.team_name
            from public.team_members as member
            join public.teams as team on team.id = member.team_id
            where member.team_id = v_entrant_ids[v_position]
            order by member.is_leader desc nulls last, member.created_at asc, member.id asc
          loop
            v_run_order := v_run_order + 1;

            insert into public.scoring_runs (
              round_id,
              run_order,
              attempt_number,
              pool_label,
              team_member_id,
              team_id,
              entrant_key,
              rider_name,
              horse_name,
              team_name,
              rider_location
            ) values (
              p_round_id,
              v_run_order,
              v_attempt,
              v_label,
              v_member.id,
              v_member.team_id,
              'team:' || v_member.team_id::text,
              btrim(v_member.full_name),
              nullif(btrim(v_member.horse_name), ''),
              nullif(btrim(v_member.team_name), ''),
              nullif(btrim(v_member.location), '')
            );
          end loop;
        end if;
      end loop;
    end loop;

    v_pool_start := v_pool_start + v_pool_size;
  end loop;

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
    'build_start_list',
    'scoring_runs',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_round.name,
      'mode', p_mode,
      'previous_round_id', v_previous.id,
      'entrants', v_entrant_count,
      'pools', v_pools,
      'runs', v_run_order,
      'runs_replaced', v_runs_replaced
    )
  );

  return v_run_order;
end;
$$;

revoke execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_build_start_list(uuid, text, uuid, text, text)
  to service_role;

-- Delete a round's whole start list. Refused while any result is recorded,
-- unless p_force.
create or replace function public.scoring_clear_start_list(
  p_round_id uuid,
  p_force boolean,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_scored integer;
  v_deleted integer := 0;
begin
  v_live := public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  select (count(*) filter (where run.status = 'scored'))::integer
  into v_scored
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  if v_scored > 0 and not coalesce(p_force, false) then
    raise exception 'This start list has % recorded results. Clearing it removes them too; confirm the forced clear to go ahead.',
      v_scored
      using errcode = '22023';
  end if;

  if v_live.current_round_id = p_round_id then
    update public.scoring_live_state as live
    set
      current_run_id = null,
      called_pool_label = null,
      display_mode = case when live.display_mode = 'pool_call' then 'scoreboard' else live.display_mode end
    where live.id is true;
  end if;

  delete from public.scoring_runs as run
  where run.round_id = p_round_id;

  get diagnostics v_deleted = row_count;

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
    'clear_start_list',
    'scoring_runs',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_round.name,
      'runs_deleted', v_deleted,
      'results_deleted', v_scored,
      'forced', coalesce(p_force, false)
    )
  );

  return v_deleted;
end;
$$;

revoke execute on function public.scoring_clear_start_list(uuid, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_clear_start_list(uuid, boolean, uuid, text, text)
  to service_role;

-- Late entrant after a draw. Exactly one of the two ids. The entrant joins the
-- pool with the fewest entrants (ties: the earliest letter); an unpooled round
-- stays unpooled. Their runs go at the end of that pool's passes, and the
-- round is renumbered so run_order stays contiguous. Check-in is not required:
-- the administrator is overriding, and the audit row records whether the
-- entrant had checked in.
create or replace function public.scoring_add_entrant(
  p_round_id uuid,
  p_solo_registration_id uuid,
  p_team_id uuid,
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
  v_round public.scoring_rounds%rowtype;
  v_entrant_key text;
  v_entrant_name text;
  v_checked_in boolean;
  v_pool text;
  v_run_order integer;
  v_attempt integer;
  v_added integer := 0;
  v_rider_count integer;
  v_solo record;
  v_team record;
  v_member record;
  v_runs jsonb;
begin
  if num_nonnulls(p_solo_registration_id, p_team_id) <> 1 then
    raise exception 'Choose one rider or one team to add.' using errcode = '22023';
  end if;

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  if p_solo_registration_id is not null and v_round.event_type <> 'single' then
    raise exception 'This is a Section round. Add a team instead.' using errcode = '22023';
  end if;

  if p_team_id is not null and v_round.event_type <> 'section' then
    raise exception 'This is a Single round. Add a solo rider instead.' using errcode = '22023';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  if p_solo_registration_id is not null then
    select registration.id, registration.full_name, registration.checked_in_at
    into v_solo
    from public.solo_registrations as registration
    where registration.id = p_solo_registration_id;

    if not found then
      raise exception 'That rider is no longer registered.' using errcode = 'P0002';
    end if;

    v_entrant_key := 'solo:' || v_solo.id::text;
    v_entrant_name := v_solo.full_name;
    v_checked_in := v_solo.checked_in_at is not null;
  else
    select team.id, team.team_name
    into v_team
    from public.teams as team
    where team.id = p_team_id;

    if not found then
      raise exception 'That team is no longer registered.' using errcode = 'P0002';
    end if;

    v_entrant_key := 'team:' || p_team_id::text;
    v_entrant_name := v_team.team_name;

    select
      count(*)::integer,
      coalesce(bool_and(member.checked_in_at is not null), false)
    into v_rider_count, v_checked_in
    from public.team_members as member
    where member.team_id = p_team_id;

    if v_rider_count = 0 then
      raise exception '% has no riders.', v_entrant_name using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.entrant_key = v_entrant_key
  ) then
    raise exception '% is already in this round.', v_entrant_name using errcode = '22023';
  end if;

  if v_round.pool_size is not null then
    select run.pool_label
    into v_pool
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.pool_label is not null
    group by run.pool_label
    order by count(distinct run.entrant_key) asc, public.scoring_pool_index(run.pool_label) asc
    limit 1;

    -- A pooled round with no start list yet: the first pool.
    v_pool := coalesce(v_pool, 'A');
  else
    v_pool := null;
  end if;

  -- Temporary positions after everything else; the renumber below moves each
  -- attempt to the end of its own pass within the pool.
  select coalesce(max(run.run_order), 0)
  into v_run_order
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  for v_attempt in 1 .. v_round.attempts_per_rider loop
    if p_solo_registration_id is not null then
      v_run_order := v_run_order + 1;
      v_added := v_added + 1;

      insert into public.scoring_runs (
        round_id,
        run_order,
        attempt_number,
        pool_label,
        solo_registration_id,
        entrant_key,
        rider_name
      )
      select
        p_round_id,
        v_run_order,
        v_attempt,
        v_pool,
        registration.id,
        v_entrant_key,
        btrim(registration.full_name)
      from public.solo_registrations as registration
      where registration.id = p_solo_registration_id;
    else
      for v_member in
        select member.id, member.full_name
        from public.team_members as member
        where member.team_id = p_team_id
        order by member.is_leader desc nulls last, member.created_at asc, member.id asc
      loop
        v_run_order := v_run_order + 1;
        v_added := v_added + 1;

        insert into public.scoring_runs (
          round_id,
          run_order,
          attempt_number,
          pool_label,
          team_member_id,
          team_id,
          entrant_key,
          rider_name
        ) values (
          p_round_id,
          v_run_order,
          v_attempt,
          v_pool,
          v_member.id,
          p_team_id,
          v_entrant_key,
          btrim(v_member.full_name)
        );
      end loop;
    end if;
  end loop;

  perform public.scoring_renumber_round(p_round_id);

  select coalesce(jsonb_agg(to_jsonb(run.*) order by run.run_order), '[]'::jsonb)
  into v_runs
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.entrant_key = v_entrant_key;

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
    'add_entrant',
    'scoring_runs',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_entrant_name,
      'round_name', v_round.name,
      'entrant_key', v_entrant_key,
      'pool_label', v_pool,
      'runs', v_added,
      'checked_in', v_checked_in
    )
  );

  return v_runs;
end;
$$;

revoke execute on function public.scoring_add_entrant(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_add_entrant(uuid, uuid, uuid, uuid, text, text)
  to service_role;

-- Remove an entrant (every run they have in the round). Refused when any of
-- those runs has a result. The round is renumbered afterwards.
create or replace function public.scoring_remove_entrant(
  p_round_id uuid,
  p_entrant_key text,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_entrant_name text;
  v_pool text;
  v_total integer;
  v_scored integer;
  v_deleted integer := 0;
begin
  if p_entrant_key is null or p_entrant_key !~ '^(solo|team):[0-9a-f-]{36}$' then
    raise exception 'That entrant is not valid.' using errcode = '22023';
  end if;

  v_live := public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  select
    count(*)::integer,
    (count(*) filter (where run.status = 'scored'))::integer,
    min(run.pool_label)
  into v_total, v_scored, v_pool
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.entrant_key = p_entrant_key;

  if v_total = 0 then
    raise exception 'That entrant is not in this round.' using errcode = 'P0002';
  end if;

  v_entrant_name := public.scoring_entrant_name(p_round_id, p_entrant_key);

  if v_scored > 0 then
    raise exception '% has results in this round. Clear them before removing.', v_entrant_name
      using errcode = '22023';
  end if;

  if v_live.current_run_id in (
    select run.id
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.entrant_key = p_entrant_key
  ) then
    update public.scoring_live_state as live
    set current_run_id = null
    where live.id is true;
  end if;

  delete from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.entrant_key = p_entrant_key;

  get diagnostics v_deleted = row_count;

  perform public.scoring_renumber_round(p_round_id);

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
    'remove_entrant',
    'scoring_runs',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_entrant_name,
      'round_name', v_round.name,
      'entrant_key', p_entrant_key,
      'pool_label', v_pool,
      'runs_deleted', v_deleted
    )
  );

  return v_deleted;
end;
$$;

revoke execute on function public.scoring_remove_entrant(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_remove_entrant(uuid, text, uuid, text, text)
  to service_role;

-- Move one run to another position. Only within its own block — the same
-- pool and the same attempt pass — because the renumbering lays every round
-- out pool by pool and pass by pass; a run with a result never moves.
-- Returns every run of the round in order.
--
-- How: in one statement every run of the round is moved clear of the current
-- range, the others to `shift + 2 * order` and the moved run to
-- `shift + 2 * target ± 1` (just after the run at the target position when
-- moving later, just before it when moving earlier). The values are distinct
-- (odd versus even) and all above the old maximum, so the unique key never
-- trips; the two-phase renumber then makes them 1..n again.
create or replace function public.scoring_move_run(
  p_run_id uuid,
  p_new_order integer,
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
  v_round_id uuid;
  v_run public.scoring_runs%rowtype;
  v_block_first integer;
  v_block_last integer;
  v_shift integer;
  v_runs jsonb;
begin
  if p_new_order is null or p_new_order < 1 then
    raise exception 'Choose a position in the start list.' using errcode = '22023';
  end if;

  select run.round_id into v_round_id
  from public.scoring_runs as run
  where run.id = p_run_id;

  if v_round_id is null then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.scoring_rounds as round
  where round.id = v_round_id
  for update;

  perform 1
  from public.scoring_runs as run
  where run.round_id = v_round_id
  order by run.run_order
  for update;

  select * into v_run
  from public.scoring_runs as run
  where run.id = p_run_id;

  if not found then
    raise exception 'That run is no longer in the start list. Refresh and try again.'
      using errcode = 'P0002';
  end if;

  if v_run.status = 'scored' then
    raise exception 'A run with a result cannot be moved.' using errcode = '22023';
  end if;

  select min(run.run_order), max(run.run_order)
  into v_block_first, v_block_last
  from public.scoring_runs as run
  where run.round_id = v_run.round_id
    and run.pool_label is not distinct from v_run.pool_label
    and run.attempt_number = v_run.attempt_number;

  if p_new_order < v_block_first or p_new_order > v_block_last then
    raise exception 'This run can only move between positions % and % (%attempt %).',
      v_block_first,
      v_block_last,
      case when v_run.pool_label is null then '' else 'Pool ' || v_run.pool_label || ', ' end,
      v_run.attempt_number
      using errcode = '22023';
  end if;

  if p_new_order <> v_run.run_order then
    select coalesce(max(run.run_order), 0) + 1
    into v_shift
    from public.scoring_runs as run
    where run.round_id = v_run.round_id;

    update public.scoring_runs as run
    set run_order = case
      when run.id = p_run_id then
        v_shift + p_new_order * 2
          + case when p_new_order > v_run.run_order then 1 else -1 end
      else v_shift + run.run_order * 2
    end
    where run.round_id = v_run.round_id;

    perform public.scoring_renumber_round(v_run.round_id);

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
      'move_run',
      'scoring_runs',
      p_run_id::text,
      jsonb_build_object(
        'subject_name', v_run.rider_name,
        'round_id', v_run.round_id,
        'pool_label', v_run.pool_label,
        'attempt_number', v_run.attempt_number,
        'before', v_run.run_order,
        'after', p_new_order
      )
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(run.*) order by run.run_order), '[]'::jsonb)
  into v_runs
  from public.scoring_runs as run
  where run.round_id = v_run.round_id;

  return v_runs;
end;
$$;

revoke execute on function public.scoring_move_run(uuid, integer, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_move_run(uuid, integer, uuid, text, text)
  to service_role;

-- Move an entrant (all their runs) to another pool: one that already exists in
-- the round, or the next new letter. They ride last in their new pool's
-- passes: their runs are shifted past every other run before the round is
-- renumbered by (pool, attempt, previous order). Refused when any of the
-- entrant's runs has a result, and in a round that is not drawn into pools.
create or replace function public.scoring_set_entrant_pool(
  p_round_id uuid,
  p_entrant_key text,
  p_pool_label text,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_round public.scoring_rounds%rowtype;
  v_entrant_name text;
  v_from_pool text;
  v_total integer;
  v_scored integer;
  v_next_label text;
  v_shift integer;
  v_moved integer := 0;
begin
  if p_entrant_key is null or p_entrant_key !~ '^(solo|team):[0-9a-f-]{36}$' then
    raise exception 'That entrant is not valid.' using errcode = '22023';
  end if;

  if p_pool_label is null or p_pool_label !~ '^[A-Z]{1,2}$' then
    raise exception 'Choose a pool by its letter.' using errcode = '22023';
  end if;

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  if v_round.pool_size is null then
    raise exception 'This round is not drawn into pools.' using errcode = '22023';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  select
    count(*)::integer,
    (count(*) filter (where run.status = 'scored'))::integer,
    min(run.pool_label)
  into v_total, v_scored, v_from_pool
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.entrant_key = p_entrant_key;

  if v_total = 0 then
    raise exception 'That entrant is not in this round.' using errcode = 'P0002';
  end if;

  v_entrant_name := public.scoring_entrant_name(p_round_id, p_entrant_key);

  if v_scored > 0 then
    raise exception '% already has results in this round, so they cannot change pool.', v_entrant_name
      using errcode = '22023';
  end if;

  if v_from_pool = p_pool_label then
    raise exception '% is already in Pool %.', v_entrant_name, p_pool_label using errcode = '22023';
  end if;

  select public.scoring_pool_label(
    coalesce(max(public.scoring_pool_index(run.pool_label)), -1) + 1
  )
  into v_next_label
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.pool_label is not null;

  if p_pool_label <> v_next_label and not exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.pool_label = p_pool_label
  ) then
    raise exception 'Pool % does not exist in this round. The next new pool would be Pool %.',
      p_pool_label, v_next_label
      using errcode = '22023';
  end if;

  select coalesce(max(run.run_order), 0) + 1
  into v_shift
  from public.scoring_runs as run
  where run.round_id = p_round_id;

  update public.scoring_runs as run
  set
    pool_label = p_pool_label,
    run_order = run.run_order + v_shift
  where run.round_id = p_round_id
    and run.entrant_key = p_entrant_key;

  get diagnostics v_moved = row_count;

  perform public.scoring_renumber_round(p_round_id);

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
    'move_pool',
    'scoring_runs',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_entrant_name,
      'round_name', v_round.name,
      'entrant_key', p_entrant_key,
      'before', v_from_pool,
      'after', p_pool_label,
      'runs', v_moved
    )
  );

  return v_moved;
end;
$$;

revoke execute on function public.scoring_set_entrant_pool(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_entrant_pool(uuid, text, text, uuid, text, text)
  to service_role;

-- Record (or, with p_advanced null, remove) an administrator's decision on
-- whether an entrant goes through — after a disqualification or a re-run
-- ordered by the chief judge, say. The leaderboard view prefers it over the
-- round's rule. Returns the override row, or null when it was removed.
create or replace function public.scoring_set_advance_override(
  p_round_id uuid,
  p_entrant_key text,
  p_advanced boolean,
  p_note text,
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
  v_round public.scoring_rounds%rowtype;
  v_entrant_name text;
  v_note text := nullif(btrim(p_note), '');
  v_before boolean;
  v_had_override boolean;
  v_saved public.scoring_advance_overrides%rowtype;
begin
  if p_entrant_key is null or p_entrant_key !~ '^(solo|team):[0-9a-f-]{36}$' then
    raise exception 'That entrant is not valid.' using errcode = '22023';
  end if;

  if char_length(v_note) > 300 then
    raise exception 'Keep the note to 300 characters.' using errcode = '22023';
  end if;

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  v_entrant_name := public.scoring_entrant_name(p_round_id, p_entrant_key);

  if v_entrant_name is null then
    raise exception 'That entrant is not in this round.' using errcode = 'P0002';
  end if;

  select advance_override.advanced
  into v_before
  from public.scoring_advance_overrides as advance_override
  where advance_override.round_id = p_round_id
    and advance_override.entrant_key = p_entrant_key
  for update;

  v_had_override := found;

  if p_advanced is null then
    if not v_had_override then
      raise exception 'There is no override to remove for %.', v_entrant_name
        using errcode = '22023';
    end if;

    delete from public.scoring_advance_overrides as advance_override
    where advance_override.round_id = p_round_id
      and advance_override.entrant_key = p_entrant_key;
  else
    insert into public.scoring_advance_overrides (
      round_id,
      entrant_key,
      advanced,
      note,
      set_by
    ) values (
      p_round_id,
      p_entrant_key,
      p_advanced,
      v_note,
      p_actor_id
    )
    on conflict (round_id, entrant_key) do update
    set
      advanced = excluded.advanced,
      note = excluded.note,
      set_by = excluded.set_by
    returning * into v_saved;
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
    'advance_override',
    'scoring_advance_overrides',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_entrant_name,
      'round_name', v_round.name,
      'entrant_key', p_entrant_key,
      'before', v_before,
      'after', p_advanced,
      'note', v_note
    )
  );

  if p_advanced is null then
    return null;
  end if;

  return to_jsonb(v_saved);
end;
$$;

revoke execute on function public.scoring_set_advance_override(uuid, text, boolean, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_advance_override(uuid, text, boolean, text, uuid, text, text)
  to service_role;

-- 9. Realtime -------------------------------------------------------------------
-- The public scoreboard, overlays and panels subscribe to changes on these
-- three tables (and refetch the state on every event). Realtime honours RLS,
-- so the anon SELECT policies above are what make the public subscription
-- work. Guarded: skipped where the publication does not exist (a plain
-- Postgres used for testing) or already covers every table, and each table is
-- added only when it is not already a member, so a second run is a no-op.

do $realtime$
declare
  v_table text;
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    raise notice 'Publication supabase_realtime not found; realtime not configured for scoring.';
    return;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
      and puballtables
  ) then
    return;
  end if;

  foreach v_table in array array['scoring_rounds', 'scoring_runs', 'scoring_live_state'] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$realtime$;

-- Tell PostgREST about the new tables, view and functions straight away.
notify pgrst, 'reload schema';

-- Verification (run by hand after applying; expected results in comments) ----
--
-- -- 25 scoring functions: 14 callable by the server, 9 internal helpers,
-- -- 2 trigger functions.
-- select count(*)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname like 'scoring\_%';
--   -- 25
--
-- -- No scoring function is executable by a client role, and service_role can
-- -- execute every one of them. That includes the two trigger functions:
-- -- Supabase's default privileges grant service_role EXECUTE on every new
-- -- function and this file only revokes from public, anon and authenticated.
-- -- That is acceptable — service_role already bypasses RLS and owns every
-- -- write path, and Postgres refuses to call a trigger function directly
-- -- ("trigger functions can only be called as triggers").
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'execute') as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--        has_function_privilege('service_role', p.oid, 'execute') as service_role
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname like 'scoring\_%'
-- order by p.proname;
--   -- anon = f and authenticated = f on every row; service_role = t on every
--   -- row (the trigger functions included, as above)
--
-- -- RLS on all four tables, one SELECT policy each and nothing else.
-- select c.relname, c.relrowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname like 'scoring\_%' and c.relkind = 'r';
--   -- 4 rows, all t
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public' and tablename like 'scoring\_%';
--   -- 4 rows, all SELECT to {anon,authenticated}
--
-- -- Clients can read and nothing more.
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name like 'scoring\_%'
--   and grantee in ('anon', 'authenticated')
-- order by table_name, grantee;
--   -- only SELECT rows (scoring_advance_overrides shows up in
--   -- information_schema.column_privileges instead: four columns)
--
-- -- The view runs with the caller's privileges.
-- select c.relname, c.reloptions
-- from pg_class c where c.oid = 'public.scoring_leaderboard'::regclass;
--   -- {security_invoker=true}
--
-- -- Realtime membership.
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and tablename like 'scoring\_%'
-- order by tablename;
--   -- scoring_live_state, scoring_rounds, scoring_runs
--
-- -- The single live-state row exists.
-- select count(*) from public.scoring_live_state;
--   -- 1
