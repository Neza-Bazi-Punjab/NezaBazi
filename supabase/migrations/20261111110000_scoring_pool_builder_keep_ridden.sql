-- Live scoring: the pool builder can add pools to a round that is riding.
--
-- 20261111100000_scoring_pool_builder.sql refused "Save start list" once any
-- run in the round had a result, so a round could not take a Pool B after
-- Pool A had started. This replaces scoring_save_start_list (same name and
-- arguments) so that:
--
--   * a pool that has started riding (any run in it scored, skipped or on
--     course) is KEPT exactly as it is: its runs, results and order are not
--     touched. The layout sent must list it unchanged, at its own letter, or
--     the save is refused ("Pool A has started riding...");
--   * every other pool is written from the layout, as before: new pools,
--     changed pools, pools taken out;
--   * once riding has started, a pool written now gets only the attempt
--     passes the riding has not moved beyond: in Round 2 a new pool rides
--     Rounds 2 and 3, not a Round 1 slot behind the riding (the same rule as
--     a late check-in in Automatic mode, 20261110190000);
--   * a round with no pools that has started riding is refused: add riders
--     with "Add late entrant".
--
-- Before anyone has ridden it behaves exactly as 20261111100000.
--
-- Standalone: it can be run instead of, or after, 20261111100000. Apply after
-- 20261107100000_scoring_round_first_order.sql. Idempotent.
-- Undo with revert/20261111110000_scoring_pool_builder_keep_ridden.revert.sql.

-- 0. Preconditions -----------------------------------------------------------

do $preconditions$
begin
  if pg_catalog.to_regprocedure('public.scoring_renumber_round(uuid)') is null
     or pg_catalog.to_regprocedure('public.scoring_lock_live()') is null
     or pg_catalog.to_regprocedure('public.scoring_pool_label(integer)') is null
     or pg_catalog.to_regprocedure('public.scoring_pool_index(text)') is null then
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

-- 1. Save a start list, keeping pools that have started ---------------------

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
  v_started boolean;
  v_first_attempt integer := 1;
  v_locked text[] := '{}'::text[];
  v_locked_label text;
  v_existing text[];
  v_sent text[];
  v_attempt integer;
  v_position integer;
  v_run_order integer;
  v_runs_created integer := 0;
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

  -- Has riding started? Pools with any run that is not pending are kept.
  select
    count(*) > 0,
    coalesce(max(run.attempt_number), 1)
  into v_started, v_first_attempt
  from public.scoring_runs as run
  where run.round_id = p_round_id
    and run.status <> 'pending';

  if v_started then
    if v_round.pool_size is null then
      raise exception 'Riding has started in this round and it has no pools: add riders with Add late entrant.'
        using errcode = '22023';
    end if;

    select coalesce(array_agg(distinct run.pool_label), '{}'::text[])
    into v_locked
    from public.scoring_runs as run
    where run.round_id = p_round_id
      and run.status <> 'pending'
      and run.pool_label is not null;
  else
    v_first_attempt := 1;
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

  -- Every pool that has started must be sent unchanged, at its own letter.
  foreach v_locked_label in array v_locked loop
    v_pool_index := public.scoring_pool_index(v_locked_label);

    select coalesce(array_agg(first_run.entrant_key order by first_run.first_order), '{}'::text[])
    into v_existing
    from (
      select run.entrant_key, min(run.run_order) as first_order
      from public.scoring_runs as run
      where run.round_id = p_round_id
        and run.pool_label = v_locked_label
      group by run.entrant_key
    ) as first_run;

    if v_pool_index is null or v_pool_index >= v_pool_count then
      v_sent := '{}'::text[];
    else
      select coalesce(array_agg(lower(entry.value) order by entry.ordinality), '{}'::text[])
      into v_sent
      from jsonb_array_elements_text(p_pools -> v_pool_index) with ordinality as entry(value, ordinality);
    end if;

    if v_sent is distinct from v_existing then
      raise exception 'Pool % has started riding: it must stay as it is. Refresh and try again.', v_locked_label
        using errcode = '22023';
    end if;
  end loop;

  v_entrant_count := coalesce(array_length(v_keys, 1), 0);

  -- The live pointer must not point at a run that is about to be replaced.
  if v_live.current_round_id = p_round_id then
    if v_live.current_run_id is not null and exists (
      select 1
      from public.scoring_runs as run
      where run.id = v_live.current_run_id
        and not coalesce(run.pool_label = any(v_locked), false)
    ) then
      update public.scoring_live_state as live
      set current_run_id = null
      where live.id is true;
    end if;

    if v_live.called_pool_label is not null
       and not coalesce(v_live.called_pool_label = any(v_locked), false) then
      update public.scoring_live_state as live
      set
        called_pool_label = null,
        display_mode = case when live.display_mode = 'pool_call' then 'scoreboard' else live.display_mode end
      where live.id is true;
    end if;
  end if;

  delete from public.scoring_runs as run
  where run.round_id = p_round_id
    and not coalesce(run.pool_label = any(v_locked), false);

  get diagnostics v_runs_replaced = row_count;

  -- New runs go after every kept run; the renumber at the end lays the list
  -- out round by round.
  select coalesce(max(run.run_order), 0)
  into v_run_order
  from public.scoring_runs as run
  where run.round_id = p_round_id;

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

    -- A pool that has started is kept as it is.
    continue when coalesce(v_label = any(v_locked), false);

    for v_attempt in v_first_attempt .. v_round.attempts_per_rider loop
      for v_position in 0 .. v_pool_size - 1 loop
        v_id := substr(lower(v_pool ->> v_position), 6)::uuid;

        if v_round.event_type = 'single' then
          select registration.id, registration.full_name, registration.horse_name, registration.location
          into v_solo
          from public.solo_registrations as registration
          where registration.id = v_id;

          v_run_order := v_run_order + 1;
          v_runs_created := v_runs_created + 1;

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
            v_runs_created := v_runs_created + 1;

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
      'pools_kept', to_jsonb(v_locked),
      'first_attempt', v_first_attempt,
      'runs', v_runs_created,
      'runs_replaced', v_runs_replaced
    )
  );

  return v_runs_created;
end;
$$;

revoke execute on function public.scoring_save_start_list(uuid, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scoring_save_start_list(uuid, jsonb, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
