-- Graphics rehearsal feed: the on/off switch for the moving vMix sample.
--
-- The vMix feeds answer ?sample=solo with a scripted Single qualification that
-- moves on every few seconds (src/lib/scoring/vmix-sample-live.ts), so the
-- graphics team can test titles against data that changes like event day.
-- An administrator switches it on and off from the "Graphics rehearsal feed"
-- card on /admin/scoring. Off (the default), ?sample=solo answers like the
-- frozen ?sample=1.
--
--   scoring_rehearsal  a single row: whether the moving solo sample runs, when
--                      it last changed and who changed it.
--
-- Same security model as the live scoring tables: read-only from the browser,
-- written only by scoring_set_rehearsal_sample(), executable by service_role
-- only, which writes its admin_audit_log row in the same transaction. The
-- public can read the switch and when it changed, never who changed it.
--
-- Room for a team (Section) sample later: add team_sample_enabled and accept
-- 'team' in the function.
--
-- Apply any time after 20261025120000_live_scoring.sql. Until it is applied,
-- ?sample=solo answers like ?sample=1 and the card says the switch is not set
-- up. The live project is migrated by hand in the SQL editor, so every
-- statement is idempotent and the preconditions fail loudly.

do $preconditions$
begin
  if pg_catalog.to_regclass('public.scoring_live_state') is null then
    raise exception 'public.scoring_live_state not found — apply 20261025120000_live_scoring.sql first.';
  end if;

  if pg_catalog.to_regclass('public.admin_audit_log') is null then
    raise exception 'public.admin_audit_log not found.';
  end if;
end
$preconditions$;

create table if not exists public.scoring_rehearsal (
  id boolean primary key default true
    constraint scoring_rehearsal_single_row check (id),
  solo_sample_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);

insert into public.scoring_rehearsal (id) values (true) on conflict do nothing;

comment on table public.scoring_rehearsal is
  'Single row: whether the moving vMix rehearsal sample (?sample=solo) runs. Read-only to clients.';

alter table public.scoring_rehearsal enable row level security;

drop policy if exists "Anyone can read the rehearsal switch" on public.scoring_rehearsal;
create policy "Anyone can read the rehearsal switch"
  on public.scoring_rehearsal
  for select
  to anon, authenticated
  using (true);

-- Column list: the feeds need the switch, not who flipped it.
revoke all on table public.scoring_rehearsal from anon, authenticated;
grant select (id, solo_sample_enabled, updated_at)
  on table public.scoring_rehearsal to anon, authenticated;
grant all on table public.scoring_rehearsal to service_role;

-- Switch one sample on or off. Returns the row. Switching to the state it is
-- already in is refused, so a double click records one change, not two.
create or replace function public.scoring_set_rehearsal_sample(
  p_sample text,
  p_enabled boolean,
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
  v_row public.scoring_rehearsal%rowtype;
begin
  if p_sample is distinct from 'solo' then
    raise exception 'Unknown sample.' using errcode = '22023';
  end if;

  if p_enabled is null then
    raise exception 'Choose on or off.' using errcode = '22023';
  end if;

  insert into public.scoring_rehearsal (id) values (true) on conflict (id) do nothing;

  select * into v_row
  from public.scoring_rehearsal as rehearsal
  where rehearsal.id is true
  for update;

  if v_row.solo_sample_enabled = p_enabled then
    raise exception 'The moving sample is already %.', case when p_enabled then 'on' else 'off' end
      using errcode = '22023';
  end if;

  update public.scoring_rehearsal as rehearsal
  set
    solo_sample_enabled = p_enabled,
    updated_at = now(),
    updated_by = p_actor_id,
    updated_by_name = p_actor_name
  where rehearsal.id is true
  returning * into v_row;

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
    case when p_enabled then 'start_rehearsal_feed' else 'stop_rehearsal_feed' end,
    'scoring_rehearsal',
    p_sample,
    jsonb_build_object('sample', p_sample, 'before', not p_enabled, 'after', p_enabled)
  );

  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.scoring_set_rehearsal_sample(text, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_set_rehearsal_sample(text, boolean, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

-- Verification (run after applying):
--
-- select * from public.scoring_rehearsal;
--   -- one row, solo_sample_enabled = false
-- select grantee, privilege_type, column_name
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'scoring_rehearsal'
--   and grantee in ('anon', 'authenticated')
-- order by grantee, column_name;
--   -- SELECT on id, solo_sample_enabled, updated_at only
