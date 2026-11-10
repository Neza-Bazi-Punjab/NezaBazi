-- Teams formed at the check-in desk from riders who registered solo.
--
-- Most riders registered solo although they ride with a team. On check-in
-- day (10 Nov 2026) the desk forms those teams from riders who have already
-- checked in: a new team of 1 to 4, or a missing rider added to a team made
-- earlier at the desk. A rider keeps their solo entry (riding both is
-- allowed) and no email is sent.
--
-- Each team place is a copy of the rider's solo entry. It is inserted through
-- the service role, so assign_confirmation_code gives it the solo entry's
-- code and arrival state (same name and email): the desk still sees one rider
-- with one code and one check-in. The function refuses to save if that ever
-- does not happen, rather than hand a rider a second code.
--
-- This migration:
--   1. allows registration_source 'desk' on teams (and entered_by with it),
--      so desk teams can be told apart from online and paper teams;
--   2. adds admin_desk_team(action, payload, actor...), service role only,
--      which creates a team, adds or removes a rider, renames a team, changes
--      its leader or emergency contact, or deletes it. Every change and its
--      audit record are written in one transaction. Only desk teams can be
--      changed, and none once scoring has drawn them into a round.
--
-- Undo: supabase/migrations/revert/20261109120000_desk_teams.revert.sql
-- (only once no desk teams are left).

-- 1. Desk teams ---------------------------------------------------------------

do $constraint$
begin
  if pg_catalog.to_regclass('public.teams') is null then
    raise exception 'public.teams is missing.';
  end if;

  alter table public.teams drop constraint if exists teams_registration_source_valid;
  alter table public.teams
    add constraint teams_registration_source_valid
    check (registration_source in ('online', 'paper', 'desk'));

  alter table public.teams drop constraint if exists teams_entered_by_paper_only;
  alter table public.teams
    add constraint teams_entered_by_paper_only
    check (entered_by is null or registration_source in ('paper', 'desk'));
end;
$constraint$;

-- 2. admin_desk_team ----------------------------------------------------------

create or replace function public.admin_desk_team(
  p_action text,
  p_payload jsonb,
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
  team_row record;
  team_id_value uuid;
  team_name_value text;
  removed_name text;
  removed_code text;
  solo_row record;
  member_row record;
  solo_ids uuid[];
  solo_id uuid;
  leader_id uuid;
  member_id uuid;
  new_name text;
  contact_name text;
  contact_phone text;
  created_member_id uuid;
  created_code text;
  member_count integer;
  added jsonb := '[]'::jsonb;
  constraint_name_value text;
begin
  if p_action is null or p_action not in ('create', 'add', 'remove', 'update', 'delete') then
    raise exception 'Unknown team action.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'The team details are missing.' using errcode = '22023';
  end if;

  if p_actor_id is null or not exists (
    select 1 from public.profiles as profile
    where profile.id = p_actor_id and profile.role = 'admin'
  ) then
    raise exception 'Only an administrator can form teams.' using errcode = '42501';
  end if;

  -- The team, for every action but create: a desk team, not yet drawn.
  if p_action <> 'create' then
    begin
      select team.id, team.team_name, team.registration_source
      into team_row
      from public.teams as team
      where team.id = (p_payload ->> 'team_id')::uuid
      for update;
    exception when invalid_text_representation then
      raise exception 'That team could not be found.' using errcode = '22023';
    end;

    if not found then
      raise exception 'That team could not be found. Refresh the list.' using errcode = '22023';
    end if;

    team_id_value := team_row.id;
    team_name_value := team_row.team_name;

    if team_row.registration_source <> 'desk' then
      raise exception 'Only teams formed at the check-in desk can be changed here.'
        using errcode = '22023';
    end if;

    if p_action <> 'update' and exists (
      select 1 from public.scoring_runs as run where run.team_id = team_id_value
    ) then
      raise exception 'This team is already in the scoring draw, so its riders can''t be changed.'
        using errcode = '22023';
    end if;
  end if;

  -- A new name: 1 to 100 characters, not already another team's.
  if p_action in ('create', 'update') and p_payload ? 'team_name' then
    new_name := pg_catalog.regexp_replace(btrim(coalesce(p_payload ->> 'team_name', '')), '\s+', ' ', 'g');

    if char_length(new_name) not between 1 and 100 then
      raise exception 'Enter a team name (up to 100 characters).' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.teams as team
      where lower(team.team_name) = lower(new_name)
        and team.id is distinct from team_id_value
    ) then
      raise exception 'A team called "%" already exists.', new_name using errcode = '22023';
    end if;
  end if;

  -- The team's emergency contact: a name and a phone, both required.
  if p_action = 'create' or (p_action = 'update' and p_payload ? 'emergency_contact_name') then
    contact_name := btrim(coalesce(p_payload ->> 'emergency_contact_name', ''));
    contact_phone := btrim(coalesce(p_payload ->> 'emergency_contact_phone', ''));

    if char_length(contact_name) not between 1 and 200 then
      raise exception 'Enter the team''s emergency contact name.' using errcode = '22023';
    end if;

    if char_length(public.phone_digits(contact_phone)) not between 7 and 15 then
      raise exception 'Enter the team''s emergency contact phone number.' using errcode = '22023';
    end if;
  end if;

  -- The solo riders to put on the team.
  if p_action in ('create', 'add') then
    begin
      select array_agg(distinct value::uuid)
      into solo_ids
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_payload -> 'solo_ids') = 'array'
          then p_payload -> 'solo_ids' else '[]'::jsonb end
      );
    exception when invalid_text_representation then
      raise exception 'A rider could not be found. Refresh the list.' using errcode = '22023';
    end;

    if solo_ids is null or cardinality(solo_ids) = 0 then
      raise exception 'Choose at least one rider.' using errcode = '22023';
    end if;

    member_count := case when p_action = 'add'
      then (select count(*) from public.team_members as member where member.team_id = team_id_value)
      else 0 end;

    if member_count + cardinality(solo_ids) > 4 then
      raise exception 'A team has at most 4 riders.' using errcode = '22023';
    end if;

    if p_action = 'create' then
      begin
        leader_id := (p_payload ->> 'leader_solo_id')::uuid;
      exception when invalid_text_representation then
        leader_id := null;
      end;

      if leader_id is null or not (leader_id = any (solo_ids)) then
        raise exception 'Choose the team leader from the riders on the team.' using errcode = '22023';
      end if;
    end if;

    foreach solo_id in array solo_ids loop
      select solo.*
      into solo_row
      from public.solo_registrations as solo
      where solo.id = solo_id;

      if not found then
        raise exception 'A rider could not be found. Refresh the list.' using errcode = '22023';
      end if;

      if solo_row.checked_in_at is null then
        raise exception '% has not checked in yet. Check them in first.', solo_row.full_name
          using errcode = '22023';
      end if;

      if exists (
        select 1 from public.team_members as member
        where member.confirmation_code = solo_row.confirmation_code
          or (
            lower(btrim(member.email)) = lower(btrim(solo_row.email))
            and public.rider_name_key(member.full_name) = public.rider_name_key(solo_row.full_name)
          )
      ) then
        raise exception '% is already on a team.', solo_row.full_name using errcode = '22023';
      end if;
    end loop;
  end if;

  begin
    if p_action = 'create' then
      insert into public.teams as team (
        team_name,
        leader_profile_id,
        emergency_contact_name,
        emergency_contact_phone,
        registration_source,
        entered_by
      ) values (
        new_name,
        null,
        contact_name,
        contact_phone,
        'desk',
        p_actor_id
      )
      returning team.id, team.team_name into team_id_value, team_name_value;
    end if;

    if p_action in ('create', 'add') then
      -- Leader first, so the roster reads leader-first like every other team.
      foreach solo_id in array solo_ids loop
        select solo.* into solo_row
        from public.solo_registrations as solo
        where solo.id = solo_id;

        insert into public.team_members as member (
          team_id,
          full_name,
          father_name,
          mother_name,
          age,
          location,
          phone,
          email,
          years_experience,
          horse_name,
          horse_age,
          horse_breed,
          is_leader
        ) values (
          team_id_value,
          solo_row.full_name,
          solo_row.father_name,
          solo_row.mother_name,
          solo_row.age,
          solo_row.location,
          solo_row.phone,
          solo_row.email,
          solo_row.years_experience,
          solo_row.horse_name,
          solo_row.horse_age,
          solo_row.horse_breed,
          p_action = 'create' and solo_id = leader_id
        )
        returning member.id, member.confirmation_code into created_member_id, created_code;

        -- One rider, one code: the team place must carry the solo code.
        if created_code is distinct from solo_row.confirmation_code then
          raise exception '% could not be given their own code on the team. Nothing was saved.', solo_row.full_name
            using errcode = '22023';
        end if;

        added := added || jsonb_build_array(jsonb_build_object(
          'team_member_id', created_member_id,
          'solo_registration_id', solo_row.id,
          'full_name', solo_row.full_name,
          'confirmation_code', created_code
        ));
      end loop;
    end if;

    if p_action = 'remove' then
      begin
        member_id := (p_payload ->> 'team_member_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'That rider is not on this team.' using errcode = '22023';
      end;

      select member.id, member.full_name, member.is_leader, member.confirmation_code
      into member_row
      from public.team_members as member
      where member.id = member_id and member.team_id = team_id_value;

      if not found then
        raise exception 'That rider is not on this team. Refresh the list.' using errcode = '22023';
      end if;

      removed_name := member_row.full_name;
      removed_code := member_row.confirmation_code;
      delete from public.team_members as member where member.id = member_row.id;

      -- A team never lasts without a leader; an emptied team is removed.
      select count(*) into member_count
      from public.team_members as member where member.team_id = team_id_value;

      if member_count = 0 then
        delete from public.teams as team where team.id = team_id_value;
      elsif member_row.is_leader then
        update public.team_members as member
        set is_leader = true
        where member.id = (
          select first_member.id from public.team_members as first_member
          where first_member.team_id = team_id_value
          order by first_member.created_at, first_member.id
          limit 1
        );
      end if;
    end if;

    if p_action = 'update' then
      if new_name is not null then
        update public.teams as team set team_name = new_name where team.id = team_id_value;
      end if;

      if contact_name is not null then
        update public.teams as team
        set emergency_contact_name = contact_name,
            emergency_contact_phone = contact_phone
        where team.id = team_id_value;
      end if;

      if p_payload ? 'leader_team_member_id' then
        begin
          member_id := (p_payload ->> 'leader_team_member_id')::uuid;
        exception when invalid_text_representation then
          raise exception 'Choose the new leader from this team.' using errcode = '22023';
        end;

        if not exists (
          select 1 from public.team_members as member
          where member.id = member_id and member.team_id = team_id_value
        ) then
          raise exception 'Choose the new leader from this team.' using errcode = '22023';
        end if;

        -- Two statements, so there is never a moment with two leaders.
        update public.team_members as member
        set is_leader = false
        where member.team_id = team_id_value and member.id <> member_id;
        update public.team_members as member
        set is_leader = true
        where member.id = member_id;
      end if;
    end if;

    if p_action = 'delete' then
      delete from public.team_members as member where member.team_id = team_id_value;
      delete from public.teams as team where team.id = team_id_value;
    end if;

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
      'desk_team_' || p_action,
      'teams',
      team_id_value::text,
      p_payload || jsonb_build_object(
        'subject_name', coalesce(new_name, team_name_value),
        'registration_source', 'desk',
        'added', added,
        'removed', case when removed_name is null then null
          else jsonb_build_object('full_name', removed_name, 'confirmation_code', removed_code) end
      )
    );
  exception
    -- Another desk can put the same rider on a team a moment earlier; the
    -- same-rider indexes catch it.
    when unique_violation then
      get stacked diagnostics constraint_name_value = constraint_name;
      raise exception 'A rider was put on a team at another desk a moment ago (%). Refresh and try again.',
        coalesce(constraint_name_value, 'same rider')
        using errcode = '22023';
  end;

  return jsonb_build_object(
    'team_id', team_id_value,
    'team_name', coalesce(new_name, team_name_value),
    'added', added
  );
end;
$$;

comment on function public.admin_desk_team(text, jsonb, uuid, text, text) is
  'Forms and edits teams at the check-in desk from checked-in solo riders, '
  'with its audit record, in one transaction. Desk teams only. Service role only.';

revoke execute on function public.admin_desk_team(text, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_desk_team(text, jsonb, uuid, text, text)
  to service_role;

-- 3. Checks -------------------------------------------------------------------
-- Fail the migration rather than report success over a partial result.

do $verify$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.teams'::pg_catalog.regclass
      and conname = 'teams_registration_source_valid'
      and pg_catalog.pg_get_constraintdef(oid) like '%desk%'
  ) then
    raise exception 'teams_registration_source_valid does not allow desk teams.';
  end if;

  if pg_catalog.to_regprocedure('public.admin_desk_team(text, jsonb, uuid, text, text)') is null then
    raise exception 'admin_desk_team is missing.';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated', 'public.admin_desk_team(text, jsonb, uuid, text, text)', 'execute'
  ) then
    raise exception 'admin_desk_team is executable by a browser role.';
  end if;

  if pg_catalog.to_regprocedure('public.phone_digits(text)') is null
    or pg_catalog.to_regprocedure('public.rider_name_key(text)') is null then
    raise exception 'phone_digits / rider_name_key are missing. Apply 20261108120000_shared_contact_details.sql first.';
  end if;

  raise notice 'Desk teams are ready: admin_desk_team installed, service role only.';
end;
$verify$;
