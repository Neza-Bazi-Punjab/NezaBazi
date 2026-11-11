// The shared demo: one practice session for every device, stored in
// scoring_training_sessions (training-db.ts, sample-session.ts), and the
// public ?sample=demo addresses that follow it. House style: the sources are
// read and their invariants asserted, so the security rules (service role
// only, versioned saves, public caching) cannot drift silently.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

/* Source without comments, so a rule is checked against code only. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/--.*$/gm, "");

const MIGRATION = "supabase/migrations/20261107120000_scoring_training_sessions.sql";

test("the migration: RLS on, no policies, browser roles revoked, service role only", () => {
  const sql = repoFile(MIGRATION);
  const statements = code(sql);

  assert.match(sql, /create table if not exists public\.scoring_training_sessions \(/);
  assert.match(sql, /id text primary key,/);
  assert.match(sql, /state jsonb not null,/);
  assert.match(sql, /version bigint not null default 1,/);
  assert.match(sql, /updated_by uuid/);
  assert.match(sql, /alter table public\.scoring_training_sessions enable row level security;/);
  assert.doesNotMatch(statements, /create policy/i);
  assert.match(
    sql,
    /revoke all on table public\.scoring_training_sessions from public, anon, authenticated;/
  );
  assert.doesNotMatch(statements, /grant [^;]*to [^;]*\b(anon|authenticated)\b/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.scoring_training_sessions to service_role;/);
  // House style: preconditions, a verify block, the schema reload, invented riders only.
  assert.match(sql, /do \$preconditions\$/);
  assert.match(sql, /do \$verify\$/);
  assert.match(sql, /has_table_privilege\('anon', 'public\.scoring_training_sessions', 'select'\)/);
  assert.match(sql, /has_table_privilege\('authenticated', 'public\.scoring_training_sessions', 'select'\)/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
  assert.match(sql, /invented riders only/);
});

test("training-db: service role, server only, versioned saves, missing table detected", () => {
  const db = repoFile("src/lib/scoring/training-db.ts");

  assert.match(db, /^import "server-only";$/m);
  assert.match(db, /export const SHARED_TRAINING_SESSION = "shared";/);
  assert.match(db, /export const openTrainingDatabase = \(\): TrainingDatabase => createServiceRoleClient\(\);/);
  assert.doesNotMatch(code(db), /createPublicScoringClient|NEXT_PUBLIC_SUPABASE_ANON_KEY|@\/lib\/supabase\//);
  // The only table it touches is the practice row's.
  const tables = [...code(db).matchAll(/\.from\(([^)]*)\)/g)].map(([, table]) => table.trim());
  assert.ok(tables.length >= 3);
  assert.ok(tables.every((table) => table === "TRAINING_TABLE"), tables.join(", "));
  assert.match(db, /export const TRAINING_TABLE = "scoring_training_sessions";/);
  // A save updates only the version it loaded, and says when it lost.
  assert.match(
    db,
    /\.update\(\{ state, version: expectedVersion \+ 1,[^}]*\}\)\s*\.eq\("id", key\)\s*\.eq\("version", expectedVersion\)/
  );
  assert.match(db, /return Array\.isArray\(data\) && data\.length === 1;/);
  // A first save inserts; a concurrent first insert is a lost race too.
  assert.match(db, /if \(expectedVersion === null\) \{\s*const \{ error \} = await client\s*\.from\(TRAINING_TABLE\)\s*\.insert\(/);
  assert.match(db, /const UNIQUE_VIOLATION = "23505";/);
  // The missing table is the fallback signal, like isScoringNotConfiguredError.
  assert.match(db, /new Set\(\["PGRST205", "42P01"\]\)/);
  assert.match(db, /export class TrainingNotConfigured extends Error/);
});

test("sample-session: one withSession helper, retry once, 409 on a lost race, local stays in memory", () => {
  const session = repoFile("src/lib/scoring/sample-session.ts");

  assert.match(session, /const withSession = async <T>\(/);
  assert.match(session, /if \(key === LOCAL_TRAINING_SESSION\) \{\s*return act\(sessions\(\)\.get\(key\)\);\s*\}/);
  // The stored seed is the engine's snapshot plus the progression.
  assert.match(session, /\{ \.\.\.engine\.snapshot\(\), progression: seed\.progression \?\? TRAINING_PROGRESSION \}/);
  assert.match(session, /stored\?\.version \?\? null/);
  // Reads never save.
  assert.match(session, /if \(!write\) \{\s*return result;\s*\}/);
  // One retry, then the spec's sentence through SampleRefusal (409).
  assert.match(session, /if \(attempt >= 2\) \{\s*throw new SampleRefusal\("22023", LOST_RACE_MESSAGE\);\s*\}/);
  assert.match(
    session,
    /export const LOST_RACE_MESSAGE =\s*"Someone else just changed the practice\. It has refreshed; try again\.";/
  );
  // The missing table falls back to the in-memory store.
  assert.match(session, /if \(!\(caught instanceof TrainingNotConfigured\)\) \{\s*throw caught;\s*\}\s*noteFallback\(\);\s*return act\(sessions\(\)\.get\(key\)\);/);
  // Every exported read and write is async.
  for (const name of [
    "recordResult",
    "clearResult",
    "setRunStatus",
    "setLive",
    "callPool",
    "takeOut",
    "reset",
    "sampleJudgeState",
    "sampleCommentaryState",
    "samplePublicLiveState",
  ]) {
    assert.match(session, new RegExp(`export const ${name} = async \\(`), name);
  }
  // assembleSnapshot stays pure and synchronous (the moving vMix loop uses it).
  assert.match(session, /export const assembleSnapshot = \(all: SampleSeed\): Assembled =>/);
  // Reset deletes the row, so the next load seeds afresh.
  assert.match(session, /await deleteTrainingState\(openTrainingDatabase\(\), key\);/);
  // The in-memory store is kept for the laptop and the fallback.
  assert.match(session, /createTrainingStore\(/);
});

test("resolveSampleAccess: the shared key for staff, the local key only under SCORING_SAMPLE_MODE=1", () => {
  const gate = repoFile("src/lib/scoring/sample-mode.ts");
  const start = gate.indexOf("export const resolveSampleAccess");
  const body = gate.slice(start, gate.indexOf("\n};", start));

  const local = body.search(/if \(process\.env\.SCORING_SAMPLE_MODE === "1"\) \{\s*return \{ kind: "training", session: LOCAL_TRAINING_SESSION \};\s*\}/);
  const staff = body.search(/const access = await verifyRoleRequest\(STAFF_ROLES\);/);
  const shared = body.search(/return \{ kind: "training", session: SHARED_TRAINING_SESSION, actor: access\.actor\.id \};/);
  assert.ok(local > 0 && local < staff && staff < shared, "local first, then the staff check, then shared");
  assert.equal(body.match(/LOCAL_TRAINING_SESSION/g)?.length, 1);
  assert.doesNotMatch(gate, /personalTrainingSession/);
  // Async-aware answers.
  assert.match(gate, /export const sampleResponse = async \(produce: \(\) => unknown\) =>/);
  assert.match(gate, /return jsonNoStore\(await produce\(\)\);/);
});

test("every training route awaits the session", () => {
  const writes: Record<string, string[]> = {
    "src/app/api/judge/score/route.ts": ["recordResult"],
    "src/app/api/judge/clear/route.ts": ["clearResult"],
    "src/app/api/judge/live/route.ts": ["setLive"],
    "src/app/api/judge/status/route.ts": ["setRunStatus"],
    "src/app/api/judge/call-pool/route.ts": ["callPool"],
    "src/app/api/judge/take-out/route.ts": ["takeOut"],
  };

  for (const [path, names] of Object.entries(writes)) {
    const source = repoFile(path);
    assert.match(source, /sampleWriteResponse\(request, \w+, async \(value\) => \(\{/, path);
    for (const name of names) {
      assert.match(source, new RegExp(`await ${name}\\(\\s*training\\.session,`), path);
    }
    assert.match(source, /state: await sampleJudgeState\(training\.session\),/, path);
  }

  // Reads hand sampleResponse the promise, which it awaits.
  assert.match(
    repoFile("src/app/api/judge/state/route.ts"),
    /return sampleResponse\(\(\) => sampleJudgeState\(training\.session\)\);/
  );
  assert.match(
    repoFile("src/app/api/commentary/state/route.ts"),
    /return sampleResponse\(\(\) => sampleCommentaryState\(training\.session\)\);/
  );
  assert.match(
    repoFile("src/app/api/judge/reset-sample/route.ts"),
    /sampleResponse\(async \(\) => \{\s*await reset\(training\.session\);\s*return \{ state: await sampleJudgeState\(training\.session\) \};\s*\}\)/
  );
});

test("?sample=demo: the vMix feeds follow the shared demo, always sample = Yes", () => {
  const vmix = repoFile("src/lib/scoring/vmix.ts");
  const live = repoFile("src/lib/scoring/vmix-sample-live.ts");

  assert.match(vmix, /\["1", "true", "yes", "solo", "demo"\]/);
  assert.match(live, /if \(wantsDemoSample\(url\)\) \{\s*return demoSample\(\);\s*\}/);
  assert.match(live, /const key = demoTrainingSession\(\);/);
  assert.match(live, /const all = await readDemoSnapshot\(key\);/);
  // The feeds never name a database client; the practice row is read in sample-session.ts.
  assert.doesNotMatch(live, /createPublicScoringClient|createServiceRoleClient|supabase|solo_registrations|team_members/i);
  // Every feed's sample branch passes sample = true.
  for (const feed of ["current", "leaderboard", "entrants", "rounds"]) {
    const source = repoFile(`src/app/api/live/vmix/${feed}/route.ts`);
    assert.match(source, /await vmixSampleSource\(url\)/, feed);
    assert.match(source, /,\s*true(\)|,\s*sampleVmixPhotos\(url\)\s*\))/, feed);
  }
  // The demo session: the shared one, except on a SCORING_SAMPLE_MODE=1 laptop.
  assert.match(
    repoFile("src/lib/scoring/sample-session.ts"),
    /export const demoTrainingSession = \(\) =>\s*process\.env\.SCORING_SAMPLE_MODE === "1" \? LOCAL_TRAINING_SESSION : SHARED_TRAINING_SESSION;/
  );
});

test("/api/live/state serves ?sample=demo from the shared session, publicly cached, never private", () => {
  const route = repoFile("src/app/api/live/state/route.ts");
  const start = route.indexOf("if (isDemoRequest(request)) {");
  const branch = route.slice(start, route.indexOf("\n    }\n", start));

  assert.ok(start > 0);
  assert.ok(route.indexOf("if (isSampleRequest(request))") < start, "?sample=1 is checked first, unchanged");
  assert.ok(start < route.indexOf("await buildPublicLiveState()"), "the demo never reaches the scoring read");
  assert.match(branch, /const key = demoTrainingSession\(\);/);
  assert.match(branch, /await samplePublicLiveState\(key\)/);
  assert.match(branch, /"Cache-Control": PUBLIC_LIVE_CACHE/);
  assert.doesNotMatch(branch, /private/);
  assert.match(
    repoFile("src/lib/scoring/http.ts"),
    /PUBLIC_LIVE_CACHE = "public, s-maxage=5, stale-while-revalidate=10"/
  );
  // The local ?sample=1 path is unchanged: environment flag only, never cached.
  assert.match(
    route,
    /if \(isSampleRequest\(request\)\) \{\s*return NextResponse\.json\(await samplePublicLiveState\(LOCAL_TRAINING_SESSION\), \{\s*headers: \{ "Cache-Control": "private, no-store" \},/
  );
  assert.match(
    repoFile("src/lib/scoring/sample-mode.ts"),
    /export const isDemoRequest = \(request: Request\) =>\s*new URL\(request\.url\)\.searchParams\.get\("sample"\)\?\.trim\(\)\.toLowerCase\(\) === "demo";/
  );
  assert.doesNotMatch(route, /resolveSampleAccess|getSessionRole|verifyRoleRequest|cookies/);
});

test("use-live-state forwards ?sample=demo like ?sample=1 and polls instead of subscribing", () => {
  const hook = repoFile("src/lib/scoring/use-live-state.ts");

  assert.match(hook, /const SAMPLE_FLAG = \/\[\?&\]sample=\(\?:1\|demo\)\(\?:&\|\$\)\/;/);
  assert.match(hook, /return flag === "1" \|\| flag === "demo" \? flag : null;/);
  assert.match(hook, /sample=\$\{flag\}/);
  assert.match(hook, /const training = isSampleUrl\(withSampleFlag\(url\)\);/);
});

test("the demo pages and banner say whether the demo is shared yet", () => {
  const words = repoFile("src/lib/scoring/training.ts");

  assert.match(words, /export type TrainingScope = "shared" \| "unshared";/);
  assert.match(words, /\(not yet shared between devices\)/);
  assert.match(words, /This restarts the demo for everyone, on every device\./);

  for (const [route, panel] of [
    ["judge", "JudgePanel"],
    ["commentary", "CommentaryPanel"],
  ] as const) {
    const page = repoFile(`src/app/${route}/demo/page.tsx`);
    assert.match(page, new RegExp(`return <${panel} sample="shared" />;`));
    assert.match(page, new RegExp(`return <${panel} sample=\\{await sharedTrainingScope\\(\\)\\} />;`));
  }
});

/* The "Close the demo" switch ----------------------------------------------------- */

test("the switch table: one row, service role only, verified", () => {
  const sql = repoFile(MIGRATION);

  assert.match(sql, /create table if not exists public\.scoring_training_switch \(/);
  assert.match(sql, /id boolean primary key default true\s*constraint scoring_training_switch_single_row check \(id\),/);
  assert.match(sql, /demo_closed boolean not null default false,/);
  assert.match(sql, /insert into public\.scoring_training_switch \(id\) values \(true\) on conflict \(id\) do nothing;/);
  assert.match(sql, /alter table public\.scoring_training_switch enable row level security;/);
  assert.match(
    sql,
    /revoke all on table public\.scoring_training_switch from public, anon, authenticated;/
  );
  assert.match(sql, /grant select, insert, update on table public\.scoring_training_switch to service_role;/);
  assert.match(sql, /has_table_privilege\('anon', 'public\.scoring_training_switch', 'select'\)/);
  assert.match(sql, /'public\.scoring_training_switch must have no policies\.'/);
  assert.match(sql, /'public\.scoring_training_switch must hold exactly one row\.'/);

  // Read through the service role, cached for a second, errors read as open.
  const sw = repoFile("src/lib/scoring/training-switch.ts");
  assert.match(sw, /^import "server-only";$/m);
  assert.match(sw, /value = \(await readDemoSwitch\(openTrainingDatabase\(\)\)\)\?\.demo_closed === true;/);
  assert.match(sw, /const SWITCH_CACHE_MS = 1_000;/);
  assert.match(sw, /let value = false;/);
  assert.doesNotMatch(code(sw), /createPublicScoringClient|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("a closed demo refuses practice requests, and its pages say so", () => {
  const gate = repoFile("src/lib/scoring/sample-mode.ts");
  const start = gate.indexOf("export const resolveSampleAccess");
  const body = gate.slice(start, gate.indexOf("\n};", start));
  const staff = body.indexOf("if (!access.ok) {");
  const closed = body.search(
    /if \(await isDemoClosed\(\)\) \{\s*return \{ kind: "refused", response: jsonError\(DEMO_CLOSED_MESSAGE, 409\) \};\s*\}/
  );
  const shared = body.indexOf("session: SHARED_TRAINING_SESSION");
  assert.ok(staff > 0 && staff < closed && closed < shared, "the switch is checked after the staff check, before the shared demo");
  // The laptop's own session is decided before, so it is never closed.
  assert.ok(body.indexOf("session: LOCAL_TRAINING_SESSION") < closed);
  assert.match(
    repoFile("src/lib/scoring/training-switch.ts"),
    /export const DEMO_CLOSED_MESSAGE = "The demo is closed for the event\. Open the live panel\.";/
  );

  for (const [route, panel] of [
    ["judge", "JudgePanel"],
    ["commentary", "CommentaryPanel"],
  ] as const) {
    const page = repoFile(`src/app/${route}/demo/page.tsx`);
    const closedAt = page.search(
      new RegExp(`if \\(await isDemoClosed\\(\\)\\) \\{\\s*return <DemoClosed title=\\{TITLE\\} livePanel="/${route}"`)
    );
    assert.ok(closedAt > page.indexOf("STAFF_ROLES as readonly string[]"), `${route}: after the staff check`);
    assert.ok(closedAt < page.indexOf(`return <${panel} sample={await`), `${route}: before the panel`);
  }

  const closedPage = repoFile("src/components/scoring/DemoClosed.tsx");
  assert.match(closedPage, /Demo closed for the event/);
  assert.match(closedPage, /An administrator can reopen the demo on the scoring page\./);
});

test("a closed demo: ?sample=demo answers the frozen sample, never anything live", () => {
  const live = repoFile("src/lib/scoring/vmix-sample-live.ts");
  assert.match(
    live,
    /if \(key !== LOCAL_TRAINING_SESSION && \(await isDemoClosed\(\)\)\) \{\s*return FIXED_SAMPLE;\s*\}/
  );
  assert.ok(live.indexOf("return FIXED_SAMPLE;") < live.indexOf("await readDemoSnapshot(key)"));

  const route = repoFile("src/app/api/live/state/route.ts");
  assert.match(route, /import \{ samplePublicLiveState as frozenSampleState \} from "@\/lib\/scoring\/vmix-sample";/);
  assert.match(route, /const closed = key !== LOCAL_TRAINING_SESSION && \(await isDemoClosed\(\)\);/);
  assert.match(route, /closed \? frozenSampleState\(\) : await samplePublicLiveState\(key\)/);
});

test("the demo switch route: administrators only, audited before the change", () => {
  const route = repoFile("src/app/api/admin/scoring/demo-switch/route.ts");
  const handlers = route.match(/export async function (GET|POST)\b/g) ?? [];

  assert.equal(handlers.length, 2);
  assert.equal(route.match(/await verifyRoleRequest\(\["admin"\]\)/g)?.length, 2);
  assert.match(route, /export const dynamic = "force-dynamic";/);
  const audit = route.indexOf("await insertRequiredAuditLog(serviceSupabase, access.actor, {");
  const write = route.indexOf("await writeDemoSwitch(serviceSupabase, parsed.value.closed, access.actor.id)");
  assert.ok(audit > 0 && audit < write, "the audit row is written before the switch changes");
  assert.match(route, /action: parsed\.value\.closed \? "close_demo" : "open_demo",/);
  assert.match(route, /target_table: TRAINING_SWITCH_TABLE,/);
  assert.match(route, /await readJsonBody\(request\)/);
  assert.match(route, /return jsonNoStore\(\{ demo: written\.value \}\);/);
  assert.doesNotMatch(route, /error\.message|body\.body\.(actor|changed_by)/);

  const labels = repoFile("src/app/admin/AdminDashboard.tsx");
  assert.match(labels, /close_demo: "Close Demo",/);
  assert.match(labels, /open_demo: "Open Demo",/);
});
