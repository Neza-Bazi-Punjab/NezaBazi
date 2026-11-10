-- Undo for 20261110100000_rider_dal_panth.sql: removes admin_set_dal_panth,
-- admin_sync_dal_panth, both length checks and the dal_panth column on
-- solo_registrations and team_members (its column grant goes with it).
--
-- Refuses while any Dal Panth is stored, because dropping the column would
-- destroy what organisers typed in. Export the Solo Riders and Teams lists to
-- Excel first (the export carries the Dal Panth column), then clear the values
-- or decide to keep this migration in place.
--
-- Run by hand only; never applied automatically. Idempotent: once the column
-- is gone, a second run only repeats the drops, which are all "if exists".

do $revert$
declare
  stored_solo bigint := 0;
  stored_team bigint := 0;
begin
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = pg_catalog.to_regclass('public.solo_registrations')
      and attname = 'dal_panth'
      and not attisdropped
  ) then
    execute 'select count(*) from public.solo_registrations where dal_panth is not null'
      into stored_solo;
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = pg_catalog.to_regclass('public.team_members')
      and attname = 'dal_panth'
      and not attisdropped
  ) then
    execute 'select count(*) from public.team_members where dal_panth is not null'
      into stored_team;
  end if;

  if stored_solo + stored_team > 0 then
    raise exception 'Dal Panth is still stored for % solo entries and % team places. Export both lists to Excel first, then clear the values and run this again.',
      stored_solo, stored_team;
  end if;

  drop function if exists public.admin_set_dal_panth(text, text, uuid, text, text);
  drop function if exists public.admin_sync_dal_panth();

  if pg_catalog.to_regclass('public.solo_registrations') is not null then
    alter table public.solo_registrations drop constraint if exists solo_registrations_dal_panth_length;
    alter table public.solo_registrations drop column if exists dal_panth;
  end if;

  if pg_catalog.to_regclass('public.team_members') is not null then
    alter table public.team_members drop constraint if exists team_members_dal_panth_length;
    alter table public.team_members drop column if exists dal_panth;
  end if;

  raise notice 'Dal Panth removed: both functions, both length checks and both columns dropped.';
end;
$revert$;

notify pgrst, 'reload schema';
