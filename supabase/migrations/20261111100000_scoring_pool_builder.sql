-- Live scoring: save a start list built by hand (the pool builder).
--
-- On /admin/scoring an administrator can now build a round's pools by tapping
-- entrants in riding order: each tap puts the entrant next in the current
-- pool, and "New pool" starts the next letter, so pools can be any size.
-- "Save start list" sends the whole layout here and every run is written in
-- one transaction, instead of one click per rider through
-- scoring_set_entrant_pool and scoring_move_run.
--
--   scoring_save_start_list(round_id, pools, actor...)
--
--     pools  a JSON array of pools in riding order, each a JSON array of
--            entrant keys in riding order:
--              [["solo:<uuid>", "solo:<uuid>"], ["solo:<uuid>"]]
--            A round with no pool size takes exactly one pool, saved with no
--            pool letter; otherwise the pools are lettered A, B, C... in the
--            order given.
--
--   Refused when any run in the round has a result (clear the results
--   first), when an entrant is of the other event type, is listed twice or
--   no longer exists, and when a team has no riders.
--
--   The runs are made exactly as scoring_build_start_list makes them: every
--   attempt for every entrant, a team's four riders in the draw's order
--   (leader first), pool_label, entrant_key and the display snapshot; then
--   scoring_renumber_round lays them out Round 1 for every pool, then Round
--   2, then Round 3 (20261107100000). Judges, /live and vMix see a normal
--   start list. Like the draw, a saved list replaces the current one, and the
--   live pointer is taken off this round's runs first.
--
-- Check-in is not required (the administrator is choosing who rides, as with
-- the late-entrant tool); the audit row counts any entrant not checked in.
--
-- Apply after 20261107100000_scoring_round_first_order.sql (any time after the
-- other scoring migrations). Idempotent: a second run changes nothing.
-- Undo with revert/20261111100000_scoring_pool_builder.revert.sql.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_renumber_round(uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_lock_live()') is null
     or pg_catalog.to_regprocedure('public.scoring_pool_label(integer)') is null then
    raise exception 'Live scoring is not applied: run 20261025120000_live_scoring.sql first.';
  end if;

  if position(
    'public.scoring_pool_index(inner_run.pool_label)'
    in pg_catalog.pg_get_functiondef('public.scoring_renumber_round(uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Apply 20261107100000_scoring_round_first_order.sql first.';
  end if;
end
$preconditions$;

-- 1. Save a start list -------------------------------------------------------

create or replace function public.scoring_save_start_list(
  p_round_id uuid,
  p_pools jsonb,
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
  v_live public.scoring_live_state%rowtype;
  v_round public.scoring_rounds%rowtype;
  v_prefix text;
  v_pool_count integer;
  v_pool_index integer;
  v_pool jsonb;
  v_pool_size integer;
  v_label text;
  v_key text;
  v_id uuid;
  v_keys text[] := '{}'::text[];
  v_entrant_count integer;
  v_not_checked_in integer := 0;
  v_attempt integer;
  v_position integer;
  v_run_order integer := 0;
  v_runs_replaced integer := 0;
  v_pools jsonb := '{}'::jsonb;
  v_solo record;
  v_member record;
begin
  v_live := public.scoring_lock_live();

  select * into v_round
  from public.scoring_rounds as round
  where round.id = p_round_id
  for update;

  if not found then
    raise exception 'That round no longer exists.' using errcode = 'P0002';
  end if;

  perform 1
  from public.scoring_runs as run
  where run.round_id = p_round_id
  order by run.run_order
  for update;

  if exists (
    select 1
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.status = 'scored'
  ) then
    raise exception 'This round already has results. Clear results before saving a new start list.'
      using errcode = '22023';
  end if;

  -- The shape: a non-empty array of non-empty arrays of entrant keys.
  if p_pools is null or jsonb_typeof(p_pools) <> 'array' or jsonb_array_length(p_pools) = 0 then
    raise exception 'Put at least one rider in the start list.' using errcode = '22023';
  end if;

  v_pool_count := jsonb_array_length(p_pools);

  if v_round.pool_size is null and v_pool_count <> 1 then
    raise exception 'This round has no pools: save one list.' using errcode = '22023';
  end if;

  if v_pool_count > 52 then
    raise exception 'At most 52 pools.' using errcode = '22023';
  end if;

  v_prefix := case when v_round.event_type = 'single' then 'solo:' else 'team:' end;

  for v_pool_index in 0 .. v_pool_count - 1 loop
    v_pool := p_pools -> v_pool_index;

    if jsonb_typeof(v_pool) <> 'array' or jsonb_array_length(v_pool) = 0 then
      raise exception 'Pool % is empty.', public.scoring_pool_label(v_pool_index)
        using errcode = '22023';
    end if;

    for v_position in 0 .. jsonb_array_length(v_pool) - 1 loop
      if jsonb_typeof(v_pool -> v_position) <> 'string' then
        raise exception 'One of the entrants is not recognised. Refresh and try again.'
          using errcode = '22023';
      end if;

      v_key := lower(v_pool ->> v_position);

      if v_key !~ '^(solo|team):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'One of the entrants is not recognised. Refresh and try again.'
          using errcode = '22023';
      end if;

      if left(v_key, 5) <> v_prefix then
        raise exception '%',
          case when v_round.event_type = 'single'
            then 'This is a Single round: it takes solo riders only.'
            else 'This is a Section round: it takes teams only.'
          end
          using errcode = '22023';
      end if;

      if v_key = any(v_keys) then
        raise exception 'An entrant is in the start list twice.' using errcode = '22023';
      end if;

      v_id := substr(v_key, 6)::uuid;

      if v_round.event_type = 'single' then
        select registration.id, registration.full_name, registration.checked_in_at
        into v_solo
        from public.solo_registrations as registration
        where registration.id = v_id;

        if not found then
          raise exception 'A rider in the list is no longer registered. Refresh and try again.'
            using errcode = 'P0002';
        end if;

        if v_solo.checked_in_at is null then
          v_not_checked_in := v_not_checked_in + 1;
        end if;
      else
        if not exists (select 1 from public.teams as team where team.id = v_id) then
          raise exception 'A team in the list is no longer registered. Refresh and try again.'
            using errcode = 'P0002';
        end if;

        if not exists (
          select 1 from public.team_members as member where member.team_id = v_id
        ) then
          raise exception 'A team in the list has no riders.' using errcode = '22023';
        end if;

        if exists (
          select 1
          from public.team_members as member
          where member.team_id = v_id
            and member.checked_in_at is null
        ) then
          v_not_checked_in := v_not_checked_in + 1;
        end if;
      end if;

      v_keys := v_keys || v_key;
    end loop;
  end loop;

  v_entrant_count := coalesce(array_length(v_keys, 1), 0);

  -- The live pointer must not point into a start list that is being replaced.
  if v_live.current_round_id = p_round_id then
    update public.scoring_live_state as live
    set
      current_run_id = null,
      called_pool_label = null,
      display_mode = case when live.display_mode = 'pool_call' then 'scoreboard' else live.display_mode end
    where live.id is true;
  end if;

  delete from public.scoring_runs as run
  where run.round_id = p_round_id;

  get diagnostics v_runs_replaced = row_count;

  -- Pool by pool, attempt by attempt, as scoring_build_start_list does; the
  -- renumber at the end lays the list out round by round.
  for v_pool_index in 0 .. v_pool_count - 1 loop
    v_pool := p_pools -> v_pool_index;
    v_pool_size := jsonb_array_length(v_pool);
    v_label := case
      when v_round.pool_size is null then null
      else public.scoring_pool_label(v_pool_index)
    end;

    if v_label is not null then
      v_pools := v_pools || jsonb_build_object(v_label, v_pool_size);
    end if;

    for v_attempt in 1 .. v_round.attempts_per_rider loop
      for v_position in 0 .. v_pool_size - 1 loop
        v_id := substr(lower(v_pool ->> v_position), 6)::uuid;

        if v_round.event_type = 'single' then
          select registration.id, registration.full_name, registration.horse_name, registration.location
          into v_solo
          from public.solo_registrations as registration
          where registration.id = v_id;

          v_run_order := v_run_order + 1;

          insert into public.scoring_runs (
            round_id,
            run_order,
            attempt_number,
            pool_label,
            solo_registration_id,
            entrant_key,
            rider_name,
            horse_name,
            team_name,
            rider_location
          ) values (
            p_round_id,
            v_run_order,
            v_attempt,
            v_label,
            v_solo.id,
            'solo:' || v_solo.id::text,
            btrim(v_solo.full_name),
            nullif(btrim(v_solo.horse_name), ''),
            null,
            nullif(btrim(v_solo.location), '')
          );
        else
          for v_member in
            select
              member.id,
              member.team_id,
              member.full_name,
              member.horse_name,
              member.location,
              team.team_name
            from public.team_members as member
            join public.teams as team on team.id = member.team_id
            where member.team_id = v_id
            order by member.is_leader desc nulls last, member.created_at asc, member.id asc
          loop
            v_run_order := v_run_order + 1;

            insert into public.scoring_runs (
              round_id,
              run_order,
              attempt_number,
              pool_label,
              team_member_id,
              team_id,
              entrant_key,
              rider_name,
              horse_name,
              team_name,
              rider_location
            ) values (
              p_round_id,
              v_run_order,
              v_attempt,
              v_label,
              v_member.id,
              v_member.team_id,
              'team:' || v_member.team_id::text,
              btrim(v_member.full_name),
              nullif(btrim(v_member.horse_name), ''),
              nullif(btrim(v_member.team_name), ''),
              nullif(btrim(v_member.location), '')
            );
          end loop;
        end if;
      end loop;
    end loop;
  end loop;

  -- Round 1 for every pool, then Round 2, then Round 3 (20261107100000).
  perform public.scoring_renumber_round(p_round_id);

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
    'save_start_list',
    'scoring_runs',
    p_round_id::text,
    jsonb_build_object(
      'subject_name', v_round.name,
      'entrants', v_entrant_count,
      'not_checked_in', v_not_checked_in,
      'pools', v_pools,
      'runs', v_run_order,
      'runs_replaced', v_runs_replaced
    )
  );

  return v_run_order;
end;
$$;

revoke execute on function public.scoring_save_start_list(uuid, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_save_start_list(uuid, jsonb, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
