-- Admin audit log: deleted entries move to an archive instead of vanishing.
--
-- The dashboard can now delete audit entries (one, several, or the whole log).
-- Rather than destroy them, public.admin_archive_audit_entries() moves them to
-- public.admin_audit_log_archive in one transaction, stamped with who removed
-- them and when. The archive is read-only from the dashboard: there is no
-- restore, and no browser role can write it.
--
-- Apply any time after 20260714005451_harden_admin_audit_log.sql. Until it is
-- applied, deleting from the Audit Log tab fails with an error and removes
-- nothing. The live project is migrated by hand in the SQL editor, so every
-- statement is idempotent and the preconditions fail loudly.

do $preconditions$
begin
  if pg_catalog.to_regclass('public.admin_audit_log') is null then
    raise exception 'public.admin_audit_log not found — apply harden_admin_audit_log first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found.';
  end if;
end
$preconditions$;

create table if not exists public.admin_audit_log_archive (
  id uuid primary key default gen_random_uuid(),
  original_id uuid not null,
  actor_id uuid,
  actor_name text,
  actor_email text,
  action text not null,
  target_table text,
  target_id text,
  details jsonb,
  batch_id uuid,
  created_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  deleted_by_id uuid,
  deleted_by_name text,
  deleted_by_email text
);

create index if not exists admin_audit_log_archive_deleted_at_idx
  on public.admin_audit_log_archive (deleted_at desc);

alter table public.admin_audit_log_archive enable row level security;

drop policy if exists "Authenticated admins can view audit archive"
  on public.admin_audit_log_archive;

revoke all on table public.admin_audit_log_archive from anon, authenticated;
grant select on table public.admin_audit_log_archive to authenticated;
grant all on table public.admin_audit_log_archive to service_role;

create policy "Authenticated admins can view audit archive"
on public.admin_audit_log_archive
for select
to authenticated
using ((select public.is_admin()));

create or replace function public.admin_archive_audit_entries(
  p_ids uuid[],
  p_all boolean,
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
  moved integer;
begin
  if not coalesce(p_all, false) and coalesce(cardinality(p_ids), 0) = 0 then
    raise exception 'No audit entries chosen.' using errcode = '22023';
  end if;

  with deleted as (
    delete from public.admin_audit_log as log
    where coalesce(p_all, false) or log.id = any(p_ids)
    returning
      log.id,
      log.actor_id,
      log.actor_name,
      log.actor_email,
      log.action,
      log.target_table,
      log.target_id,
      log.details,
      log.batch_id,
      log.created_at
  ),
  archived as (
    insert into public.admin_audit_log_archive (
      original_id,
      actor_id,
      actor_name,
      actor_email,
      action,
      target_table,
      target_id,
      details,
      batch_id,
      created_at,
      deleted_by_id,
      deleted_by_name,
      deleted_by_email
    )
    select
      id,
      actor_id,
      actor_name,
      actor_email,
      action,
      target_table,
      target_id,
      details,
      batch_id,
      created_at,
      p_actor_id,
      p_actor_name,
      p_actor_email
    from deleted
    returning 1
  )
  select count(*)::integer into moved from archived;

  return moved;
end;
$$;

revoke execute on function public.admin_archive_audit_entries(uuid[], boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_archive_audit_entries(uuid[], boolean, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
