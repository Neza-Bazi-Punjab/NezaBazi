import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { csvField, toCsv } from "../../lib/scoring/csv.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

/* Every route.ts below a directory, as repo-relative paths. */
const routesUnder = (directory: string) =>
  readdirSync(new URL(`../../../${directory}`, import.meta.url), { recursive: true })
    .map((entry) => String(entry).replace(/\\/g, "/"))
    .filter((entry) => entry.endsWith("route.ts"))
    .map((entry) => `${directory}/${entry}`)
    .sort();

const judgeRoutes = routesUnder("src/app/api/judge");
/* Training mode's reset: sample-only, 404 otherwise, checked on its own below. */
const RESET_SAMPLE_ROUTE = "src/app/api/judge/reset-sample/route.ts";
const judgeRoleRoutes = judgeRoutes.filter((path) => path !== RESET_SAMPLE_ROUTE);
const commentaryRoutes = routesUnder("src/app/api/commentary");
/* The rider-list export is a download for the graphics team, checked on its
   own below (it uses verifyAdminRequest, like the rest of /api/admin). */
const EXPORT_ROUTE = "src/app/api/admin/scoring/export/route.ts";
const adminRoutes = routesUnder("src/app/api/admin/scoring").filter((path) => path !== EXPORT_ROUTE);
const publicRoutes = routesUnder("src/app/api/live");

const HANDLER = /export async function (GET|POST|PATCH|DELETE)\b/g;

test("every expected route exists", () => {
  assert.deepEqual(judgeRoutes, [
    "src/app/api/judge/call-pool/route.ts",
    "src/app/api/judge/clear/route.ts",
    "src/app/api/judge/live/route.ts",
    "src/app/api/judge/reset-sample/route.ts",
    "src/app/api/judge/score/route.ts",
    "src/app/api/judge/state/route.ts",
    "src/app/api/judge/status/route.ts",
  ]);
  assert.deepEqual(commentaryRoutes, ["src/app/api/commentary/state/route.ts"]);
  assert.deepEqual(adminRoutes, [
    "src/app/api/admin/scoring/advance/route.ts",
    "src/app/api/admin/scoring/pool/route.ts",
    "src/app/api/admin/scoring/rounds/[id]/entrants/[entrantKey]/route.ts",
    "src/app/api/admin/scoring/rounds/[id]/entrants/route.ts",
    "src/app/api/admin/scoring/rounds/[id]/route.ts",
    "src/app/api/admin/scoring/rounds/[id]/start-list/route.ts",
    "src/app/api/admin/scoring/rounds/route.ts",
    "src/app/api/admin/scoring/runs/[id]/move/route.ts",
  ]);
  assert.deepEqual(publicRoutes, [
    "src/app/api/live/state/route.ts",
    "src/app/api/live/vmix/current/route.ts",
    "src/app/api/live/vmix/entrants/route.ts",
    "src/app/api/live/vmix/leaderboard/route.ts",
    "src/app/api/live/vmix/rounds/route.ts",
  ]);
  assert.ok(routesUnder("src/app/api/admin/scoring").includes(EXPORT_ROUTE));
});

test("every scoring route is dynamic", () => {
  for (const path of [...judgeRoutes, ...commentaryRoutes, ...adminRoutes, ...publicRoutes, EXPORT_ROUTE]) {
    assert.match(repoFile(path), /export const dynamic = "force-dynamic";/, path);
  }
});

const assertEveryHandlerVerifies = (path: string, verifier: RegExp) => {
  const source = repoFile(path);
  const handlers = source.match(HANDLER) ?? [];
  const checks = source.match(verifier) ?? [];

  assert.ok(handlers.length > 0, `${path} exports a handler`);
  assert.equal(checks.length, handlers.length, `${path}: one role check per handler`);
  assert.match(source, /if \(!access\.ok\) \{\s+return access\.response;\s+\}/, path);
};

test("judge routes admit judges and administrators only", () => {
  for (const path of judgeRoleRoutes) {
    assertEveryHandlerVerifies(path, /await verifyRoleRequest\(\["judge", "admin"\]\)/g);
  }
});

test("the commentary route admits judges, commentators and administrators only", () => {
  for (const path of commentaryRoutes) {
    assertEveryHandlerVerifies(
      path,
      /await verifyRoleRequest\(\["judge", "commentator", "admin"\]\)/g
    );
  }
});

test("admin scoring routes admit administrators only", () => {
  for (const path of adminRoutes) {
    assertEveryHandlerVerifies(path, /await verifyRoleRequest\(\["admin"\]\)/g);
  }
});

test("writes take the audit actor from the verified session, never the body", () => {
  for (const path of [...judgeRoutes, ...adminRoutes]) {
    const source = repoFile(path);

    if (!source.includes(".rpc(")) {
      continue;
    }

    assert.match(source, /p_actor_id: access\.actor\.id/, path);
    assert.match(source, /p_actor_name: access\.actor\.name/, path);
    assert.match(source, /p_actor_email: access\.actor\.email/, path);
    assert.doesNotMatch(source, /body\.body\.(actor|p_actor)/, path);
  }
});

test("request bodies are size-limited and parsed with type guards", () => {
  for (const path of [...judgeRoleRoutes, ...adminRoutes]) {
    const source = repoFile(path);

    if (!/export async function (POST|PATCH)\b/.test(source)) {
      continue;
    }

    assert.match(source, /await readJsonBody\(request\)/, path);
    assert.match(source, /parse\w+Request|parseRound(Input|Patch)/, path);
    assert.doesNotMatch(source, /request\.json\(\)/, path);
    assert.doesNotMatch(source, /as (ScoreRequest|ClearScoreRequest|RoundInput|RoundPatch|LiveUpdateRequest)\b/, path);
  }

  const validation = repoFile("src/lib/scoring/validation.ts");
  assert.match(
    validation,
    /\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i/
  );
});

test("database errors never reach the client except the human P0002 / 22023 messages", () => {
  for (const path of [...judgeRoutes, ...commentaryRoutes, ...adminRoutes, ...publicRoutes]) {
    assert.doesNotMatch(repoFile(path), /error\.message/, path);
  }

  const http = repoFile("src/lib/scoring/http.ts");
  assert.match(http, /error\?\.code === "P0002"[\s\S]*?404/);
  assert.match(http, /error\?\.code === "22023"[\s\S]*?409/);
  assert.match(http, /jsonError\(NOT_CONFIGURED_MESSAGE, 503\)/);
  assert.match(http, /"Live scoring is not set up yet\."/);
  assert.match(http, /jsonError\(GENERIC_ERROR_MESSAGE, 500\)/);

  const server = repoFile("src/lib/scoring/server.ts");
  assert.match(server, /"PGRST205", "42P01"/);
  assert.match(server, /emptyPublicLiveState\(false\)/);
});

test("staff and admin responses are never cached; the public state is cached for a second", () => {
  const http = repoFile("src/lib/scoring/http.ts");
  assert.match(http, /PRIVATE_NO_STORE = "private, no-store"/);
  assert.match(http, /PUBLIC_LIVE_CACHE = "public, s-maxage=1, stale-while-revalidate=4"/);

  for (const path of [...commentaryRoutes, ...judgeRoleRoutes, ...adminRoutes]) {
    assert.match(repoFile(path), /jsonNoStore\(/, path);
  }

  // Training answers go through sampleResponse, which is jsonNoStore too.
  assert.match(repoFile("src/lib/scoring/sample-mode.ts"), /return jsonNoStore\(produce\(\)\);/);
  assert.match(repoFile(RESET_SAMPLE_ROUTE), /sampleResponse\(/);

  for (const path of publicRoutes) {
    assert.match(repoFile(path), /PUBLIC_LIVE_CACHE/, path);
  }
});

test("public routes and the public state never touch registration data", () => {
  const registration = /solo_registrations|team_members|\bteams\b/;
  const publicSources = [
    ...publicRoutes,
    "src/lib/scoring/server.ts",
    "src/lib/scoring/vmix.ts",
    "src/lib/scoring/vmix-columns.ts",
    "src/lib/scoring/vmix-sample.ts",
    "src/lib/scoring/csv.ts",
  ];

  for (const path of publicSources) {
    const source = repoFile(path);
    assert.doesNotMatch(source, registration, path);
  }

  for (const path of publicRoutes) {
    const source = repoFile(path);
    assert.doesNotMatch(source, /verifyRoleRequest|createServiceRoleClient|rider-detail|admin-state/, path);
    assert.match(
      source,
      /buildPublicLive(State|Snapshot)\(\)|buildPublicRoundFeed\(roundParam\)|buildPublicRoundsFeed\(\)/,
      path
    );
  }

  // The two newer feeds read scoring_* only, as the anonymous role.
  const serverSource = repoFile("src/lib/scoring/server.ts");
  for (const builder of ["buildPublicRoundFeed", "buildPublicRoundsFeed"]) {
    const start = serverSource.indexOf(`export const ${builder} = async (`);
    const end = serverSource.indexOf("\n};", start);
    const body = serverSource.slice(start, end);
    assert.ok(start > 0, `${builder} exists`);
    assert.match(body, /client: ScoringDbClient = createPublicScoringClient\(\)/, builder);
    const tables = [...body.matchAll(/\.from\("([a-z_]+)"\)/g)].map(([, table]) => table);
    assert.ok(tables.length > 0 && tables.every((table) => table.startsWith("scoring_")), builder);
  }

  // Sample mode answers before any database read.
  for (const path of publicRoutes.filter((route) => route.includes("/vmix/"))) {
    const source = repoFile(path);
    const sample = source.indexOf("if (wantsSample(url))");
    const firstRead = source.search(/await buildPublic/);
    assert.ok(sample > 0 && sample < firstRead, `${path}: ?sample=1 never reaches the database`);
  }

  // The public state is read as the anonymous role, not the service role.
  const server = repoFile("src/lib/scoring/server.ts");
  assert.match(server, /client: ScoringDbClient = createPublicScoringClient\(\)/);
  assert.match(server, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  // The judge who scored a run is staff data, and a rider's village stays on
  // the server (src/lib/scoring/public-state.test.mts covers the shaping).
  assert.match(server, /toPublicLiveState\(snapshot\.state\)/);
  assert.match(
    repoFile("src/lib/scoring/types.ts"),
    /export const toPublicRun = [^\n]*\n  \.\.\.run,\n  rider_location: shortLocation\(run\.rider_location\),\n  scored_by: null,\n\}\);/
  );
});

test("vMix rows carry every field, always", () => {
  const vmix = repoFile("src/lib/scoring/vmix.ts");
  const columnsFile = repoFile("src/lib/scoring/vmix-columns.ts");
  const current = [
    "round_name", "event_type", "round_number", "pool_label", "next_pool_label",
    "rider_name", "team_name", "horse_name", "location_short", "attempt_number",
    "attempts_per_rider", "run_order", "runs_total", "display_mode", "message",
    "last_rider_name", "last_team_name", "last_result", "last_points",
    "last_scored_at", "updated_at", "sample",
  ];
  const leaderboard = [
    "rank", "pool_rank", "pool_label", "name", "team_name", "horse_name",
    "location_short", "points", "best_result", "runs_scored", "runs_total", "advanced",
    "sample",
  ];
  const entrants = [
    "entrant_key", "pool_label", "start_position", "name", "team_name", "horse_name",
    "location_short", "members", "runs_total", "runs_scored", "points", "best_result",
    "advanced", "rank", "pool_rank", "sample",
  ];
  const rounds = [
    "round_id", "name", "event_type", "round_number", "status", "is_live",
    "attempts_per_rider", "target_points", "pool_size", "pool_count", "entrants",
    "runs_total", "runs_scored", "sample",
  ];

  const columnList = (name: string) => {
    const start = columnsFile.indexOf(`export const ${name} = [`);
    const end = columnsFile.indexOf("] as const;", start);
    assert.ok(start >= 0, `${name} declared`);
    return [...columnsFile.slice(start, end).matchAll(/"(\w+)"/g)].map(([, column]) => column);
  };

  assert.deepEqual(columnList("VMIX_CURRENT_COLUMNS"), current);
  assert.deepEqual(columnList("VMIX_LEADERBOARD_COLUMNS"), leaderboard);
  assert.deepEqual(columnList("VMIX_ENTRANTS_COLUMNS"), entrants);
  assert.deepEqual(columnList("VMIX_ROUNDS_COLUMNS"), rounds);

  // Every row type has its sample flag and an all-empty row for "nothing to show".
  for (const type of ["VmixCurrentRow", "VmixLeaderboardRow", "VmixEntrantRow", "VmixRoundRow"]) {
    const start = vmix.indexOf(`export type ${type} = {`);
    const end = vmix.indexOf("\n};", start);
    assert.match(vmix.slice(start, end), /sample: SampleFlag;/, type);
  }

  for (const empty of ["EMPTY_VMIX_LEADERBOARD_ROW", "EMPTY_VMIX_ENTRANT_ROW", "EMPTY_VMIX_ROUND_ROW"]) {
    assert.match(vmix, new RegExp(`export const ${empty}: \\w+ = \\{`), empty);
  }

  assert.match(vmix, /return \[EMPTY_VMIX_ENTRANT_ROW\];/);
  assert.match(vmix, /return \[EMPTY_VMIX_ROUND_ROW\];/);
  // Never null: optional values fall back to "" (or 0 for numbers).
  assert.match(vmix, /const text = \(value: string \| null \| undefined\) => value \?\? "";/);
  assert.match(vmix, /flat\.length > 0 \? flat : \[EMPTY_VMIX_LEADERBOARD_ROW\]/);
  assert.match(vmix, /"Content-Type": "text\/csv; charset=utf-8"/);
  assert.match(vmix, /VMIX_LEADERBOARD_MAX_LIMIT = 200/);
  assert.match(vmix, /VMIX_LEADERBOARD_DEFAULT_LIMIT = 50/);
});

test("the rider export is admin-only and carries no contact or personal details", () => {
  const source = repoFile(EXPORT_ROUTE);

  assert.match(source, /export const dynamic = "force-dynamic";/);
  assert.equal(source.match(/await verifyAdminRequest\(\)/g)?.length, 1);
  assert.match(source, /if \(!adminCheck\.ok\) \{\s+return adminCheck\.response;\s+\}/);
  assert.match(source, /"Content-Disposition": `attachment; filename="\$\{filename\}"`/);
  assert.match(source, /"Cache-Control": NO_STORE/);

  const columnsStart = source.indexOf("const RIDER_EXPORT_COLUMNS = [");
  const columns = source.slice(columnsStart, source.indexOf("] as const;", columnsStart));
  const selects = [...source.matchAll(/const (SOLO|MEMBER)_SELECT =\s*"([^"]+)"/g)].map(([, , list]) => list);
  assert.equal(selects.length, 2);

  for (const text of [columns, ...selects]) {
    assert.doesNotMatch(
      text,
      /\b(phone|email|age|father_name|mother_name|emergency_contact\w*|profile_id)\b/,
      "the export never reads or writes contact or personal fields"
    );
  }

  // Written from the fixed list only.
  assert.match(source, /RIDER_EXPORT_COLUMNS\.map\(\(column\) => \[column, row\[column\]\]\)/);
});

test("CSV fields are quoted per RFC 4180", () => {
  assert.equal(csvField("Harpreet Singh"), "Harpreet Singh");
  assert.equal(csvField("Singh, Harpreet"), '"Singh, Harpreet"');
  assert.equal(csvField('Harpreet "Harry" Singh'), '"Harpreet ""Harry"" Singh"');
  assert.equal(csvField("Line one\nLine two"), '"Line one\nLine two"');
  assert.equal(csvField("Carriage\r\nreturn"), '"Carriage\r\nreturn"');
  assert.equal(csvField(4), "4");
  assert.equal(csvField(null), "");
  assert.equal(csvField(undefined), "");

  const csv = toCsv(
    ["rank", "name", "points"],
    [{ rank: 1, name: 'Singh, "Harry"\nJunior', points: 12 }]
  );
  assert.equal(csv, 'rank,name,points\r\n1,"Singh, ""Harry""\nJunior",12\r\n');
});

/* Training mode -------------------------------------------------------------- */

test("training is allowed with SCORING_SAMPLE_MODE=1 or for signed-in staff, never anonymously otherwise", () => {
  const gate = repoFile("src/lib/scoring/sample-mode.ts");
  const start = gate.indexOf("export const resolveSampleAccess = async (request: Request): Promise<SampleAccess> => {");
  const end = gate.indexOf("\n};\n", start);
  const body = gate.slice(start, end);

  assert.ok(start > 0, "resolveSampleAccess exists");
  // In order: no ?sample=1 → the real path (no session read at all); the
  // environment flag → the shared local session; otherwise the staff check,
  // whose own 401/403 is returned unchanged; staff → their own session.
  const steps = [
    /if \(new URL\(request\.url\)\.searchParams\.get\("sample"\) !== "1"\) \{\s+return \{ kind: "real" \};\s+\}/,
    /if \(process\.env\.SCORING_SAMPLE_MODE === "1"\) \{\s+return \{ kind: "training", session: LOCAL_TRAINING_SESSION \};\s+\}/,
    /const access = await verifyRoleRequest\(STAFF_ROLES\);/,
    /if \(!access\.ok\) \{\s+return \{ kind: "refused", response: access\.response \};\s+\}/,
    /return \{ kind: "training", session: personalTrainingSession\(access\.actor\.id\) \};/,
  ];
  let position = 0;

  for (const step of steps) {
    const match = step.exec(body.slice(position));
    assert.ok(match, `resolveSampleAccess: ${step}`);
    position += (match.index ?? 0) + match[0].length;
  }

  assert.match(gate, /import \{ STAFF_ROLES \} from "@\/lib\/scoring\/types";/);
  assert.match(repoFile("src/lib/scoring/types.ts"), /export const STAFF_ROLES = \["judge", "commentator", "admin"\] as const;/);
  // The public state's local-only gate: the environment flag and ?sample=1.
  assert.match(
    gate,
    /export const isSampleRequest = \(request: Request\) =>\s+process\.env\.SCORING_SAMPLE_MODE === "1" &&\s+new URL\(request\.url\)\.searchParams\.get\("sample"\) === "1";/
  );
  // A refusal keeps the database's own human message and status (404 / 409).
  assert.match(gate, /caught instanceof SampleRefusal/);
  assert.match(gate, /jsonError\(caught\.message, caught\.status\)/);
  // Training writes are read and validated exactly like real ones.
  assert.match(gate, /await readJsonBody\(request\)/);
  assert.match(gate, /const parsed = parse\(body\.body\);/);
});

test("each route resolves training access first; refused callers get the real route's 401/403", () => {
  for (const path of [...judgeRoleRoutes, ...commentaryRoutes]) {
    const source = repoFile(path);
    const handlers = [...source.matchAll(HANDLER)];

    assert.match(
      source,
      /import \{ resolveSampleAccess, sample(Write)?Response \} from "@\/lib\/scoring\/sample-mode";/,
      path
    );
    assert.match(
      source,
      /This branch never reads or writes the\s+\/\/ scoring or registration tables and never returns real data/,
      path
    );
    assert.equal(
      source.match(/const training = await resolveSampleAccess\(request\);/g)?.length,
      handlers.length,
      `${path}: one training gate per handler`
    );

    for (const handler of handlers) {
      const from = handler.index ?? 0;
      const gateAt = source.indexOf("const training = await resolveSampleAccess(request);", from);
      const refusedAt = source.indexOf('if (training.kind === "refused") {\n    return training.response;\n  }', from);
      const branchAt = source.indexOf('if (training.kind === "training") {', from);
      const branchEnd = source.indexOf("\n  }\n", branchAt);
      const roleCheck = source.indexOf("await verifyRoleRequest(", from);
      const branch = source.slice(branchAt, branchEnd);

      // Nothing runs before the gate.
      assert.equal(
        source.slice(from, gateAt).replace(/\/\/[^\n]*\n/g, "").replace(/\s+/g, " ").trim(),
        handler[0].replace(/\s+/g, " ") + `(request: Request) {`,
        `${path}: the training gate is the handler's first statement`
      );
      assert.ok(gateAt < refusedAt && refusedAt < branchAt, `${path}: a refusal returns before anything else`);
      assert.ok(branchEnd < roleCheck, `${path}: the training branch closes before the role check`);
      // The branch answers from the caller's practice session and returns; it
      // never reaches the database, the role check or the real builders.
      assert.match(branch, /return sample(Write)?Response\(/, path);
      assert.match(branch, /training\.session/, path);
      assert.doesNotMatch(
        branch,
        /createServiceRoleClient|\.rpc\(|\.from\(|build(Judge|Commentary|PublicLive)State|verifyRoleRequest|supabase/i,
        path
      );
    }
  }

  // The public state answers training only on a SCORING_SAMPLE_MODE=1 laptop
  // and never reads a session, so it stays public and cacheable.
  const live = repoFile("src/app/api/live/state/route.ts");
  assert.match(live, /import \{ isSampleRequest \} from "@\/lib\/scoring\/sample-mode";/);
  assert.match(live, /samplePublicLiveState\(LOCAL_TRAINING_SESSION\)/);
  assert.ok(live.indexOf("if (isSampleRequest(request))") < live.indexOf("await buildPublicLiveState()"));
  assert.doesNotMatch(live, /resolveSampleAccess|getSessionRole|verifyRoleRequest|cookies/);
});

test("reset-sample resets only the caller's practice session, and is a 404 for everyone else", () => {
  const source = repoFile(RESET_SAMPLE_ROUTE);

  assert.match(
    source,
    /export async function POST\(request: Request\) \{\s+const training = await resolveSampleAccess\(request\);\s+if \(training\.kind !== "training"\) \{\s+return jsonError\("Not found\.", 404\);\s+\}/
  );
  assert.match(source, /reset\(training\.session\);/);
  assert.match(source, /sampleJudgeState\(training\.session\)/);
  assert.match(source, /never reads or writes the scoring or registration tables/);
  assert.doesNotMatch(source, /createServiceRoleClient|verifyRoleRequest|\.rpc\(|\.from\(|supabase\//);
});

test("practice sessions are per staff member on the live site, shared locally, and bounded", () => {
  const session = repoFile("src/lib/scoring/sample-session.ts");

  assert.match(session, /export const LOCAL_TRAINING_SESSION = "local";/);
  assert.match(session, /export const personalTrainingSession = \(userId: string\) => `user:\$\{userId\}`;/);
  assert.match(session, /export const MAX_TRAINING_SESSIONS = 200;/);
  assert.match(session, /export const TRAINING_IDLE_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.match(session, /createTrainingStore\(\s+\(\) => createSampleEngine\(buildSeed\(\)\),\s+\{ max: MAX_TRAINING_SESSIONS, idleMs: TRAINING_IDLE_MS \}\s+\)/);
  assert.match(session, /globalThis/);

  // Every read and write names its session; reset touches only that one.
  for (const name of ["recordResult", "clearResult", "setRunStatus", "setLive", "callPool"]) {
    assert.match(session, new RegExp(`export const ${name} = \\(key: string, `), name);
  }
  assert.match(session, /export const reset = \(key: string\) => \{\s+sessions\(\)\.reset\(key\);\s+\};/);
  assert.match(session, /export const sampleJudgeState = \(key: string\): JudgeState =>/);
  assert.match(session, /export const sampleCommentaryState = \(key: string\): CommentaryState =>/);

  // The store's own rules are exercised in sample-engine.test.mts.
  const store = repoFile("src/lib/scoring/training-store.ts");
  assert.doesNotMatch(store, /^import /m, "training-store.ts is import-free");
});

test("the training session never imports or calls a database client", () => {
  const forbidden =
    /@supabase|lib\/supabase|createClient|createServiceRoleClient|createPublicScoringClient|rider-detail|admin\/server|admin-state|\.from\(|\.rpc\(|loadLiveSnapshot|build(Judge|Commentary|PublicLive)State/;
  const importsOf = (source: string) =>
    [...source.matchAll(/^import (type )?(?:\{([^}]*)\}|[\w*]+(?: as \w+)?)?(?: from )?"([^"]+)";/gm)].map(
      ([, typeOnly, names, specifier]) => ({ typeOnly: Boolean(typeOnly), names: names ?? "", specifier })
    );

  // The engine: type-only imports, so nothing at all is loaded at runtime.
  const engine = repoFile("src/lib/scoring/sample-engine.ts");
  assert.doesNotMatch(engine, forbidden);
  const engineImports = importsOf(engine);
  assert.ok(engineImports.length > 0);
  assert.ok(engineImports.every((entry) => entry.typeOnly), "sample-engine.ts has type-only imports");

  // The session: the sample data, the engine, the session store, the types
  // and the pure pool helpers from server.ts (the same ones vmix-sample.ts uses).
  const session = repoFile("src/lib/scoring/sample-session.ts");
  const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code(session), forbidden);
  const allowed = new Set([
    "server-only",
    "@/lib/scoring/sample-engine",
    "@/lib/scoring/server",
    "@/lib/scoring/training-store",
    "@/lib/scoring/types",
    "@/lib/scoring/vmix-sample",
  ]);
  for (const entry of importsOf(session)) {
    assert.ok(allowed.has(entry.specifier), `sample-session.ts must not import ${entry.specifier}`);

    if (entry.specifier === "@/lib/scoring/server") {
      const names = entry.names.split(",").map((name) => name.trim()).filter(Boolean);
      assert.ok(
        names.every((name) =>
          ["buildPoolRosters", "listPools", "nextPoolLabel", "recentResults", "comparePoolLabels"].includes(name)
        ),
        `only pure helpers from server.ts: ${names.join(", ")}`
      );
    }
  }
  assert.match(session, /headshot_url: null/);

  // The gate's only database contact is the role check.
  const gate = code(repoFile("src/lib/scoring/sample-mode.ts"));
  assert.doesNotMatch(gate, /@supabase|createServiceRoleClient|\.rpc\(|\.from\(|build(Judge|Commentary|PublicLive)State/);
  assert.equal(gate.match(/verifyRoleRequest\(/g)?.length, 1);
});
