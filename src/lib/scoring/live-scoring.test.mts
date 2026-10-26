import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { balancedPoolSizes, poolLabelForIndex } from "./types.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const scoring = repoFile("supabase/migrations/20261025120000_live_scoring.sql");
const roles = repoFile("supabase/migrations/20261025110000_staff_roles.sql");

const TABLES = [
  "scoring_rounds",
  "scoring_runs",
  "scoring_live_state",
  "scoring_advance_overrides",
] as const;

/* Every function the routes call, with its exact signature. */
const PUBLIC_FUNCTIONS: Array<[string, string]> = [
  ["scoring_record_result", "uuid, text, boolean, uuid, text, text"],
  ["scoring_call_pool", "uuid, text, uuid, text, text"],
  ["scoring_clear_result", "uuid, boolean, uuid, text, text"],
  ["scoring_set_run_status", "uuid, text, uuid, text, text"],
  ["scoring_set_live", "jsonb, uuid, text, text"],
  ["scoring_upsert_round", "uuid, jsonb, uuid, text, text"],
  ["scoring_delete_round", "uuid, boolean, uuid, text, text"],
  ["scoring_build_start_list", "uuid, text, uuid, text, text"],
  ["scoring_clear_start_list", "uuid, boolean, uuid, text, text"],
  ["scoring_add_entrant", "uuid, uuid, uuid, uuid, text, text"],
  ["scoring_remove_entrant", "uuid, text, uuid, text, text"],
  ["scoring_move_run", "uuid, integer, uuid, text, text"],
  ["scoring_set_entrant_pool", "uuid, text, text, uuid, text, text"],
  ["scoring_set_advance_override", "uuid, text, boolean, text, uuid, text, text"],
];

/* Internal helpers: not callable by any client role, but executable by
   service_role because the security-invoker callers run as it. */
const HELPER_FUNCTIONS: Array<[string, string]> = [
  ["scoring_pool_label", "integer"],
  ["scoring_pool_index", "text"],
  ["scoring_json_int", "jsonb, text, integer, integer"],
  ["scoring_json_uuid", "jsonb, text"],
  ["scoring_entrant_name", "uuid, text"],
  ["scoring_lock_live", ""],
  ["scoring_renumber_round", "uuid"],
  ["scoring_advance_live_pointer", "uuid, integer"],
  ["scoring_restore_auto_voided", "uuid"],
];

const TRIGGER_FUNCTIONS = ["scoring_set_updated_at", "scoring_runs_before_insert"];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* The body of one function, from its `create or replace` to the closing $$. */
const functionBody = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} is defined`);
  const bodyStart = sql.indexOf("as $$", start);
  const end = sql.indexOf("\n$$;", bodyStart);
  assert.ok(bodyStart > start && end > bodyStart, `${name} has a $$ body`);
  return sql.slice(start, end);
};

test("the four scoring tables exist, idempotently, with RLS enabled", () => {
  for (const table of TABLES) {
    assert.match(scoring, new RegExp(`create table if not exists public\\.${table} \\(`));
    assert.match(scoring, new RegExp(`alter table public\\.${table} enable row level security;`));
  }

  assert.match(
    scoring,
    /insert into public\.scoring_live_state \(id\) values \(true\) on conflict do nothing;/
  );
});

test("a solo rider cannot be given two runs for the same attempt", () => {
  assert.match(
    scoring,
    /unique nulls not distinct \(round_id, entrant_key, team_member_id, attempt_number\)/
  );
  assert.match(scoring, /constraint scoring_runs_round_order_key unique \(round_id, run_order\)/);
  assert.match(scoring, /check \(\(status = 'scored'\) = \(result is not null\)\)/);
  assert.match(scoring, /check \(num_nonnulls\(solo_registration_id, team_member_id\) = 1\)/);
});

test("points are computed by the database, never sent by a client", () => {
  assert.match(
    scoring,
    /points integer generated always as \(\s*case result when 'carry' then 4 when 'strike' then 2 when 'miss' then 0 else null end\s*\) stored/
  );
});

test("clients can read the scoring tables and nothing more", () => {
  for (const table of TABLES) {
    assert.match(
      scoring,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated;`)
    );
  }

  // Every grant to a client role is a SELECT.
  const clientGrants = [...scoring.matchAll(/^grant ([^;]+?) to ([^;]+);/gim)].filter(
    ([, , grantees]) => /\b(anon|authenticated)\b/.test(grantees)
  );
  assert.ok(clientGrants.length >= 5);

  for (const [statement, privileges] of clientGrants) {
    assert.match(privileges, /^select\b/i, statement);
    assert.doesNotMatch(privileges, /\b(insert|update|delete|truncate|all)\b/i, statement);
  }

  // Policies are SELECT only; no client write policy exists.
  const policies = [...scoring.matchAll(/create policy "[^"]+"\s+on public\.scoring_\w+ for (\w+)/g)];
  assert.equal(policies.length, 4);

  for (const [, command] of policies) {
    assert.equal(command, "select");
  }

  // The public may see that an override exists, not the administrator's note.
  assert.match(
    scoring,
    /grant select \(round_id, entrant_key, advanced, updated_at\)\s+on table public\.scoring_advance_overrides to anon, authenticated;/
  );
});

test("the leaderboard view runs with the caller's privileges", () => {
  assert.match(
    scoring,
    /create or replace view public\.scoring_leaderboard\s+with \(security_invoker = true\)/
  );
  assert.match(scoring, /grant select on table public\.scoring_leaderboard to anon, authenticated;/);
});

test("advanced follows the spec: override wins, a Single carry is through at once, undecided is null", () => {
  const advanced = scoring.slice(scoring.indexOf("    when named.advanced_overridden then"));
  const lines = advanced.slice(0, advanced.indexOf("end as advanced")).trim().split("\n").map((line) => line.trim());

  assert.deepEqual(lines, [
    "when named.advanced_overridden then named.override_advanced",
    "when named.event_type = 'single' and named.best_result = 'carry' then true",
    "when named.runs_scored < named.runs_total then null",
    "when named.event_type = 'single' then false",
    "when named.target_points is null then null",
    "else named.points >= named.target_points",
  ]);
});

test("every scoring function is service-role only, with its revoke/grant pair", () => {
  for (const [name, signature] of [...PUBLIC_FUNCTIONS, ...HELPER_FUNCTIONS]) {
    const call = `public\\.${name}\\(${escape(signature)}\\)`;
    assert.match(
      scoring,
      new RegExp(`revoke execute on function ${call}\\s+from public, anon, authenticated;`),
      `${name} revoke`
    );
    assert.match(
      scoring,
      new RegExp(`grant execute on function ${call}\\s+to service_role;`),
      `${name} grant`
    );
  }

  for (const name of TRIGGER_FUNCTIONS) {
    assert.match(
      scoring,
      new RegExp(`revoke execute on function public\\.${name}\\(\\) from public, anon, authenticated;`)
    );
    assert.doesNotMatch(scoring, new RegExp(`grant execute on function public\\.${name}\\(`));
  }

  // Nothing is ever granted to a client role.
  assert.doesNotMatch(scoring, /grant execute on function[^;]+to (anon|authenticated)/);

  // Every function in the file is accounted for above.
  const defined = [...scoring.matchAll(/create or replace function public\.(\w+)\(/g)].map(
    ([, name]) => name
  );
  assert.deepEqual(
    [...defined].sort(),
    [
      ...PUBLIC_FUNCTIONS.map(([name]) => name),
      ...HELPER_FUNCTIONS.map(([name]) => name),
      ...TRIGGER_FUNCTIONS,
    ].sort()
  );
});

test("every scoring function is security invoker with an empty search_path", () => {
  for (const [name] of [...PUBLIC_FUNCTIONS, ...HELPER_FUNCTIONS]) {
    const body = functionBody(scoring, name);
    assert.match(body, /\bsecurity invoker\b/, name);
    assert.match(body, /set search_path = ''/, name);
    assert.doesNotMatch(body, /security definer/, name);
  }
});

test("every write records its audit row in the same transaction, with a subject", () => {
  for (const [name] of PUBLIC_FUNCTIONS) {
    const body = functionBody(scoring, name);
    const inserts = body.match(/insert into public\.admin_audit_log/g) ?? [];
    assert.equal(inserts.length, 1, `${name} writes one audit row`);
    assert.match(body, /'subject_name'/, name);
    assert.match(body, /p_actor_id uuid,\s+p_actor_name text,\s+p_actor_email text\s*\)/, name);
  }
});

test("functions lock before they change runs, and use the human errcodes", () => {
  for (const [name] of PUBLIC_FUNCTIONS.filter(([name]) => name !== "scoring_upsert_round")) {
    assert.match(functionBody(scoring, name), /for update/, `${name} locks`);
  }

  for (const name of ["scoring_record_result", "scoring_clear_result", "scoring_set_run_status"]) {
    const body = functionBody(scoring, name);
    assert.match(body, /using errcode = 'P0002'/, name);
    assert.match(body, /using errcode = '22023'/, name);
  }

  assert.match(
    functionBody(scoring, "scoring_record_result"),
    /This run already has a result\. Use Change result to replace it\./
  );
});

test("undo can bring the rider back on course in the same transaction", () => {
  const body = functionBody(scoring, "scoring_clear_result");
  assert.match(body, /p_make_current boolean,/);
  assert.match(body, /current_run_id = p_run_id/);
  assert.match(body, /'make_current', v_make_current/);
  // The draft signature is dropped so no stale overload survives.
  assert.match(
    scoring,
    /drop function if exists public\.scoring_clear_result\(uuid, uuid, text, text\);/
  );
});

test("renumbering is two-phase so the unique run order never trips", () => {
  const body = functionBody(scoring, "scoring_renumber_round");
  const phases = body.match(/update public\.scoring_runs as run/g) ?? [];
  assert.equal(phases.length, 2);
  assert.match(body, /set run_order = run\.run_order \+ v_shift/);
  assert.match(body, /public\.scoring_pool_index\(inner_run\.pool_label\) asc nulls first/);
});

test("the draw splits pools the same way balancedPoolSizes does", () => {
  const body = functionBody(scoring, "scoring_build_start_list");
  assert.match(body, /ceil\(v_entrant_count::numeric \/ v_round\.pool_size\)::integer/);
  assert.match(body, /v_base_size := v_entrant_count \/ v_pool_count;/);
  assert.match(body, /v_remainder := v_entrant_count % v_pool_count;/);
  assert.match(body, /v_base_size \+ case when v_pool_index < v_remainder then 1 else 0 end/);
  assert.match(body, /order by random\(\)/);
  assert.match(body, /Clear results before redrawing\./);
  // Leader first, then registration order.
  assert.match(body, /order by member\.is_leader desc nulls last, member\.created_at asc/);

  // The reference implementation the SQL mirrors.
  assert.deepEqual(balancedPoolSizes(25, 10), [9, 8, 8]);
  assert.deepEqual(balancedPoolSizes(20, 10), [10, 10]);
  assert.deepEqual(balancedPoolSizes(5, 2), [2, 2, 1]);
  assert.equal(poolLabelForIndex(0), "A");
  assert.equal(poolLabelForIndex(25), "Z");
  assert.equal(poolLabelForIndex(26), "AA");
});

test("the realtime publication is guarded and idempotent", () => {
  const block = scoring.slice(scoring.indexOf("do $realtime$"));
  assert.match(block, /from pg_catalog\.pg_publication where pubname = 'supabase_realtime'/);
  assert.match(block, /puballtables/);
  assert.match(block, /from pg_catalog\.pg_publication_tables/);
  assert.match(block, /alter publication supabase_realtime add table public\.%I/);
  assert.match(block, /array\['scoring_rounds', 'scoring_runs', 'scoring_live_state'\]/);
});

test("the scoring migration asserts its preconditions and the order of the files", () => {
  assert.match(scoring, /server_version_num/);
  assert.match(scoring, /apply 20261025110000_staff_roles\.sql first/);
  assert.match(scoring, /Verification \(run by hand after applying/);
});

test("staff roles: four roles, the same audited write path, has_role and read-only headshots", () => {
  // The existing CHECK is discovered, not assumed.
  assert.match(roles, /from pg_catalog\.pg_constraint as con\s+where con\.conrelid = 'public\.profiles'::pg_catalog\.regclass/);
  assert.match(roles, /pg_get_constraintdef\(con\.oid\) ilike '%role%'/);
  assert.match(roles, /check \(role in \('player', 'judge', 'commentator', 'admin'\)\)/);

  const setRole = functionBody(roles, "admin_set_profile_role");
  assert.match(setRole, /p_new_role not in \('player', 'judge', 'commentator', 'admin'\)/);
  assert.match(setRole, /'promote_admin'/);
  assert.match(setRole, /'demote_admin'/);
  assert.match(setRole, /'set_role'/);
  assert.match(setRole, /security invoker/);
  assert.match(
    roles,
    /revoke execute on function public\.admin_set_profile_role\(uuid, text, text, uuid, text, text\)\s+from public, anon, authenticated;/
  );
  assert.match(
    roles,
    /grant execute on function public\.admin_set_profile_role\(uuid, text, text, uuid, text, text\)\s+to service_role;/
  );

  const hasRole = functionBody(roles, "has_role");
  assert.match(hasRole, /variadic p_roles text\[\]/);
  assert.match(hasRole, /security definer/);
  assert.match(hasRole, /set search_path = ''/);
  assert.match(hasRole, /profile\.id = \(select auth\.uid\(\)\)/);
  assert.match(roles, /revoke execute on function public\.has_role\(text\[\]\) from public, anon, authenticated;/);
  assert.match(roles, /grant execute on function public\.has_role\(text\[\]\) to authenticated;/);
  assert.doesNotMatch(roles, /grant execute on function public\.has_role\(text\[\]\) to [^;]*anon/);

  const policy = roles.slice(roles.indexOf('create policy "Staff read every headshot"'));
  assert.match(policy, /on storage\.objects for select/);
  assert.match(policy, /bucket_id = 'rider-headshots'/);
  assert.match(policy, /public\.has_role\('judge', 'commentator', 'admin'\)/);
  assert.doesNotMatch(roles, /create policy "Staff[^"]*"\s+on storage\.objects for (insert|update|delete|all)/);
});

test("a qualifying carry voids the rider's remaining attempts, and undoing it restores them", () => {
  const record = functionBody(scoring, "scoring_record_result");
  assert.match(record, /round\.event_type = 'single' and round\.attempts_per_rider > 1/);
  assert.match(record, /set status = 'void', auto_voided_by = p_run_id/);
  assert.match(record, /run\.status in \('pending', 'on_course'\)/);
  assert.match(record, /'auto_voided', cardinality\(v_auto_voided\)/);
  assert.match(record, /'auto_voided_run_ids', to_jsonb\(v_auto_voided\)/);
  // The pointer moves past a voided attempt that was on course.
  assert.match(record, /elsif v_live\.current_run_id = any \(v_auto_voided\) then/);
  // Changing the carry to another result restores what it voided.
  assert.match(record, /elsif v_previous_result = 'carry' then\s+v_auto_restored := public\.scoring_restore_auto_voided\(p_run_id\);/);

  const clear = functionBody(scoring, "scoring_clear_result");
  assert.match(clear, /v_auto_restored := public\.scoring_restore_auto_voided\(p_run_id\);/);

  const status = functionBody(scoring, "scoring_set_run_status");
  assert.match(status, /set status = 'pending', auto_voided_by = null/);

  assert.match(scoring, /auto_voided_by uuid references public\.scoring_runs\(id\) on delete set null/);
  assert.match(scoring, /check \(auto_voided_by is null or status = 'void'\)/);
});

test("the short-location migration stores district and state only, patched in place", () => {
  const short = repoFile("supabase/migrations/20261026100000_scoring_short_location.sql");

  // Refuses to run before live_scoring.
  assert.match(short, /apply 20261025120000_live_scoring\.sql first/);
  assert.match(short, /pg_catalog\.to_regprocedure\('public\.scoring_runs_before_insert\(\)'\) is null/);

  // The helper: the SQL twin of shortLocation, service-role only.
  const helper = functionBody(short, "scoring_short_location");
  assert.match(helper, /\(p_location text\)\s+returns text\s+language plpgsql\s+immutable\s+strict\s+security invoker\s+set search_path = ''/);
  assert.match(helper, /pg_catalog\.string_to_array\(p_location, ','\)/);
  assert.match(helper, /pg_catalog\.btrim\(part\.value, c_trimmed\)/);
  assert.match(helper, /where split\.trimmed <> ''/);
  assert.match(helper, /elsif v_count <= 2 then\s+return pg_catalog\.array_to_string\(v_parts, ', '\);/);
  assert.match(helper, /pg_catalog\.array_to_string\(v_parts\[v_count - 2 : v_count - 1\], ', '\)/);
  assert.doesNotMatch(helper, /security definer/);
  assert.match(
    short,
    /revoke execute on function public\.scoring_short_location\(text\)\s+from public, anon, authenticated;/
  );
  assert.match(short, /grant execute on function public\.scoring_short_location\(text\)\s+to service_role;/);
  assert.doesNotMatch(short, /grant execute on function[^;]+to (anon|authenticated)/);

  // The trigger is patched from pg_get_functiondef, and its anchor is the
  // assignment live_scoring actually wrote — exactly once.
  const patch = short.slice(short.indexOf("do $patch$"), short.indexOf("$patch$;"));
  const anchor = /\$anchor\$(.*)\$anchor\$/.exec(patch)?.[1];
  const replacement = /\$replacement\$(.*)\$replacement\$/.exec(patch)?.[1];
  assert.equal(
    anchor,
    "new.rider_location := coalesce(nullif(btrim(new.rider_location), ''), nullif(btrim(v_location), ''));"
  );
  assert.equal(
    replacement,
    "new.rider_location := public.scoring_short_location(coalesce(nullif(btrim(new.rider_location), ''), nullif(btrim(v_location), '')));"
  );
  assert.equal(functionBody(scoring, "scoring_runs_before_insert").split(anchor).length - 1, 1);
  assert.match(patch, /pg_catalog\.pg_get_functiondef\(target_function\)/);
  assert.match(patch, /if position\(replacement in definition\) > 0 then\s+raise notice/);
  assert.match(patch, /if occurrences <> 1 then/);
  assert.match(patch, /execute definition;/);
  assert.match(patch, /-- Read the deployed body back rather than trusting the EXECUTE\./);
  assert.match(
    short,
    /revoke execute on function public\.scoring_runs_before_insert\(\) from public, anon, authenticated;/
  );

  // Runs written before the migration are shortened, after the live-state lock.
  const backfill = short.slice(short.indexOf("do $backfill$"), short.indexOf("$backfill$;"));
  assert.ok(backfill.indexOf("for update") < backfill.indexOf("update public.scoring_runs"));
  assert.match(
    backfill,
    /set rider_location = public\.scoring_short_location\(run\.rider_location\)\s+where run\.rider_location is distinct from public\.scoring_short_location\(run\.rider_location\);/
  );

  // The verify block checks the function, the grants, the trigger and the rows.
  const verify = short.slice(short.indexOf("do $verify$"), short.indexOf("$verify$;"));
  assert.match(verify, /proc\.provolatile = 'i'/);
  assert.match(verify, /has_function_privilege\('anon', v_function, 'EXECUTE'\)/);
  assert.match(verify, /has_function_privilege\('authenticated', v_function, 'EXECUTE'\)/);
  assert.match(verify, /position\('new\.rider_location := public\.scoring_short_location\(' in v_definition\) = 0/);
  assert.match(verify, /run\.rider_location like '%,%,%,%'/);

  assert.match(short, /Verification \(run by hand after applying/);
  assert.match(short, /notify pgrst, 'reload schema';\s*$/);
});

test("the staff-roles and paper migrations tell PostgREST to reload", () => {
  const paper = repoFile("supabase/migrations/20261025130000_paper_registrations.sql");

  for (const sql of [roles, paper]) {
    assert.match(sql, /notify pgrst, 'reload schema';\s*$/);
  }

  // live_scoring notifies before its commented verification block.
  assert.match(scoring, /^notify pgrst, 'reload schema';$/m);
});
