// Source-level checks for the live scoring surfaces (/live, /judge,
// /commentary, /overlay/*): chrome hiding, staff-page gating and noindex,
// the public pages' data boundary, and the sitemap.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  chromelessPathPrefixes,
  footerQuickLinks,
  isChromelessPath,
  navLinks,
} from "../../lib/site.ts";

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

/* Every .ts/.tsx/.css file under a directory (relative to this file). */
const sourcesUnder = (relative: string) => {
  const base = new URL(relative, import.meta.url);

  return readdirSync(base, { recursive: true })
    .map(String)
    .filter((name) => /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.mts"))
    .map((name) => ({
      name: `${relative}${name.replaceAll("\\", "/")}`,
      source: readFileSync(new URL(name.replaceAll("\\", "/"), base), "utf8"),
    }));
};

test("SiteChrome hides the navbar and footer on the staff panels and overlays", () => {
  assert.deepEqual([...chromelessPathPrefixes].sort(), ["/commentary", "/judge", "/overlay"]);

  for (const path of [
    "/overlay",
    "/overlay/scorebug",
    "/overlay/leaderboard",
    "/judge",
    "/judge/anything",
    "/judge/demo",
    "/commentary",
    "/commentary/",
    "/commentary/demo",
  ]) {
    assert.equal(isChromelessPath(path), true, `${path} should be chromeless`);
  }

  for (const path of ["/", "/live", "/event", "/admin", "/admin/scoring", "/judgement", "/overlays", null, undefined]) {
    assert.equal(isChromelessPath(path), false, `${String(path)} should keep the chrome`);
  }

  const chrome = read("../../components/SiteChrome.tsx");
  assert.match(chrome, /^"use client";/);
  assert.match(chrome, /usePathname\(\)/);
  assert.match(chrome, /isChromelessPath\(pathname\)/);
  assert.match(chrome, /return null;/);
});

for (const [route, roles] of [
  ["judge", ["judge", "admin"]],
  ["commentary", ["judge", "commentator", "admin"]],
] as const) {
  test(`/${route} checks the session role server-side and is noindex`, () => {
    const page = read(`../${route}/page.tsx`);

    assert.doesNotMatch(page, /^"use client"/);
    assert.match(page, /import \{ getSessionRole[^}]*\} from "@\/lib\/scoring\/auth";/);
    assert.match(page, /await getSessionRole\(\)/);
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    assert.match(page, new RegExp(`redirectTo="/${route}"`));
    assert.match(page, /kind="login"/);
    assert.match(page, /kind="denied"/);

    const allowed = page.match(/const ALLOWED_ROLES = \[([^\]]*)\] as const;/);
    assert.ok(allowed, "ALLOWED_ROLES is declared");
    assert.deepEqual(
      [...allowed[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]).sort(),
      [...roles].sort()
    );
    assert.doesNotMatch(allowed[1], /"player"/);
  });
}

test("the staff gate links back to the panel through the login page", () => {
  const gate = read("../../components/scoring/StaffGate.tsx");
  assert.match(gate, /href: `\/login\?redirect=\$\{redirectTo\}`/);
  assert.match(gate, /"Login Required"/);
  assert.match(gate, /"Access Denied"/);
});

test("the overlays are noindex and switch the page to transparent only while mounted", () => {
  const layout = read("../overlay/layout.tsx");
  assert.match(layout, /robots: \{ index: false, follow: false \}/);

  const parts = read("../overlay/overlay-parts.tsx");
  assert.match(parts, /html\.\$\{TRANSPARENT_CLASS\},html\.\$\{TRANSPARENT_CLASS\} body\{background:transparent !important;/);
  assert.match(parts, /root\.classList\.add\(TRANSPARENT_CLASS\)/);
  assert.match(parts, /return \(\) => root\.classList\.remove\(TRANSPARENT_CLASS\)/);

  for (const overlay of [
    "scorebug/ScorebugOverlay.tsx",
    "lower-third/LowerThirdOverlay.tsx",
    "leaderboard/LeaderboardOverlay.tsx",
    "ticker/TickerOverlay.tsx",
    "pool-call/PoolCallOverlay.tsx",
  ]) {
    const source = read(`../overlay/${overlay}`);
    assert.match(source, /<OverlayFrame name="/, `${overlay} renders inside OverlayFrame`);
    assert.match(source, /useOverlayState\(\)/, `${overlay} reads the public live state`);
    assert.match(source, /display_mode/, `${overlay} is display-mode aware`);
  }

  // The index page explains setup and is not transparent.
  const index = read("../overlay/page.tsx");
  assert.doesNotMatch(index, /OverlayFrame/);
  assert.match(index, /Shutdown source when not visible/);
  assert.match(index, /\/api\/live\/state/);
});

test("the overlay index leads with the vMix data feed; ready-made overlays are optional; OBS last", () => {
  const index = read("../overlay/page.tsx");
  const data = index.indexOf('id="vmix-data"');
  const bridge = index.indexOf('id="vmix-bridge"');
  const overlays = index.indexOf('id="overlays"');
  const obs = index.indexOf('id="obs"');
  const other = index.indexOf('id="other"');

  assert.ok(
    data > 0 && bridge > data && overlays > bridge && obs > overlays && other > obs,
    "data feed, then the bridge script, then the optional overlays, then OBS and other software"
  );
  assert.match(index, /title: "Live data feed & overlays"/);
  assert.match(index, /Live data feed &amp; overlays/);
  // The printable handout is linked in the header, before the data feed.
  const handout = index.indexOf('href="/documents/vmix-guide.pdf"');
  assert.ok(handout > 0 && handout < data, "the vMix guide PDF is linked near the top");
  assert.match(index, /Data feed for vMix/);
  assert.match(index, /Optional, if the graphics team prefers not to build their own/);
  assert.match(index, /<strong>1–2 seconds<\/strong>/);
  assert.match(index, /\?sample=1/);
  assert.match(index, /\/api\/live\/vmix\/current\?sample=1/);
  assert.match(index, /\?round=&lt;round_id&gt;/);
  assert.match(index, /\?pool=A/);
  assert.match(index, /<strong>Add Input<\/strong> → <strong>More<\/strong> → <strong>Web Browser<\/strong>/);
  assert.match(index, /Overlay channel \(1–4\)/);
  assert.match(index, /<strong>Reload<\/strong>/);
  assert.match(index, /\?format=csv/);
  assert.match(index, /docs\/live-stream\.md/);

  // The column lists come from the feed code itself, so they cannot drift.
  assert.match(index, /import \{[^}]*\bVMIX_FEEDS\b[^}]*\} from "@\/lib\/scoring\/vmix-columns";/);
  assert.match(index, /<ColumnList columns=\{feed\.columns\} \/>/);
  const feeds = read("../../lib/scoring/vmix-columns.ts");

  for (const path of ["current", "leaderboard", "entrants", "rounds"]) {
    assert.match(feeds, new RegExp(`path: "/api/live/vmix/${path}"`));
  }

  const columns = (name: string) => {
    const block = feeds.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
    assert.ok(block, `${name} declared`);
    return [...block[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
  };

  assert.deepEqual(columns("VMIX_CURRENT_COLUMNS"), [
    "round_name",
    "event_type",
    "round_number",
    "pool_label",
    "next_pool_label",
    "rider_name",
    "team_name",
    "horse_name",
    "location_short",
    "attempt_number",
    "attempts_per_rider",
    "run_order",
    "runs_total",
    "display_mode",
    "message",
    "last_rider_name",
    "last_team_name",
    "last_result",
    "last_points",
    "last_scored_at",
    "updated_at",
    "sample",
  ]);
  assert.deepEqual(columns("VMIX_LEADERBOARD_COLUMNS"), [
    "rank",
    "pool_rank",
    "pool_label",
    "name",
    "team_name",
    "horse_name",
    "location_short",
    "points",
    "best_result",
    "runs_scored",
    "runs_total",
    "advanced",
    "sample",
  ]);
});

test("public pages read only the public live state, never staff or registration data", () => {
  const publicSources = [
    ...sourcesUnder("../live/"),
    ...sourcesUnder("../overlay/"),
    ...sourcesUnder("../../components/scoring/"),
  ];

  assert.ok(publicSources.length > 10, "found the public sources");

  for (const { name, source } of publicSources) {
    assert.doesNotMatch(source, /\/api\/commentary/, `${name} must not call the commentary API`);
    assert.doesNotMatch(source, /\/api\/judge/, `${name} must not call the judge API`);
    assert.doesNotMatch(source, /\/api\/admin/, `${name} must not call an admin API`);
    assert.doesNotMatch(
      source,
      /solo_registrations|team_members|father_name|mother_name|dal_panth|headshot|years_experience|horse_breed|emergency_contact|\bphone\b|confirmation_code/,
      `${name} must not touch registration fields`
    );
  }

  const parts = read("../overlay/overlay-parts.tsx");
  assert.match(parts, /useLiveState<PublicLiveState>\(LIVE_STATE_URL, \{ resyncMs: STAFF_RESYNC_MS \}\)/);
  const board = read("./LiveBoard.tsx");
  assert.match(board, /useLiveState<PublicLiveState>\(LIVE_STATE_URL\);/);
  const format = read("../../components/scoring/format.ts");
  assert.match(format, /export const LIVE_STATE_URL = "\/api\/live\/state";/);

  // Earlier rounds' standings come from the public leaderboard view only.
  const standings = read("./use-round-standings.ts");
  const tables = [...standings.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
  assert.deepEqual(tables, ["scoring_leaderboard"]);
});

test("/live is public, titled and linked from the footer but not the navbar", () => {
  const page = read("./page.tsx");
  assert.match(page, /title: "Live Scores"/);
  assert.doesNotMatch(page, /robots/);

  assert.ok(footerQuickLinks.some((link) => link.href === "/live" && link.label === "Live Scores"));
  assert.ok(!navLinks.some((link) => (link.href as string) === "/live"), "three-tab navbar rule");
  assert.equal(navLinks.length, 3);
});

test("the sitemap lists /live and leaves out the staff panels and overlays", () => {
  const sitemap = read("../sitemap.ts");
  const block = sitemap.match(/const routes = \[([\s\S]*?)\];/);
  assert.ok(block, "routes array found");

  const routes = [...block[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  assert.ok(routes.includes("/live"));

  for (const hidden of ["/judge", "/commentary", "/overlay", "/admin"]) {
    assert.ok(
      !routes.some((route) => route === hidden || route.startsWith(`${hidden}/`)),
      `${hidden} must not be in the sitemap`
    );
  }
});

test("the live-state hook follows the realtime and polling contract", () => {
  const hook = read("../../lib/scoring/use-live-state.ts");

  assert.match(hook, /^"use client";/);
  for (const table of ["scoring_runs", "scoring_live_state", "scoring_rounds"]) {
    assert.match(hook, new RegExp(`"${table}"`));
  }
  assert.match(hook, /REALTIME_DEBOUNCE_MS = 150;/);
  assert.match(hook, /POLL_WHILE_UNSUBSCRIBED_MS = 4_000;/);
  assert.match(hook, /POLL_WHILE_SUBSCRIBED_MS = 20_000;/);
  // Staff screens and overlays resync every 5 s even while subscribed.
  assert.match(hook, /STAFF_RESYNC_MS = 5_000;/);
  assert.match(hook, /\? subscribedPollMs\s*: POLL_WHILE_UNSUBSCRIBED_MS/);
  assert.match(hook, /status === "SUBSCRIBED"/);
  assert.match(hook, /"postgres_changes"/);
  assert.match(hook, /addEventListener\("visibilitychange"/);
  assert.match(hook, /addEventListener\("online"/);
  assert.match(hook, /removeChannel\(channel\)/);
  assert.match(hook, /clearTimeout\(pollTimer\)/);
  assert.match(hook, /clearTimeout\(debounceTimer\)/);
  assert.match(hook, /connection: LiveConnection/);
  assert.match(hook, /setData = useCallback/);
});

test("every animation on the live surfaces honours prefers-reduced-motion", () => {
  for (const css of ["../../components/scoring/scoring.css", "../overlay/overlay.css"]) {
    const source = read(css);
    assert.match(source, /@media \(prefers-reduced-motion: reduce\)/, css);
    assert.match(source, /animation: none !important;/, css);
  }
});

test("the judges' panel reconciles from each write and confirms before writing", () => {
  const panel = read("../judge/JudgePanel.tsx");
  const actions = read("../judge/judge-actions.ts");

  assert.match(panel, /const stateUrl = training \? withTrainingFlag\(JUDGE_STATE_URL\) : JUDGE_STATE_URL;/);
  assert.match(panel, /useLiveState<JudgeState>\(stateUrl, \{ resyncMs: STAFF_RESYNC_MS \}\)/);
  assert.match(panel, /setData\(next\)/);
  assert.match(panel, /disabled=\{resultsDisabled/);
  assert.match(panel, /role="alertdialog"/);

  for (const endpoint of ["score", "clear", "status", "live", "call-pool", "take-out"]) {
    assert.match(actions, new RegExp(`"/api/judge/${endpoint}"`));
  }
  // Points are computed by the database; the browser never sends them.
  assert.doesNotMatch(actions, /points:/);
});

test("Undo last result is one request that also puts the rider back on course", () => {
  const actions = read("../judge/judge-actions.ts");
  // sendAction is the last switch in the file.
  const clear = actions.slice(actions.lastIndexOf('case "clear":'), actions.lastIndexOf('case "void":'));

  assert.match(clear, /post\("\/api\/judge\/clear", \{\s*run_id: action\.run\.id,\s*\.\.\.\(action\.returnToRun \? \{ make_current: true \} : \{\}\),\s*\}\)/);
  // No follow-up write that could fail halfway.
  assert.doesNotMatch(clear, /\/api\/judge\/live/);
  assert.doesNotMatch(actions, /PartialActionError/);
});

test("the ticker and its results come from the server's recent_results", () => {
  const ticker = read("../overlay/ticker/TickerOverlay.tsx");

  assert.match(ticker, /state\?\.recent_results \?\? \[\]/);
  // Nothing remembered per browser: a reload or a second machine shows the same list.
  assert.doesNotMatch(ticker, /last_scored_run/);
  assert.doesNotMatch(ticker, /setResults/);
});

test("a realtime-triggered refetch carries a cache key shared by every viewer", () => {
  const hook = read("../../lib/scoring/use-live-state.ts");

  // commit_timestamp, then new.updated_at, then the current second.
  assert.match(hook, /record\.commit_timestamp/);
  assert.match(hook, /\.updated_at/);
  assert.match(hook, /Math\.floor\(Date\.now\(\) \/ 1000\) \* 1000/);
  // Events pass their key through the debounce; polls use the plain URL.
  assert.match(hook, /\(payload\) => scheduleRefetch\(realtimeCacheKey\(payload\)\)/);
  assert.match(hook, /fetch\(withCacheKey\(withSampleFlag\(url\), cacheKey\)/);
  assert.match(hook, /pollTimer = setTimeout\(\s*\(\) => void load\(\),/);
  assert.match(hook, /setTimeout\(\(\) => \{\s*const key = pendingCacheKey;\s*pendingCacheKey = null;\s*void load\(key\);\s*\}, REALTIME_DEBOUNCE_MS\)/);
  assert.match(hook, /v=\$\{encodeURIComponent\(key\)\}/);
});

test("administrators and the stream control the screens, not judges; modes change what each surface shows", () => {
  const format = read("../../components/scoring/format.ts");
  for (const mode of ["scoreboard", "leaderboard", "rider", "pool_call", "message", "blank"]) {
    assert.match(format, new RegExp(`mode: "${mode}"`));
  }

  // The judges' panel has no screen controls, and the route refuses a judge
  // (and training, which is the judges' panel) a screen or message change.
  const panel = read("../judge/JudgePanel.tsx");
  const actions = read("../judge/judge-actions.ts");
  assert.doesNotMatch(panel, /screens-title|DISPLAY_MODE_CHOICES|kind: "display"|kind: "message"|kind: "scoreboard"/);
  assert.doesNotMatch(actions, /display_mode|message: action/);
  const route = read("../api/judge/live/route.ts");
  assert.match(route, /if \(access\.role !== "admin" && changesScreens\(parsed\.value\)\) \{\s+return jsonError\(JUDGE_SCREENS_REFUSAL, 403\);/);
  assert.match(route, /sampleWriteResponse\(request, parseJudgeLiveUpdate,/);

  const admin = read("../admin/scoring/ScoringAdmin.tsx");
  assert.match(admin, /id="screens-heading"/);
  assert.match(admin, /DISPLAY_MODE_CHOICES\.map/);
  assert.match(admin, /\{ current_round_id: null, current_run_id: null \}/);
  assert.match(admin, /title: "Clear the live round\?"/);
  assert.match(admin, /href="\/api\/admin\/scoring\/export\?format=csv"/);
  assert.match(admin, /Download rider list \(CSV\)/);
  assert.match(admin, /no phone numbers, email addresses/);

  // Overlays: leaderboard mode leaves the frame to the leaderboard; rider mode
  // to the rider graphics.
  for (const file of ["../overlay/scorebug/ScorebugOverlay.tsx", "../overlay/lower-third/LowerThirdOverlay.tsx"]) {
    assert.match(read(file), /live\.display_mode === "leaderboard"\s*\) \{\s*return <OverlayFrame name="[a-z-]+" \/>;/, file);
  }
  assert.match(read("../overlay/leaderboard/LeaderboardOverlay.tsx"), /live\.display_mode === "rider"\s*\) \{\s*return <OverlayFrame name="leaderboard" \/>;/);

  // /live is the leaderboard in every mode: the modes only change the
  // stream graphics, and never hide or collapse the standings.
  const board = read("./LiveBoard.tsx");
  assert.match(board, /\n        \{standingsSection\}\n/);
  assert.doesNotMatch(board, /display_mode === "(leaderboard|rider)"|\bmode === "/);
  assert.doesNotMatch(board, /Show standings and pools/);
});

test("a decided round's podium shows on /live, the live round included", () => {
  const board = read("./LiveBoard.tsx");
  assert.match(board, /<Podium round=\{selectedRound\} \/>/);
  assert.doesNotMatch(board, /!isCurrentRound && <Podium/);
});

test("an attempt voided after a carry is not a skipped ride on the judges' panel", () => {
  const panel = read("../judge/JudgePanel.tsx");
  const format = read("../../components/scoring/format.ts");
  assert.match(format, /ALREADY_QUALIFIED_NOTE = "Already qualified — attempt not needed"/);
  assert.match(format, /round\.event_type === "single" && round\.attempts_per_rider > 1/);
  assert.match(panel, /const carried = useMemo\(\(\) => carriedEntrantKeys\(runs, round\), \[runs, round\]\);/);
  assert.match(panel, /\(run\.status === "void" && !carried\.has\(run\.entrant_key\)\)/);
});

test("the judges' panel is score, Skip, Take out, Undo last and Call next pool", () => {
  const panel = read("../judge/JudgePanel.tsx");
  const actions = read("../judge/judge-actions.ts");

  // Skip on the rider on course; the Skipped box brings them back with Ride now.
  assert.match(panel, /onClick=\{\(\) => arm\(\{ kind: "void", run: targetRun \}\)\}/);
  assert.match(panel, /id="skipped-title"/);
  assert.match(panel, /onClick=\{\(\) => arm\(\{ kind: "ride_now", run \}\)\}/);
  assert.match(actions, /if \(action\.run\.status === "void"\) \{\s+await post\("\/api\/judge\/status", \{ run_id: action\.run\.id, status: "pending" \}\);\s+\}/);

  // Take out on the rider on course; the Out box has Bring back. Both confirm.
  assert.match(panel, />\s+Take out\s+</);
  assert.match(panel, /id="out-title"/);
  assert.match(panel, />\s+Bring back\s+</);
  assert.match(actions, /post\("\/api\/judge\/take-out", \{\s+round_id: action\.roundId,\s+entrant_key: action\.entrantKey,\s+out: action\.out,\s+\}\)/);
  assert.match(actions, /confirm: "Take out"/);
  assert.match(actions, /confirm: "Bring back"/);

  // Rounds and the start list are the person in control's, on /admin/scoring.
  assert.doesNotMatch(panel, /StripButton|setDrawerOpen|setRoundsOpen|setRunSheet|startListMatcher/);

  // The database: one transaction each way, judges and administrators only.
  const sql = read("../../../supabase/migrations/20261107100000_scoring_round_first_order.sql");
  assert.match(sql, /create or replace function public\.scoring_take_out\(/);
  assert.match(sql, /grant execute on function public\.scoring_take_out\(uuid, text, boolean, uuid, text, text\)\s+to service_role;/);
  assert.match(sql, /c_note constant text := 'Taken out on the judges'' panel';/);
  const route = read("../api/judge/take-out/route.ts");
  assert.match(route, /verifyRoleRequest\(\["judge", "admin"\]\)/);
  assert.match(route, /rpc\("scoring_take_out"/);
});

test("the paper registration page is in the sitemap", () => {
  assert.match(read("../sitemap.ts"), /"\/register\/paper",/);
});

test("the training pages: anyone on a SCORING_SAMPLE_MODE=1 laptop, signed-in staff elsewhere; noindex", () => {
  for (const [route, panel] of [
    ["judge", "JudgePanel"],
    ["commentary", "CommentaryPanel"],
  ] as const) {
    const page = read(`../${route}/demo/page.tsx`);
    const local = page.indexOf('if (process.env.SCORING_SAMPLE_MODE === "1") {');
    const sessionRead = page.indexOf("await getSessionRole()");

    assert.doesNotMatch(page, /^"use client"/);
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    assert.match(page, /export const dynamic = "force-dynamic";/);
    assert.equal(isChromelessPath(`/${route}/demo`), true);

    // The laptop: shared practice, no login, decided before any session read.
    assert.ok(local > 0 && local < sessionRead, `/${route}/demo checks the environment first`);
    assert.match(
      page,
      new RegExp(`if \\(process\\.env\\.SCORING_SAMPLE_MODE === "1"\\) \\{\\s+return <${panel} sample="shared" />;\\s+\\}`)
    );

    // Everywhere else: the same Login / Access Denied gate as the real panel,
    // coming back to the practice page, open to every staff role.
    assert.match(page, /import \{ getSessionRole[^}]*\} from "@\/lib\/scoring\/auth";/);
    assert.match(page, /import \{ STAFF_ROLES \} from "@\/lib\/scoring\/types";/);
    assert.match(page, new RegExp(`kind="login"[^/]*redirectTo="/${route}/demo"`));
    assert.match(page, new RegExp(`kind="denied"[^/]*redirectTo="/${route}/demo"`));
    assert.match(page, /if \(!\(STAFF_ROLES as readonly string\[\]\)\.includes\(session\.role\)\) \{/);
    assert.match(page, new RegExp(`return <${panel} sample=\\{await sharedTrainingScope\\(\\)\\} />;\\s+\\}\\s*$`));
    assert.doesNotMatch(page, /createServiceRoleClient|notFound/);
  }

  // Not in the sitemap.
  const sitemap = read("../sitemap.ts");
  assert.doesNotMatch(sitemap, /\/demo/);
});

test("the training panels read and write a practice session and say whose it is", () => {
  const judge = read("../judge/JudgePanel.tsx");
  const commentary = read("../commentary/CommentaryPanel.tsx");
  const actions = read("../judge/judge-actions.ts");
  const words = read("../../lib/scoring/training.ts");

  assert.match(words, /shared: "Practice data — one demo shared by everyone, on every device; nothing is recorded\.",/);
  assert.match(words, /\(not yet shared between devices\)/);
  assert.doesNotMatch(words, /personal/);
  assert.match(words, /TRAINING_LABEL = "TRAINING MODE"/);

  for (const source of [judge, commentary]) {
    assert.match(source, /\(\{ sample \}: \{ sample\?: TrainingScope \}\)/);
    assert.match(source, /const training = sample !== undefined;/);
    assert.match(source, /\{TRAINING_LABEL\}/);
    assert.match(source, /\{TRAINING_BANNER\[sample\]\}/);
    // No "Log in again" in training.
    assert.match(source, /\{!training && \(\s+<Link\s+href="\/login\?redirect=/);
  }

  // The real panels link to practice, and practice links back.
  assert.match(judge, /href=\{training \? "\/judge" : "\/judge\/demo"\}/);
  assert.match(commentary, /href=\{training \? "\/commentary" : "\/commentary\/demo"\}/);
  assert.match(judge, /Practise on sample riders/);

  // The judges' link sits in the panel's sidebar, which is on screen whatever
  // the panel shows. The commentary panel has no sidebar outside its full
  // layout, so it shares one `practiceLink` across every branch — otherwise
  // the link vanishes exactly when it is wanted: before event day, when no
  // round is live.
  assert.match(commentary, /const practiceLink = \(\s+<Link/);
  assert.equal(
    commentary.match(/href=\{training \? "\/commentary" : "\/commentary\/demo"\}/g)?.length,
    1,
    "one definition of the practice link, not one per branch"
  );
  // "No round is live" / "Live scoring is not set up yet" offers it...
  const noRound = commentary.slice(
    commentary.indexOf('{state.configured ? "No round is live"'),
    commentary.indexOf('{state.configured ? "No round is live"') + 700
  );
  assert.match(noRound, /\{practiceLink\}/, "the no-round screen links to practice");
  // ...so does the error screen, beside Retry and Log in again...
  const errorScreen = commentary.slice(
    commentary.indexOf("Log in again"),
    commentary.indexOf("Log in again") + 220
  );
  assert.match(errorScreen, /\{practiceLink\}/, "the error screen links to practice");
  // ...and the full panel keeps it last in the stack on a phone.
  assert.match(commentary, /\$\{STACK_ORDER\.practice\}`\}>\{practiceLink\}</);

  assert.match(judge, /const stateUrl = training \? withTrainingFlag\(JUDGE_STATE_URL\) : JUDGE_STATE_URL;/);
  assert.match(commentary, /const stateUrl = training \? `\$\{COMMENTARY_STATE_URL\}\?sample=1` : COMMENTARY_STATE_URL;/);
  assert.match(commentary, /useLiveState<CommentaryState>\(stateUrl, \{\s*resyncMs: STAFF_RESYNC_MS,\s*\}\)/);

  // Every write carries ?sample=1 in training; reset only ever goes to the
  // practice session, and its prompt says it restarts the demo for everyone.
  assert.match(judge, /await sendAction\(action, training\)/);
  assert.match(actions, /const post = \(url: string, body: unknown\) =>\s+postJson\(training \? withTrainingFlag\(url\) : url, body\);/);
  assert.match(actions, /postJson\(withTrainingFlag\("\/api\/judge\/reset-sample"\), \{\}\)/);
  assert.match(actions, /question: TRAINING_RESET_QUESTION\[action\.scope\]/);
  assert.match(words, /This restarts the demo for everyone, on every device\./);
  assert.match(judge, /Reset training data/);
  assert.match(judge, /arm\(\{ kind: "reset", scope: sample \}\)/);

  // The hook does not subscribe to the database in training; it polls instead.
  const hook = read("../../lib/scoring/use-live-state.ts");
  assert.match(hook, /POLL_IN_TRAINING_MS = 2_000;/);
  assert.match(hook, /const training = isSampleUrl\(withSampleFlag\(url\)\);/);
  assert.match(hook, /if \(!training\) \{\s+try \{\s+supabase = createClient\(\);/);
  assert.match(hook, /typeof window === "undefined" \|\| isSampleUrl\(url\)/);
});

test("a start-list search box narrows the list in /admin/scoring", () => {
  const admin = read("../admin/scoring/ScoringAdmin.tsx");

  for (const [name, source] of [["ScoringAdmin", admin]] as const) {
    assert.match(source, /import \{ startListMatcher \} from "@\/lib\/scoring\/start-list-search";/, name);
    assert.match(source, /id="start-list-search"/, name);
    assert.match(source, /type="search"/, name);
    assert.match(source, /onChange=\{\(event\) => setStartListQuery\(event\.target\.value\)\}/, name);
    assert.match(source, /startListMatcher\(startListQuery, /, name);
  }

  // The admin start list filters entrants and running-order rows.
  assert.match(admin, /\{group\.shownEntrants\.map\(\(entrant\) => \{/);
  assert.match(admin, /\{group\.shownRuns\.map\(\(run\) => \{/);
});

test("an administrator puts a rider on course from the start list in one click", () => {
  const admin = read("../admin/scoring/ScoringAdmin.tsx");
  const start = admin.indexOf("const putOnCourse = (target: ScoringRound, run: ScoringRun) => {");
  const end = admin.indexOf("\n  };\n", start);
  const body = admin.slice(start, end);

  assert.ok(start > 0, "putOnCourse exists");
  assert.match(body, /"\/api\/judge\/live",\s+"POST",\s+\{ current_round_id: target\.id, current_run_id: run\.id \}/);
  // The live round: straight away. Another round: confirm first.
  assert.match(body, /if \(target\.id === liveRoundId\) \{\s+void go\(\);\s+return;\s+\}\s+ask\(\{/);
  assert.match(body, /confirmLabel: "Put on course"/);
  assert.match(admin, /onClick=\{\(\) => putOnCourse\(round, nextRun\)\}/);
  assert.match(admin, /onClick=\{\(\) => putOnCourse\(round, run\)\}/);
  assert.match(admin, />\s+Put on course\s+</);
  assert.match(admin, /On course now/);
});

test("both practice panels open from the admin scoring page's demo card", () => {
  const admin = read("../admin/scoring/ScoringAdmin.tsx");

  // Each panel's practice is one click from here, not only from the link at
  // the foot of the live panel — the commentary demo was hard to find.
  for (const [href, label] of [
    ["/judge/demo", /Open the judges&rsquo; practice panel/],
    ["/commentary/demo", /Open the commentary practice panel/],
  ] as const) {
    const link = admin.slice(
      admin.lastIndexOf("<Link", admin.search(label)),
      admin.search(label)
    );
    assert.ok(link.length > 0, `a Link for ${href}`);
    assert.match(link, new RegExp(`href="${href}"`));
    // A new tab, so the administrator keeps their place on this page.
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener"/);
  }

  // They sit in the "Follows the demo" card, beside the Close demo switch.
  const card = admin.slice(admin.indexOf("Follows the demo ("));
  assert.ok(card.indexOf("/commentary/demo") > 0, "the commentary demo link is in that card");
  assert.ok(
    card.indexOf("/commentary/demo") < card.indexOf("DEMO_FEED_ADDRESSES.map"),
    "the links come before the feed addresses"
  );
});

test("/live wears the panels' ledger look and keeps its hand-held layout", () => {
  const board = read("./LiveBoard.tsx");
  const parts = read("./live-parts.tsx");

  // The same paper, rules and type as the judges' and commentary panels.
  assert.match(board, /<div className=\{`\$\{LEDGER_ROOT\} flex-1`\}>/);
  assert.match(board, /<LiveStatusBar/);
  assert.match(board, /<Standings\s/);
  // The leaderboard is the page: no large on-course or last-result blocks.
  // A small strip says who is riding and who is up next, and both are
  // tagged in the standings.
  assert.doesNotMatch(board, /OnCourse|LastResult|NextRiders|last_scored_run/);
  assert.match(board, /<UpNext current=\{state\.current_run\} next=\{state\.up_next\} \/>/);
  assert.match(board, /nextKey=\{isCurrentRound \? \(state\.up_next\[0\]\?\.entrant_key \?\? null\) : null\}/);
  assert.match(board, /highlightKey=\{isCurrentRound \? \(state\.current_run\?\.entrant_key \?\? null\) : null\}/);

  // Tight rows so a pool fits one screen, thumb-sized controls, and long
  // names wrap instead of being cut. The pool letters scroll sideways.
  assert.match(parts, /min-h-11 min-w-11 shrink-0/);
  assert.match(parts, /overflow-x-auto/);
  assert.match(board, /mono min-h-11 border-b-\[3px\]/);
  assert.match(parts, /break-words text-\[15px\] font-bold uppercase/);
  assert.doesNotMatch(parts, /truncate/);
  // The tabs stay under the status bar while the list scrolls.
  assert.match(board, /sticky top-\[calc\(var\(--nav-height\)\+2\.25rem\)\]/);

  // A team opens to its riders; the judges' overrides stay marked.
  assert.match(parts, /aria-expanded=\{isOpen\}/);
  assert.match(parts, /\* Decided by the judges\./);
});
