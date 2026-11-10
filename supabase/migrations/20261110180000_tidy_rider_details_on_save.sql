-- Tidy a rider's details every time they are saved.
--
-- Asked for by the head organiser on 10 Nov 2026, the evening before the
-- event, after the whole rider list was tidied by hand: names typed in all
-- lower case or ALL CAPITALS, "Bathinda, Bathinda, Punjab, India", stray
-- spaces, and a handful of district and breed spellings. These fields are
-- shown on the scoreboard, the commentary panel and the broadcast feed, so
-- they must look right however an entry arrives: the online forms, paper
-- entry, the check-in desk, the team desk, or an edit in the admin lists.
--
-- This migration only ADDS. It patches, drops and calls no existing function.
-- It adds:
--   1. tidy_rider_text(text): trims, collapses whitespace, and capitalises
--      the first letter of each word. A word typed in mixed case ("LaSalle",
--      "McKay") is kept as typed, apart from its first letter;
--   2. tidy_rider_location(text): the same, then the known district
--      spellings, the word "District" dropped from the end of a part, and a
--      part that repeats an earlier one removed
--      ("Jalandhar, Jalandhar district, Punjab, India" becomes
--      "Jalandhar, Punjab, India");
--   3. tidy_rider_breed(text): the same as 1, then the known breed spellings;
--   4. tidy_rider_details(), a BEFORE INSERT OR UPDATE trigger function, and
--      its trigger on solo_registrations, team_members and teams.
--
-- The fields: full_name, father_name, mother_name, horse_name,
-- emergency_contact_name, team_name and dal_panth (rule 1), location (rule 2)
-- and horse_breed (rule 3). Emails and phone numbers are left as typed.
--
-- What makes it safe on the day:
--   * On UPDATE a field is tidied only when that update changes it. A
--     check-in, a photo or a Dal Panth edit never rewrites a rider's text.
--   * A tidied value that would come out blank or over 200 characters is
--     left exactly as typed, so the existing checks decide as they always
--     have: this never turns an accepted entry into a refused one.
--   * Any error inside the tidying is swallowed and the row is saved as
--     typed. Tidying can never be the reason a registration fails.
--   * Name matching everywhere (rider_name_key, isOwnRegistration) already
--     ignores capitals and extra spaces, so a tidied name is the same rider.
--   * The scoreboard's short location takes the two parts before the last
--     ("Bathinda, Punjab, India" gives "Bathinda, Punjab"), so dropping a
--     repeated part leaves it the same or better.
--
-- It cannot catch a mistake it has never seen: a new misspelling, a wrong
-- town or "abc" typed as a name is saved as typed.
--
-- Existing rows are not touched by this file. Idempotent: a second run
-- changes nothing. The undo is
-- supabase/migrations/revert/20261110180000_tidy_rider_details_on_save.revert.sql.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regclass('public.solo_registrations') is null
     or pg_catalog.to_regclass('public.team_members') is null
     or pg_catalog.to_regclass('public.teams') is null then
    raise exception 'solo_registrations, team_members and teams must exist before this migration.';
  end if;
end
$preconditions$;

-- 1. Capital letters and spacing ----------------------------------------------
--
--   'ROUNAK SINGH  kathuriya '   ->  'Rounak Singh Kathuriya'
--   'Kad gill , Tarn Taran'      ->  'Kad Gill, Tarn Taran'
--   'LaSalle'                    ->  'LaSalle'
--   'mohali, S.A.S nagar'        ->  'Mohali, S.A.S Nagar'
--   'na', 'NA', 'n/a'            ->  'N/A'   (the whole value only)
--   '   '                        ->  '   '   (left for the existing checks)
--   null                         ->  null
create or replace function public.tidy_rider_text(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  -- Written in capitals on purpose; initcap would spoil them.
  c_keep constant text[] := array['SAS', 'S.A.S', 'N/A', 'USA', 'UK', 'UAE', 'BC', 'NZ'];
  v_text text;
  v_token text;
  v_result text := '';
begin
  if p_value is null then
    return null;
  end if;

  v_text := pg_catalog.btrim(pg_catalog.regexp_replace(p_value, '\s+', ' ', 'g'));
  v_text := pg_catalog.regexp_replace(v_text, '\s*,\s*', ', ', 'g');
  v_text := pg_catalog.btrim(v_text);

  if v_text = '' then
    return p_value;
  end if;

  if pg_catalog.lower(v_text) in ('na', 'n/a') then
    return 'N/A';
  end if;

  for v_token in
    select found.parts[1]
    from pg_catalog.regexp_matches(v_text, '( +|[^ ]+)', 'g') as found(parts)
  loop
    if v_token ~ '^ +$' then
      v_result := v_result || v_token;
    elsif pg_catalog.upper(v_token) = any (c_keep) then
      v_result := v_result || pg_catalog.upper(v_token);
    elsif v_token = 'and' then
      v_result := v_result || v_token;
    elsif v_token = pg_catalog.lower(v_token) or v_token = pg_catalog.upper(v_token) then
      v_result := v_result || pg_catalog.initcap(v_token);
    else
      v_result := v_result || pg_catalog.upper(pg_catalog.left(v_token, 1)) || pg_catalog.substr(v_token, 2);
    end if;
  end loop;

  if pg_catalog.char_length(v_result) > 200 then
    return p_value;
  end if;

  return v_result;
end;
$$;

comment on function public.tidy_rider_text(text) is
  'Trims, collapses whitespace and capitalises the first letter of each word. '
  'Mixed-case words are kept as typed.';

-- 2. Locations ------------------------------------------------------------------
--
--   'Bathinda, Bathinda, Punjab, India'             ->  'Bathinda, Punjab, India'
--   'Jalandhar, Jalandhar district, Punjab, India'  ->  'Jalandhar, Punjab, India'
--   'Montreal, Montréal, Quebec, Canada'            ->  'Montreal, Quebec, Canada'
--   'valah, amristar, punjab, india'                ->  'Valah, Amritsar, Punjab, India'
--   'Kaul, Patiala district, Punjab, India'         ->  'Kaul, Patiala, Punjab, India'
--   'Langley, Metro Vancouver Regional District, …' ->  unchanged
create or replace function public.tidy_rider_location(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_text text;
  v_part text;
  v_key text;
  v_keys text[] := '{}';
  v_kept text[] := '{}';
  v_result text;
begin
  if p_value is null then
    return null;
  end if;

  v_text := public.tidy_rider_text(p_value);

  if pg_catalog.btrim(v_text) = '' or v_text = 'N/A' then
    return v_text;
  end if;

  -- The spellings corrected by hand on 10 Nov 2026.
  v_text := pg_catalog.regexp_replace(v_text, '\m(Amristar|Amaritsar)\M', 'Amritsar', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\m(Hoshiyarpur|Hoshairpur)\M', 'Hoshiarpur', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mNawashehar\M', 'Nawanshahr', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mShri Ganganagar\M', 'Sri Ganganagar', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mSAS Nagar\M', 'S.A.S Nagar', 'gi');

  foreach v_part in array pg_catalog.string_to_array(v_text, ',')
  loop
    v_part := pg_catalog.btrim(v_part);

    if v_part = '' then
      continue;
    end if;

    -- "Ludhiana District" is announced as "Ludhiana"; a regional district
    -- ("Metro Vancouver Regional District") is its own name and stays.
    if v_part ~* '\S\s+district$' and v_part !~* 'regional\s+district$' then
      v_part := pg_catalog.btrim(pg_catalog.regexp_replace(v_part, '\s+district$', '', 'i'));
    end if;

    -- Two parts are the same place when they match without capitals,
    -- accents, dots and spaces.
    v_key := pg_catalog.replace(
      pg_catalog.lower(pg_catalog.translate(v_part, 'éèāĀīĪūŪ.', 'eeaaiiuu')),
      ' ',
      ''
    );

    if v_key = any (v_keys) then
      continue;
    end if;

    v_keys := v_keys || v_key;
    v_kept := v_kept || v_part;
  end loop;

  v_result := pg_catalog.array_to_string(v_kept, ', ');

  if v_result = '' or pg_catalog.char_length(v_result) > 200 then
    return p_value;
  end if;

  return v_result;
end;
$$;

comment on function public.tidy_rider_location(text) is
  'tidy_rider_text, then known district spellings, the word District dropped, '
  'and repeated parts removed.';

-- 3. Horse breeds ---------------------------------------------------------------
create or replace function public.tidy_rider_breed(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_value is null then
    return null;
  end if;

  v_text := public.tidy_rider_text(p_value);

  -- The spellings corrected by hand on 10 Nov 2026.
  v_text := pg_catalog.regexp_replace(v_text, '\m(Marwadi|Marvadi)\M', 'Marwari', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mMajhuke\M', 'Majuke', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mNukhra\M', 'Nukra', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mSindi\M', 'Sindhi', 'gi');

  if pg_catalog.char_length(v_text) > 200 then
    return p_value;
  end if;

  return v_text;
end;
$$;

comment on function public.tidy_rider_breed(text) is
  'tidy_rider_text, then known breed spellings.';

-- 4. The trigger ------------------------------------------------------------------
--
-- Security definer so it can call the three helpers whoever saves the row
-- (the online forms insert as authenticated; the helpers are not executable
-- by browser roles). It reads and writes nothing but the row being saved.
create or replace function public.tidy_rider_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typed jsonb := pg_catalog.to_jsonb(new);
  v_before jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else '{}'::jsonb end;
  v_tidied jsonb := '{}'::jsonb;
  v_column text;
  v_value text;
begin
  for v_column in
    select candidate.name
    from pg_catalog.unnest(array[
      'full_name', 'father_name', 'mother_name', 'horse_name',
      'emergency_contact_name', 'team_name', 'dal_panth',
      'location', 'horse_breed'
    ]) as candidate(name)
    where v_typed ? candidate.name
  loop
    v_value := v_typed ->> v_column;

    if v_value is null then
      continue;
    end if;

    -- An update that leaves the field alone leaves the field alone.
    if tg_op = 'UPDATE' and v_value is not distinct from (v_before ->> v_column) then
      continue;
    end if;

    v_tidied := v_tidied || pg_catalog.jsonb_build_object(
      v_column,
      case v_column
        when 'location' then public.tidy_rider_location(v_value)
        when 'horse_breed' then public.tidy_rider_breed(v_value)
        else public.tidy_rider_text(v_value)
      end
    );
  end loop;

  if v_tidied = '{}'::jsonb then
    return new;
  end if;

  return pg_catalog.jsonb_populate_record(new, v_tidied);
exception
  when others then
    -- Tidying must never be why a rider cannot be saved.
    return new;
end;
$$;

comment on function public.tidy_rider_details() is
  'BEFORE INSERT OR UPDATE on solo_registrations, team_members and teams: '
  'tidies the text fields that changed. Never raises.';

revoke execute on function public.tidy_rider_text(text) from public, anon, authenticated;
revoke execute on function public.tidy_rider_location(text) from public, anon, authenticated;
revoke execute on function public.tidy_rider_breed(text) from public, anon, authenticated;
revoke execute on function public.tidy_rider_details() from public, anon, authenticated;
grant execute on function public.tidy_rider_text(text) to service_role;
grant execute on function public.tidy_rider_location(text) to service_role;
grant execute on function public.tidy_rider_breed(text) to service_role;

drop trigger if exists tidy_rider_details on public.solo_registrations;
create trigger tidy_rider_details
  before insert or update on public.solo_registrations
  for each row execute function public.tidy_rider_details();

drop trigger if exists tidy_rider_details on public.team_members;
create trigger tidy_rider_details
  before insert or update on public.team_members
  for each row execute function public.tidy_rider_details();

drop trigger if exists tidy_rider_details on public.teams;
create trigger tidy_rider_details
  before insert or update on public.teams
  for each row execute function public.tidy_rider_details();

-- 5. Check the result -------------------------------------------------------------

do $verify$
declare
  missing text;
begin
  select pg_catalog.string_agg(wanted.name, ', ')
  into missing
  from pg_catalog.unnest(array['solo_registrations', 'team_members', 'teams']) as wanted(name)
  where not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.' || wanted.name)
      and trigger_row.tgname = 'tidy_rider_details'
      and trigger_row.tgfoid = 'public.tidy_rider_details()'::pg_catalog.regprocedure
      and not trigger_row.tgisinternal
  );

  if missing is not null then
    raise exception 'tidy_rider_details trigger missing on: %', missing;
  end if;

  if public.tidy_rider_text('ROUNAK SINGH  kathuriya ') <> 'Rounak Singh Kathuriya'
     or public.tidy_rider_text('LaSalle') <> 'LaSalle'
     or public.tidy_rider_text('na') <> 'N/A'
     or public.tidy_rider_location('Jalandhar, Jalandhar district, Punjab, India') <> 'Jalandhar, Punjab, India'
     or public.tidy_rider_location('valah, amristar , punjab,india') <> 'Valah, Amritsar, Punjab, India'
     or public.tidy_rider_location('Langley, Metro Vancouver Regional District, British Columbia, Canada')
          <> 'Langley, Metro Vancouver Regional District, British Columbia, Canada'
     or public.tidy_rider_breed('sindi + marwadi') <> 'Sindhi + Marwari' then
    raise exception 'The tidy functions do not give the expected results.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.tidy_rider_text(text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.tidy_rider_text(text)', 'execute') then
    raise exception 'A browser role can execute tidy_rider_text.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
