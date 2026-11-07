-- Undo for 20261108110000_any_account_enters_several_riders.sql: puts back
-- the one-solo-entry-per-non-admin trigger exactly as the dashboard had it.
-- Use only if the organisers decide ordinary accounts must not enter several
-- riders after all. Idempotent.

create or replace function public.enforce_solo_one_per_player()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  submitter_role text;
begin
  select role into submitter_role from profiles where id = new.profile_id;

  if submitter_role = 'admin' then
    return new;
  end if;

  if exists (select 1 from solo_registrations where profile_id = new.profile_id) then
    raise exception 'You have already registered.' using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_solo_one_per_player() from public, anon, authenticated;

drop trigger if exists solo_one_per_player on public.solo_registrations;
create trigger solo_one_per_player
  before insert on public.solo_registrations
  for each row execute function public.enforce_solo_one_per_player();

notify pgrst, 'reload schema';
