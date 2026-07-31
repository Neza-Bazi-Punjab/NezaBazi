-- One emergency contact per team.
--
-- Solo entrants have recorded an emergency contact since the solo field
-- migration; teams recorded none at all, so four riders could arrive at a
-- horse event with nobody to call. It belongs on `teams` rather than
-- `team_members`: a section rides together, and asking a leader to supply four
-- separate next-of-kin — for teammates whose numbers they may not have — would
-- collect three fields of guesswork instead of one usable one.
--
-- Nullable, like every other "required" field on these tables: requirement is
-- enforced by the submit route and the admin dashboard, not by the column. Two
-- teams predate this field and a validated NOT NULL would make both of them
-- uneditable — an administrator fixing a team name would be blocked by a
-- contact nobody ever collected. The check below therefore tolerates null and
-- constrains only the shape of a value that is present.

alter table public.teams
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teams'::pg_catalog.regclass
      and conname = 'teams_emergency_contact_name_length'
  ) then
    alter table public.teams
      add constraint teams_emergency_contact_name_length
      check (
        emergency_contact_name is null
        or char_length(btrim(emergency_contact_name)) between 1 and 200
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teams'::pg_catalog.regclass
      and conname = 'teams_emergency_contact_phone_length'
  ) then
    alter table public.teams
      add constraint teams_emergency_contact_phone_length
      check (
        emergency_contact_phone is null
        or char_length(btrim(emergency_contact_phone)) between 1 and 30
      );
  end if;
end
$constraint$;

-- `teams` carries column-level grants rather than a table-wide one, so new
-- columns are not covered by the existing grant and the leader's own INSERT at
-- registration would silently drop them.
grant insert (emergency_contact_name, emergency_contact_phone) on public.teams to authenticated;
grant select (emergency_contact_name, emergency_contact_phone) on public.teams to authenticated;
grant update (emergency_contact_name, emergency_contact_phone) on public.teams to authenticated;

-- Let administrators edit the pair, and record it in the audit diff.
--
-- Patched in place from pg_get_functiondef rather than retyped, for the same
-- reason as admin_edit_team_horse_name: this is ~7 KB guarding every admin
-- write and its audit record, and transcribing it to change two statements
-- invites a silent divergence between this file and what is deployed. Both
-- substitutions are asserted, so an unrecognised body fails loudly instead of
-- leaving the function quietly unchanged.

do $patch$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_mutate_registration';

  if definition is null then
    raise exception 'admin_mutate_registration() not found — apply the earlier migrations first.';
  end if;

  -- 1. Write both columns in the team UPDATE.
  patched := replace(
    definition,
    E'    update public.teams as team\n    set team_name = trim(p_payload ->> ''team_name'')\n    where team.id = p_target_id',
    E'    update public.teams as team\n    set team_name = trim(p_payload ->> ''team_name''),\n        emergency_contact_name = nullif(btrim(p_payload ->> ''emergency_contact_name''), ''''),\n        emergency_contact_phone = nullif(btrim(p_payload ->> ''emergency_contact_phone''), '''')\n    where team.id = p_target_id'
  );

  if patched = definition then
    raise exception 'Could not add the emergency contact to the team UPDATE.';
  end if;

  definition := patched;

  -- 2. Include them in the audited diff, so a change to either is recorded
  --    like any other admin edit.
  patched := replace(
    definition,
    E'      array[''team_name'']::text[]',
    E'      array[''team_name'', ''emergency_contact_name'', ''emergency_contact_phone'']::text[]'
  );

  if patched = definition then
    raise exception 'Could not add the emergency contact to the team audit diff.';
  end if;

  execute patched;
end
$patch$;

-- CREATE OR REPLACE only drops grants when the signature changes; it has not,
-- but restate them so this migration is safe to run standalone.
revoke execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  to service_role;
