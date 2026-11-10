import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DAL_PANTH_API,
  DAL_PANTH_MAX_LENGTH,
  DAL_PANTH_MIGRATION,
  DAL_PANTH_NOT_SET_UP,
  normalizeDalPanth,
} from "../../lib/dal-panth.ts";

/* Line endings normalised, so a CRLF checkout pins the same text. */
const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const migration = repoFile("supabase/migrations/20261110100000_rider_dal_panth.sql");
const revert = repoFile("supabase/migrations/revert/20261110100000_rider_dal_panth.revert.sql");
const route = repoFile("src/app/api/admin/dal-panth/route.ts");
const docs = repoFile("docs/supabase-changes.md");

/* The SQL with its `--` comments removed (none of the file's string literals
   contains `--`). */
const migrationCode = migration
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

const functionBody = (name: string) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.ok(start > -1, `${name} is created`);
  return migration.slice(start, migration.indexOf("$$;", migration.indexOf("as $$", start)) + 3);
};

const setBody = functionBody("admin_set_dal_panth");
const syncBody = functionBody("admin_sync_dal_panth");

const SET_SIGNATURE = "public.admin_set_dal_panth(text, text, uuid, text, text)";
const SYNC_SIGNATURE = "public.admin_sync_dal_panth()";

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- The shared contract -----------------------------------------------------

test("the contract names this migration and route", () => {
  assert.equal(DAL_PANTH_MIGRATION, "supabase/migrations/20261110100000_rider_dal_panth.sql");
  assert.equal(DAL_PANTH_API, "/api/admin/dal-panth");
  assert.equal(DAL_PANTH_MAX_LENGTH, 120);
  assert.ok(DAL_PANTH_NOT_SET_UP.includes(DAL_PANTH_MIGRATION));
});

test("normalizeDalPanth: null, blank and whitespace clear the value", () => {
  assert.deepEqual(normalizeDalPanth(null), { ok: true, value: null });
  assert.deepEqual(normalizeDalPanth(undefined), { ok: true, value: null });
  assert.deepEqual(normalizeDalPanth(""), { ok: true, value: null });
  assert.deepEqual(normalizeDalPanth("   "), { ok: true, value: null });
  assert.deepEqual(normalizeDalPanth("\t\n \r\n"), { ok: true, value: null });
});

test("normalizeDalPanth: trims and collapses whitespace runs", () => {
  assert.deepEqual(normalizeDalPanth("  Example Dal  "), { ok: true, value: "Example Dal" });
  assert.deepEqual(normalizeDalPanth("Example \t\n  Dal"), { ok: true, value: "Example Dal" });
  assert.deepEqual(normalizeDalPanth("Example Dal"), { ok: true, value: "Example Dal" });
});

test("normalizeDalPanth: exactly 120 is kept, 121 is refused", () => {
  const exact = "a".repeat(120);
  assert.deepEqual(normalizeDalPanth(exact), { ok: true, value: exact });

  // Surrounding whitespace does not count toward the bound.
  assert.deepEqual(normalizeDalPanth(`  ${exact}  `), { ok: true, value: exact });

  const tooLong = normalizeDalPanth("a".repeat(121));
  assert.equal(tooLong.ok, false);
  assert.equal(!tooLong.ok && tooLong.error, "Dal Panth must be 120 characters or fewer.");
});

test("normalizeDalPanth: anything that is not text is refused", () => {
  for (const value of [0, 1, true, false, {}, [], ["Example Dal"]]) {
    const result = normalizeDalPanth(value);
    assert.equal(result.ok, false, `refuses ${JSON.stringify(value)}`);
    assert.equal(!result.ok && result.error, "Dal Panth must be text.");
  }
});

test("the route's message for too long matches the database's", () => {
  assert.ok(setBody.includes("'Dal Panth must be 120 characters or fewer.'"));
  const tooLong = normalizeDalPanth("a".repeat(121));
  assert.ok(!tooLong.ok && setBody.includes(`'${tooLong.error}'`));
});

// --- The migration -----------------------------------------------------------

test("the migration adds no-op-safe, nullable columns with length checks", () => {
  for (const table of ["solo_registrations", "team_members"]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table}\\s+add column if not exists dal_panth text;`)
    );

    const constraint = `${table}_dal_panth_length`;
    // Added only when missing, so a second run is a no-op.
    assert.match(
      migration,
      new RegExp(`conname = '${constraint}'\\s+\\) then\\s+alter table public\\.${table}\\s+add constraint ${constraint}`)
    );
    assert.match(
      migration,
      new RegExp(
        `add constraint ${constraint}\\s+check \\(\\s+dal_panth is null\\s+or char_length\\(btrim\\(dal_panth\\)\\) between 1 and 120\\s+\\)`
      )
    );

    assert.match(
      migration,
      new RegExp(`grant select \\(dal_panth\\) on public\\.${table} to authenticated;`)
    );
  }

  assert.doesNotMatch(migrationCode, /not null default|set not null|dal_panth text not null/i);
  assert.doesNotMatch(migrationCode, /add constraint [a-z_]+ unique/i);
});

test("the migration grants no INSERT or UPDATE on dal_panth", () => {
  assert.doesNotMatch(migrationCode, /grant\s+(insert|update)/i);
  assert.doesNotMatch(migrationCode, /grant\s+all/i);
  assert.doesNotMatch(migrationCode, /grant[^;]*\(dal_panth\)[^;]*\b(insert|update)\b/i);
});

test("the migration patches, drops, recreates and calls no existing function", () => {
  for (const name of [
    "admin_mutate_registration",
    "admin_find_rider_by_code",
    "paper_registration_rider",
    "admin_create_paper_registration",
    "admin_desk_team",
    "admin_set_check_in",
    "assign_confirmation_code",
  ]) {
    assert.ok(!migrationCode.includes(name), `${name} appears outside a comment`);
  }

  assert.doesNotMatch(migrationCode, /drop\s+(function|trigger|table|column|constraint)/i);
  assert.doesNotMatch(migrationCode, /pg_get_functiondef/);
  assert.doesNotMatch(migrationCode, /\bexecute\s+(definition|format|'|\$)/i);
  assert.doesNotMatch(migrationCode, /create\s+(or replace\s+)?trigger/i);
  assert.doesNotMatch(migrationCode, /\bcommit\b|\brollback\b/i);

  // Exactly the two new functions are created.
  assert.deepEqual(
    [...migrationCode.matchAll(/create or replace function (public\.[a-z_]+)\(/g)].map((match) => match[1]),
    ["public.admin_set_dal_panth", "public.admin_sync_dal_panth"]
  );
});

test("both functions are security invoker with an empty search path", () => {
  assert.match(
    setBody,
    /p_code text,\s+p_dal_panth text,\s+p_actor_id uuid,\s+p_actor_name text,\s+p_actor_email text\s+\)\s+returns jsonb\s+language plpgsql\s+security invoker\s+set search_path = ''/
  );
  assert.match(
    syncBody,
    /admin_sync_dal_panth\(\)\s+returns integer\s+language plpgsql\s+security invoker\s+set search_path = ''/
  );

  for (const body of [setBody, syncBody]) {
    assert.doesNotMatch(body, /security definer/i);

    // search_path is empty, so every table read or written is public.*.
    const code = body
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    const targets = [...code.matchAll(/(?<!distinct )\b(?:from|update|join|insert into)\s+([a-z_][a-z_.]*)/gi)].map(
      (match) => match[1]
    );
    assert.ok(targets.length >= 2);
    for (const target of targets) {
      assert.ok(target.startsWith("public."), `${target} is schema-qualified`);
    }
  }
});

test("admin_set_dal_panth finds the rider by code across both tables", () => {
  assert.match(setBody, /normalized_code text := upper\(btrim\(p_code\)\);/);
  assert.match(
    setBody,
    /if normalized_code is null or normalized_code = '' then\s+raise exception 'Rider not found\.' using errcode = 'P0002';/
  );
  assert.match(setBody, /if not found then\s+raise exception 'Rider not found\.' using errcode = 'P0002';/);

  // Blank becomes null after collapsing whitespace.
  assert.match(
    setBody,
    /new_value := nullif\(\s+btrim\(pg_catalog\.regexp_replace\(coalesce\(p_dal_panth, ''\), '\\s\+', ' ', 'g'\)\),\s+''\s+\);/
  );
  assert.match(
    setBody,
    /if char_length\(new_value\) > 120 then\s+raise exception 'Dal Panth must be 120 characters or fewer\.' using errcode = '22023';/
  );

  // The solo entry's name and value first, else the team place's.
  assert.match(setBody, /select 1 as preference, solo\.full_name, solo\.dal_panth/);
  assert.match(setBody, /select 2 as preference, member\.full_name, member\.dal_panth/);
  assert.match(setBody, /order by entry\.preference, entry\.created_at, entry\.id\s+limit 1;/);

  // Rows are locked solo first, then team, before the value is read.
  const lockSolo = setBody.indexOf("from public.solo_registrations as solo\n  where upper(btrim(solo.confirmation_code)) = normalized_code\n  for update;");
  const lockTeam = setBody.indexOf("from public.team_members as member\n  where upper(btrim(member.confirmation_code)) = normalized_code\n  for update;");
  assert.ok(lockSolo > -1 && lockTeam > lockSolo, "solo rows locked, then team rows");
  assert.ok(lockTeam < setBody.indexOf("into rider_name, value_before"));

  // Every error is one the route maps.
  const errcodes = [...setBody.matchAll(/errcode = '([0-9A-Z]{5})'/g)].map((match) => match[1]);
  assert.ok(errcodes.length >= 3);
  assert.deepEqual([...new Set(errcodes)].sort(), ["22023", "P0002"]);
  assert.equal((setBody.match(/raise exception/g) ?? []).length, errcodes.length);
});

test("admin_set_dal_panth updates every entry under the code, only when it differs", () => {
  for (const [table, alias] of [
    ["solo_registrations", "solo"],
    ["team_members", "member"],
  ]) {
    assert.match(
      setBody,
      new RegExp(
        `update public\\.${table} as ${alias}\\s+set dal_panth = new_value\\s+where upper\\(btrim\\(${alias}\\.confirmation_code\\)\\) = normalized_code\\s+and ${alias}\\.dal_panth is distinct from new_value;`
      )
    );
  }

  assert.match(setBody, /get diagnostics solo_updated = row_count;/);
  assert.match(setBody, /get diagnostics team_updated = row_count;/);
});

test("admin_set_dal_panth audits a change once, and an unchanged value not at all", () => {
  const guardAt = setBody.indexOf("if solo_updated + team_updated > 0 then");
  const insertAt = setBody.indexOf("insert into public.admin_audit_log");
  const endIfAt = setBody.indexOf("end if;", insertAt);
  const returnAt = setBody.indexOf("return jsonb_build_object(");

  assert.ok(guardAt > -1 && insertAt > guardAt && endIfAt > insertAt && returnAt > endIfAt);
  assert.equal((setBody.match(/insert into public\.admin_audit_log/g) ?? []).length, 1);

  const audit = setBody.slice(insertAt, endIfAt);
  assert.match(audit, /'set_dal_panth',\s+'registrations',\s+normalized_code,/);
  for (const key of ["subject_name", "confirmation_code", "before", "after", "solo_entries", "team_entries"]) {
    assert.ok(audit.includes(`'${key}',`), `audit details carry ${key}`);
  }
  assert.match(audit, /p_actor_id,\s+p_actor_name,\s+p_actor_email,/);

  const result = setBody.slice(returnAt);
  for (const key of ["confirmation_code", "full_name", "dal_panth", "solo_entries", "team_entries", "changed"]) {
    assert.ok(result.includes(`'${key}',`), `result carries ${key}`);
  }
  assert.match(result, /'changed', solo_updated \+ team_updated > 0/);
});

test("admin_sync_dal_panth fills only empty team places from a solo entry with the code", () => {
  assert.match(syncBody, /update public\.team_members as member\s+set dal_panth = source\.dal_panth/);
  assert.match(syncBody, /from public\.solo_registrations as solo\s+where solo\.dal_panth is not null\s+and solo\.confirmation_code is not null/);
  assert.match(syncBody, /where member\.dal_panth is null\s+and member\.confirmation_code is not null\s+and upper\(btrim\(member\.confirmation_code\)\) = source\.code_key;/);
  assert.match(syncBody, /upper\(btrim\(solo\.confirmation_code\)\) as code_key/);
  assert.match(syncBody, /get diagnostics filled = row_count;\s+return filled;/);
  assert.doesNotMatch(syncBody, /admin_audit_log/);
  assert.doesNotMatch(syncBody, /update public\.solo_registrations/);
});

test("execute is revoked from the browser roles and granted to the service role", () => {
  for (const signature of [SET_SIGNATURE, SYNC_SIGNATURE]) {
    const escaped = escapeForRegExp(signature);
    const revokeMatch = new RegExp(`revoke execute on function ${escaped}\\s+from public, anon, authenticated;`).exec(migration);
    const grantMatch = new RegExp(`grant execute on function ${escaped}\\s+to service_role;`).exec(migration);
    assert.ok(revokeMatch, `${signature} revoked`);
    assert.ok(grantMatch && grantMatch.index > revokeMatch.index, `${signature} granted after the revoke`);

    const name = signature.slice("public.".length, signature.indexOf("("));
    assert.ok(revokeMatch.index > migration.indexOf(`create or replace function public.${name}(`));
  }
});

test("the verification block checks every piece and fails loudly", () => {
  const verify = migration.slice(migration.indexOf("do $verify$"), migration.indexOf("$verify$;"));
  assert.ok(verify.length > 0);

  assert.match(verify, /attname = 'dal_panth'/);
  assert.match(verify, /not attnotnull/);
  assert.match(verify, /conname = target_table \|\| '_dal_panth_length'/);
  assert.match(
    verify,
    /if not pg_catalog\.has_column_privilege\(\s+'authenticated', 'public\.' \|\| target_table, 'dal_panth', 'SELECT'\s+\) then\s+raise exception/
  );
  // No column UPDATE: the check raises when the privilege IS held.
  assert.match(
    verify,
    /if pg_catalog\.has_column_privilege\(\s+'authenticated', 'public\.' \|\| target_table, 'dal_panth', 'UPDATE'\s+\) then\s+raise exception/
  );
  assert.ok(verify.includes(`'${SET_SIGNATURE}'`));
  assert.ok(verify.includes(`'${SYNC_SIGNATURE}'`));
  assert.match(verify, /if pg_catalog\.to_regprocedure\(target_function\) is null then\s+raise exception/);
  assert.match(
    verify,
    /if pg_catalog\.has_function_privilege\('anon', target_function, 'EXECUTE'\)\s+or pg_catalog\.has_function_privilege\('authenticated', target_function, 'EXECUTE'\)\s+then\s+raise exception/
  );
  assert.match(
    verify,
    /if not pg_catalog\.has_function_privilege\('service_role', target_function, 'EXECUTE'\) then\s+raise exception/
  );
  assert.match(verify, /foreach target_table in array array\['solo_registrations', 'team_members'\]/);
});

test("the migration checks its preconditions and reloads the schema last", () => {
  const pre = migration.slice(migration.indexOf("do $precondition$"), migration.indexOf("$precondition$;"));
  assert.match(pre, /array\['solo_registrations', 'team_members', 'admin_audit_log'\]/);
  assert.match(pre, /array\['id', 'confirmation_code', 'full_name', 'created_at'\]/);
  assert.match(pre, /raise exception/);
  assert.ok(migration.indexOf("do $precondition$") < migration.indexOf("alter table"));

  assert.equal(migration.trimEnd().split(/\r?\n/).at(-1), "notify pgrst, 'reload schema';");
  assert.ok(migration.includes("supabase/migrations/revert/20261110100000_rider_dal_panth.revert.sql"));
});

test("the undo refuses while values are stored, then removes everything", () => {
  const refuseAt = revert.indexOf("if stored_solo + stored_team > 0 then");
  assert.ok(refuseAt > -1);
  assert.match(revert, /raise exception 'Dal Panth is still stored for % solo entries and % team places\. Export both lists to Excel first/);

  for (const statement of [
    `drop function if exists ${SET_SIGNATURE};`,
    `drop function if exists ${SYNC_SIGNATURE};`,
    "drop constraint if exists solo_registrations_dal_panth_length;",
    "drop constraint if exists team_members_dal_panth_length;",
    "alter table public.solo_registrations drop column if exists dal_panth;",
    "alter table public.team_members drop column if exists dal_panth;",
  ]) {
    const at = revert.indexOf(statement);
    assert.ok(at > refuseAt, `${statement} comes after the refusal`);
  }

  assert.equal(revert.trimEnd().split(/\r?\n/).at(-1), "notify pgrst, 'reload schema';");
});

// --- The route ---------------------------------------------------------------

test("the route checks the administrator before anything else", () => {
  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /export async function PATCH\(request: Request\)/);
  assert.doesNotMatch(route, /export async function (GET|POST|PUT|DELETE)/);

  const handler = route.slice(route.indexOf("export async function PATCH"));
  const adminAt = handler.indexOf("await verifyAdminRequest()");
  assert.ok(adminAt > -1);
  for (const later of ["readJsonBody(", "createServiceRoleClient()", "normalizeDalPanth("]) {
    assert.ok(handler.indexOf(later) > adminAt, `${later} after the admin check`);
  }
  assert.match(handler, /if \(!adminCheck\.ok\) \{\s+return noStore\(adminCheck\.response\);/);
});

test("the route reads a small body and validates code and dal_panth", () => {
  assert.match(route, /const MAX_BODY_BYTES = 4 \* 1024;/);
  assert.match(route, /readJsonBody\(request, MAX_BODY_BYTES\)/);
  assert.match(route, /const CODE_MAX_LENGTH = 32;/);
  assert.match(route, /"Please provide a rider's code and a Dal Panth\."/);
  assert.match(route, /const normalized = normalizeDalPanth\(parsed\.dalPanth\);/);
  assert.match(route, /if \(!normalized\.ok\) \{\s+return json\(\{ error: normalized\.error \}, 400\);/);
});

test("the actor comes only from the verified session", () => {
  assert.match(route, /rpc\("admin_set_dal_panth", \{/);
  assert.match(route, /p_code: parsed\.code,/);
  assert.match(route, /p_dal_panth: normalized\.value,/);
  assert.match(route, /p_actor_id: adminCheck\.actor\.id,/);
  assert.match(route, /p_actor_name: adminCheck\.actor\.name,/);
  assert.match(route, /p_actor_email: adminCheck\.actor\.email,/);
  assert.doesNotMatch(route, /body\.body\.(actor|p_actor)|record\.actor/);
});

test("the route maps database errors as the spec says", () => {
  assert.match(route, /code === "P0002"\) \{\s+return json\(\{ error: error\.message \|\| "Rider not found\." \}, 404\);/);
  assert.match(route, /code === "22023"\) \{\s+return json\(\{ error: error\.message \|\| BAD_REQUEST \}, 400\);/);
  assert.match(route, /const NOT_SET_UP_CODES = new Set\(\["PGRST202", "42883", "42703"\]\);/);
  assert.match(route, /NOT_SET_UP_CODES\.has\(code\)\) \{\s+return json\(\{ error: DAL_PANTH_NOT_SET_UP \}, 503\);/);
  assert.match(route, /"Could not save the Dal Panth\. Nothing was changed\. Try again\."/);
  assert.match(route, /console\.error\("Dal Panth save failed", error\);\s+return json\(\{ error: SAVE_FAILED \}, 500\);/);
});

test("the route builds its reply field by field and never caches", () => {
  assert.match(route, /const NO_STORE = \{ "Cache-Control": "private, no-store" \};/);
  assert.match(route, /NextResponse\.json\(body, \{ status, headers: NO_STORE \}\)/);
  // Every response goes through json() or noStore().
  assert.doesNotMatch(route.replace(/const json = [^\n]+/, ""), /NextResponse\.json\(/);
  assert.equal((route.match(/return adminCheck\.response|return body\.response/g) ?? []).length, 0);

  assert.match(route, /confirmation_code: record\.confirmation_code,/);
  assert.match(route, /full_name: record\.full_name,/);
  assert.match(route, /dal_panth: value,/);
  assert.match(route, /changed: record\.changed,/);
  assert.match(route, /return json\(saved\);/);
  assert.doesNotMatch(route, /json\(data\)|json\(\{ ok: true, result: data/);
});

// --- Docs --------------------------------------------------------------------

test("docs number this migration 28 and say it is not applied yet", () => {
  const entryAt = docs.indexOf("28. `20261110100000_rider_dal_panth`");
  assert.ok(entryAt > docs.indexOf("27. `20261108120000_shared_contact_details`"));
  const entry = docs.slice(entryAt, docs.indexOf("\n", entryAt));
  assert.match(entry, /\*\*not applied yet\.\*\*/);
  assert.match(entry, /\*\*patches no existing function\*\*/);
  assert.ok(entry.includes("`20261108100000_paper_rider_headshots`"));
  assert.ok(entry.includes("`20261109120000_desk_teams`"));
  assert.match(entry, /have no numbered entry/);
});
