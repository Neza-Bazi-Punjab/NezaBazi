-- Horse name for every team rider.
--
-- Solo entrants have recorded a horse name since the solo field migration;
-- team riders only had horse age and breed, so a section of four arrived with
-- four unnamed horses. The registration form now asks each rider for it.
--
-- The column is nullable and the constraint tolerates null on purpose. Eight
-- rider rows were registered before this field existed, and a NOT NULL check
-- would apply to every future UPDATE of those rows too — an administrator
-- correcting a phone number on an old entry would be blocked by a missing
-- horse name they cannot see. New registrations are required to supply one by
-- the submit route instead.

alter table public.team_members
  add column if not exists horse_name text;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.team_members'::pg_catalog.regclass
      and conname = 'team_members_horse_name_length'
  ) then
    alter table public.team_members
      add constraint team_members_horse_name_length
      check (
        horse_name is null
        or char_length(btrim(horse_name)) between 1 and 200
      );
  end if;
end
$constraint$;

-- Riders edit their own rows from the account page, so the column has to be in
-- the browser's UPDATE grant alongside the other rider fields. The
-- registration_confirmation_codes migration replaced the table-wide grant with
-- an explicit column list, which this extends rather than reopens.
grant update (horse_name) on public.team_members to authenticated;
