-- The shared practice session: one demo on every device.
--
-- /judge/demo and /commentary/demo on the live site (and the scoring APIs with
-- ?sample=1) used to keep each signed-in person's practice session in the
-- server's memory, so a judge on one device and a commentator on another
-- never saw the same thing, and landing on another server instance reset it.
-- The practice session's state is plain data (the engine's SampleSeed:
-- rounds, runs, live state, overrides, progression), so it now lives in one
-- jsonb row here and every request rebuilds the engine from it
-- (src/lib/scoring/training-db.ts, sample-session.ts). Every device reads the
-- same row, and ?sample=demo on the vMix feeds, /api/live/state, /live and
-- the overlays follows it.
--
--   scoring_training_sessions  one row per practice session; today only
--                              'shared'. `version` is bumped on every save
--                              and each save checks it, so two judges
--                              tapping at once never overwrite each other.
--   scoring_training_switch    a single row: whether an administrator has
--                              closed the demo for the event ("Close demo" on
--                              /admin/scoring). Closed, the demo pages say so,
--                              the practice APIs refuse, and ?sample=demo
--                              answers with the frozen ?sample=1 rows, so a
--                              forgotten demo page or address can never
--                              confuse event day. Open by default.
--
-- Security: the row holds invented riders only, never a registration or a
-- real result. Row level security is on with no policies and every browser
-- role is revoked on both tables, so only the service role (the server) reads
-- or writes them. The switch's changes are audited by the server route
-- (POST /api/admin/scoring/demo-switch: close_demo / open_demo).
--
-- Apply any time; it depends on nothing else. Until it is applied, the live
-- site keeps a practice session per server instance in memory and the
-- practice banner says "(not yet shared between devices)". The live project
-- is migrated by hand in the SQL editor, so every statement is idempotent and
-- the preconditions fail loudly.

do $preconditions$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'The service_role role was not found — this migration is for the Supabase project.';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception 'The anon / authenticated roles were not found — this migration is for the Supabase project.';
  end if;
end
$preconditions$;

create table if not exists public.scoring_training_sessions (
  id text primary key,                 -- 'shared'
  state jsonb not null,                -- SampleSeed, as sample-session.ts stores it
  version bigint not null default 1,   -- bumped on every save; the save checks it
  updated_at timestamptz not null default now(),
  updated_by uuid                      -- the staff member who last wrote, for diagnostics only
);

comment on table public.scoring_training_sessions is
  'The organisers'' shared practice session (invented riders only). Written by the server through the service role; never real results.';

alter table public.scoring_training_sessions enable row level security;

-- No policies on purpose: service_role only. Drop any a hand edit may have added.
do $policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'scoring_training_sessions'
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.scoring_training_sessions',
      v_policy.policyname
    );
  end loop;
end
$policies$;

revoke all on table public.scoring_training_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.scoring_training_sessions to service_role;

-- The "Close the demo" switch: one row, open by default.
create table if not exists public.scoring_training_switch (
  id boolean primary key default true
    constraint scoring_training_switch_single_row check (id),
  demo_closed boolean not null default false,
  changed_at timestamptz,
  changed_by uuid                      -- the administrator who last changed it
);

insert into public.scoring_training_switch (id) values (true) on conflict (id) do nothing;

comment on table public.scoring_training_switch is
  'Single row: whether the shared practice demo is closed for the event. Written by the server through the service role only.';

alter table public.scoring_training_switch enable row level security;

do $switch_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'scoring_training_switch'
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.scoring_training_switch',
      v_policy.policyname
    );
  end loop;
end
$switch_policies$;

revoke all on table public.scoring_training_switch from public, anon, authenticated;
grant select, insert, update on table public.scoring_training_switch to service_role;

notify pgrst, 'reload schema';

-- Verify: fails loudly if anything above did not take.
do $verify$
begin
  if pg_catalog.to_regclass('public.scoring_training_sessions') is null then
    raise exception 'public.scoring_training_sessions was not created.';
  end if;

  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.scoring_training_sessions'::regclass
  ) then
    raise exception 'Row level security is not enabled on public.scoring_training_sessions.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'scoring_training_sessions'
  ) then
    raise exception 'public.scoring_training_sessions must have no policies.';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.scoring_training_sessions', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.scoring_training_sessions', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.scoring_training_sessions', 'insert')
     or pg_catalog.has_table_privilege('authenticated', 'public.scoring_training_sessions', 'insert')
     or pg_catalog.has_table_privilege('anon', 'public.scoring_training_sessions', 'update')
     or pg_catalog.has_table_privilege('authenticated', 'public.scoring_training_sessions', 'update') then
    raise exception 'A browser role can still reach public.scoring_training_sessions.';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.scoring_training_sessions', 'select, insert, update, delete') then
    raise exception 'service_role cannot read and write public.scoring_training_sessions.';
  end if;

  if pg_catalog.to_regclass('public.scoring_training_switch') is null then
    raise exception 'public.scoring_training_switch was not created.';
  end if;

  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.scoring_training_switch'::regclass
  ) then
    raise exception 'Row level security is not enabled on public.scoring_training_switch.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'scoring_training_switch'
  ) then
    raise exception 'public.scoring_training_switch must have no policies.';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.scoring_training_switch', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.scoring_training_switch', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.scoring_training_switch', 'update')
     or pg_catalog.has_table_privilege('authenticated', 'public.scoring_training_switch', 'update') then
    raise exception 'A browser role can still reach public.scoring_training_switch.';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.scoring_training_switch', 'select, update') then
    raise exception 'service_role cannot read and change public.scoring_training_switch.';
  end if;

  if (select count(*) from public.scoring_training_switch) <> 1 then
    raise exception 'public.scoring_training_switch must hold exactly one row.';
  end if;
end
$verify$;

-- By hand, after applying:
--
-- select id, version, updated_at from public.scoring_training_sessions;
--   -- empty until someone practises; then one row, id = 'shared'
-- select relrowsecurity from pg_class where oid = 'public.scoring_training_sessions'::regclass;
--   -- true
-- select * from public.scoring_training_switch;
--   -- one row, demo_closed = false
