-- Undo for 20261109120000_desk_teams.sql: removes admin_desk_team and puts
-- teams' registration_source back to online/paper only.
--
-- Refuses while any desk team is left, because the old constraint would not
-- hold for it. Delete those teams from the check-in desk's Form teams tab
-- first (or decide to keep them and leave this migration in place).
-- Idempotent.

do $revert$
begin
  if exists (select 1 from public.teams where registration_source = 'desk') then
    raise exception 'Desk teams still exist. Delete them from Form teams first, then run this again.';
  end if;

  drop function if exists public.admin_desk_team(text, jsonb, uuid, text, text);

  alter table public.teams drop constraint if exists teams_registration_source_valid;
  alter table public.teams
    add constraint teams_registration_source_valid
    check (registration_source in ('online', 'paper'));

  alter table public.teams drop constraint if exists teams_entered_by_paper_only;
  alter table public.teams
    add constraint teams_entered_by_paper_only
    check (entered_by is null or registration_source = 'paper');

  raise notice 'Desk teams removed: admin_desk_team dropped, teams back to online/paper.';
end;
$revert$;
