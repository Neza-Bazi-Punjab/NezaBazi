alter table public.admin_audit_log
  add column if not exists actor_name text,
  add column if not exists actor_email text;

update public.admin_audit_log as audit
set
  actor_name = coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    auth_user.email
  ),
  actor_email = auth_user.email
from auth.users as auth_user
where audit.actor_id = auth_user.id
  and (audit.actor_name is null or audit.actor_email is null);

alter table public.admin_audit_log
  alter column actor_id drop not null,
  drop constraint if exists admin_audit_log_actor_id_fkey;

alter table public.admin_audit_log
  add constraint admin_audit_log_actor_id_fkey
  foreign key (actor_id)
  references public.profiles(id)
  on delete set null;

drop policy if exists "Admins can insert audit log entries"
  on public.admin_audit_log;
drop policy if exists "Admins can view audit log"
  on public.admin_audit_log;

revoke all on table public.admin_audit_log from anon, authenticated;
revoke insert, update, delete on table public.admin_audit_log from anon, authenticated;
grant select on table public.admin_audit_log to authenticated;
grant all on table public.admin_audit_log to service_role;

create policy "Authenticated admins can view audit log"
on public.admin_audit_log
for select
to authenticated
using ((select public.is_admin()));

create or replace function public.admin_audit_diff(
  p_before jsonb,
  p_after jsonb,
  p_fields text[]
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      field_name,
      jsonb_build_object(
        'before', p_before -> field_name,
        'after', p_after -> field_name
      )
    ) filter (
      where p_before -> field_name is distinct from p_after -> field_name
    ),
    '{}'::jsonb
  )
  from unnest(p_fields) as field_name;
$$;

create or replace function public.admin_mutate_registration(
  p_operation text,
  p_target_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text,
  p_batch_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  changes jsonb;
  member_payload jsonb;
  member_id uuid;
  member_count integer;
  effective_batch_id uuid := coalesce(p_batch_id, gen_random_uuid());
  editable_fields constant text[] := array[
    'full_name',
    'age',
    'location',
    'phone',
    'email',
    'years_experience',
    'horse_age',
    'horse_breed'
  ];
begin
  if p_operation = 'edit_solo' then
    select to_jsonb(registration.*)
    into old_row
    from public.solo_registrations as registration
    where registration.id = p_target_id
    for update;

    if old_row is null then
      raise exception 'Solo registration not found.' using errcode = 'P0002';
    end if;

    update public.solo_registrations as registration
    set
      full_name = p_payload ->> 'full_name',
      age = (p_payload ->> 'age')::integer,
      location = p_payload ->> 'location',
      phone = p_payload ->> 'phone',
      email = p_payload ->> 'email',
      years_experience = (p_payload ->> 'years_experience')::integer,
      horse_age = (p_payload ->> 'horse_age')::integer,
      horse_breed = p_payload ->> 'horse_breed'
    where registration.id = p_target_id
    returning to_jsonb(registration.*) into new_row;

    changes := public.admin_audit_diff(old_row, new_row, editable_fields);

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
      'edit_solo_registration',
      'solo_registrations',
      p_target_id::text,
      jsonb_build_object('subject_name', new_row ->> 'full_name') || changes
    );
  elsif p_operation = 'delete_solo' then
    delete from public.solo_registrations as registration
    where registration.id = p_target_id
    returning to_jsonb(registration.*) into old_row;

    if old_row is null then
      raise exception 'Solo registration not found.' using errcode = 'P0002';
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
      'delete_solo_registration',
      'solo_registrations',
      p_target_id::text,
      old_row
    );
  elsif p_operation = 'edit_team' then
    select to_jsonb(team.*)
    into old_row
    from public.teams as team
    where team.id = p_target_id
    for update;

    if old_row is null then
      raise exception 'Team not found.' using errcode = 'P0002';
    end if;

    update public.teams as team
    set team_name = trim(p_payload ->> 'team_name')
    where team.id = p_target_id
    returning to_jsonb(team.*) into new_row;

    changes := public.admin_audit_diff(
      old_row,
      new_row,
      array['team_name']::text[]
    );

    if changes <> '{}'::jsonb then
      insert into public.admin_audit_log (
        actor_id,
        actor_name,
        actor_email,
        action,
        target_table,
        target_id,
        details,
        batch_id
      ) values (
        p_actor_id,
        p_actor_name,
        p_actor_email,
        'edit_team',
        'teams',
        p_target_id::text,
        jsonb_build_object('subject_name', new_row ->> 'team_name') || changes,
        effective_batch_id
      );
    end if;

    for member_payload in
      select value
      from jsonb_array_elements(coalesce(p_payload -> 'members', '[]'::jsonb))
    loop
      member_id := (member_payload ->> 'id')::uuid;

      select to_jsonb(member.*)
      into old_row
      from public.team_members as member
      where member.id = member_id
        and member.team_id = p_target_id
      for update;

      if old_row is null then
        raise exception 'Team member not found.' using errcode = 'P0002';
      end if;

      update public.team_members as member
      set
        full_name = member_payload ->> 'full_name',
        age = (member_payload ->> 'age')::integer,
        location = member_payload ->> 'location',
        phone = member_payload ->> 'phone',
        email = member_payload ->> 'email',
        years_experience = (member_payload ->> 'years_experience')::integer,
        horse_age = (member_payload ->> 'horse_age')::integer,
        horse_breed = member_payload ->> 'horse_breed'
      where member.id = member_id
        and member.team_id = p_target_id
      returning to_jsonb(member.*) into new_row;

      changes := public.admin_audit_diff(old_row, new_row, editable_fields);

      if changes <> '{}'::jsonb then
        insert into public.admin_audit_log (
          actor_id,
          actor_name,
          actor_email,
          action,
          target_table,
          target_id,
          details,
          batch_id
        ) values (
          p_actor_id,
          p_actor_name,
          p_actor_email,
          'edit_team_member',
          'team_members',
          member_id::text,
          jsonb_build_object('subject_name', new_row ->> 'full_name') || changes,
          effective_batch_id
        );
      end if;
    end loop;
  elsif p_operation = 'delete_team' then
    select to_jsonb(team.*)
    into old_row
    from public.teams as team
    where team.id = p_target_id
    for update;

    if old_row is null then
      raise exception 'Team not found.' using errcode = 'P0002';
    end if;

    select count(*)::integer
    into member_count
    from public.team_members as member
    where member.team_id = p_target_id;

    delete from public.teams as team
    where team.id = p_target_id;

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
      'delete_team',
      'teams',
      p_target_id::text,
      jsonb_build_object(
        'team_name', old_row ->> 'team_name',
        'member_count', member_count
      )
    );
  else
    raise exception 'Unsupported admin registration operation.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.admin_set_profile_role(
  p_profile_id uuid,
  p_new_role text,
  p_subject_name text,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_email text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_role text;
begin
  if p_new_role not in ('admin', 'player') then
    raise exception 'Invalid profile role.' using errcode = '22023';
  end if;

  select profile.role
  into old_role
  from public.profiles as profile
  where profile.id = p_profile_id
  for update;

  if old_role is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_new_role
  where id = p_profile_id;

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
    case when p_new_role = 'admin' then 'promote_admin' else 'demote_admin' end,
    'profiles',
    p_profile_id::text,
    jsonb_build_object(
      'subject_name', p_subject_name,
      'old_role', old_role,
      'new_role', p_new_role
    )
  );
end;
$$;

revoke execute on function public.admin_audit_diff(jsonb, jsonb, text[])
  from public, anon, authenticated;
revoke execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.admin_set_profile_role(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.admin_audit_diff(jsonb, jsonb, text[])
  to service_role;
grant execute on function public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)
  to service_role;
grant execute on function public.admin_set_profile_role(uuid, text, text, uuid, text, text)
  to service_role;
