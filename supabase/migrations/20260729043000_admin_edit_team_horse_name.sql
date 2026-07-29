-- Let administrators edit a team rider's horse name.
--
-- team_member_horse_name added the column and the registration form fills it,
-- but admin_mutate_registration was written before the column existed: its
-- team field list and its team UPDATE both omit horse_name. So an
-- administrator could see a team rider's horse name and not correct it, while
-- the same field on a solo entry was editable. This evens that up.
--
-- The function is patched in place rather than retyped. It is ~7 KB of
-- procedural SQL that guards every admin write and its audit record, and
-- transcribing it to change two lines invites a silent divergence between the
-- file and what is actually deployed. Both substitutions are asserted, so a
-- shape this migration does not recognise fails loudly instead of quietly
-- leaving the function unchanged.

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

  if position('horse_name' in definition) = 0 then
    raise exception 'Unexpected function body: no horse_name handling at all.';
  end if;

  -- 1. Add horse_name to the team-member editable field list. Anchored on the
  --    closing of that array and the start of solo_editable_fields so it
  --    cannot match the solo list, which already contains horse_name.
  patched := replace(
    definition,
    E'    ''years_experience'',\n    ''horse_age'',\n    ''horse_breed''\n  ];\n  solo_editable_fields',
    E'    ''years_experience'',\n    ''horse_name'',\n    ''horse_age'',\n    ''horse_breed''\n  ];\n  solo_editable_fields'
  );

  if patched = definition then
    raise exception 'Could not add horse_name to the team editable field list.';
  end if;

  definition := patched;

  -- 2. Write the column in the team-member UPDATE. Anchored on the
  --    member_payload accessor, which the solo branch does not use.
  patched := replace(
    definition,
    E'        years_experience = (member_payload ->> ''years_experience'')::integer,\n        horse_age = (member_payload ->> ''horse_age'')::integer,',
    E'        years_experience = (member_payload ->> ''years_experience'')::integer,\n        horse_name = member_payload ->> ''horse_name'',\n        horse_age = (member_payload ->> ''horse_age'')::integer,'
  );

  if patched = definition then
    raise exception 'Could not add horse_name to the team member UPDATE.';
  end if;

  execute patched;
end
$patch$;

-- The grants are dropped by CREATE OR REPLACE only if the signature changes;
-- it has not, but restate them so this migration is safe to run standalone.
revoke execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  to service_role;
