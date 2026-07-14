drop policy if exists "Admins can update all solo registrations"
  on public.solo_registrations;
drop policy if exists "Admins can delete all solo registrations"
  on public.solo_registrations;

drop policy if exists "Admins can update all teams"
  on public.teams;
drop policy if exists "Admins can delete all teams"
  on public.teams;

drop policy if exists "Admins can update all team members"
  on public.team_members;
drop policy if exists "Admins can delete all team members"
  on public.team_members;

create index if not exists admin_audit_log_actor_id_idx
  on public.admin_audit_log(actor_id);
