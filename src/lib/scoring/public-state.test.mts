// The public live state (GET /api/live/state, the vMix feeds) says where a
// rider is from the way the announcer does — district and state, never the
// village they registered with — and never names the judge who scored a run.
// The shaping lives in types.ts (toPublicRun, toPublicLeaderboardRow,
// toPublicLiveState) and is tested here directly; every public builder in
// server.ts routes through it, and the staff states (judge, commentary) do not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  shortLocation,
  toPublicLeaderboardRow,
  toPublicLiveState,
  toPublicRun,
  type LeaderboardRow,
  type PublicLiveState,
  type ScoringRound,
  type ScoringRun,
} from "./types.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const VILLAGE = "Ladhewali";
const FULL = `${VILLAGE}, Jalandhar, Punjab, India`;
const SHORT = "Jalandhar, Punjab";
const JUDGE = "0f0e0d0c-0000-4000-8000-00000000000a";
const ROUND_ID = "5a3b1e00-0000-4000-9001-000000000001";
const AT = "2026-11-11T05:00:00.000Z";

const id = (group: string, index: number) =>
  `5a3b1e00-0000-4000-${group}-${String(index).padStart(12, "0")}`;

const run = (index: number, overrides: Partial<ScoringRun> = {}): ScoringRun => ({
  id: id("9002", index),
  round_id: ROUND_ID,
  run_order: index,
  attempt_number: 1,
  pool_label: "A",
  entrant_key: `solo:${id("9003", index)}`,
  solo_registration_id: id("9003", index),
  team_member_id: null,
  team_id: null,
  rider_name: `Rider ${index}`,
  horse_name: `Horse ${index}`,
  team_name: null,
  rider_location: FULL,
  status: "scored",
  result: "carry",
  points: 4,
  scored_by: JUDGE,
  scored_at: AT,
  created_at: AT,
  updated_at: AT,
  ...overrides,
});

const pending = (index: number, overrides: Partial<ScoringRun> = {}) =>
  run(index, { status: "pending", result: null, points: null, scored_by: null, scored_at: null, ...overrides });

const row = (rank: number, overrides: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  entrant_key: `solo:${id("9003", rank)}`,
  rank,
  pool_rank: rank,
  pool_label: "A",
  name: `Rider ${rank}`,
  team_name: null,
  horse_name: `Horse ${rank}`,
  location: FULL,
  points: 4,
  best_result: "carry",
  runs_scored: 1,
  runs_total: 3,
  advanced: null,
  advanced_overridden: false,
  ...overrides,
});

const round: ScoringRound = {
  id: ROUND_ID,
  event_type: "single",
  name: "Qualification",
  round_number: 0,
  attempts_per_rider: 3,
  target_points: null,
  status: "live",
  sort_order: 1,
  pool_size: 10,
  podium: null,
  created_at: AT,
  updated_at: AT,
};

/* What loadLiveSnapshot hands the public builders mid-round: every run and
   standings row still carries the registered four-part location. */
const snapshotState = (): PublicLiveState => ({
  configured: true,
  generated_at: AT,
  live: {
    current_round_id: ROUND_ID,
    current_run_id: id("9002", 3),
    called_pool_label: "A",
    display_mode: "scoreboard",
    message: null,
    updated_at: AT,
  },
  current_round: round,
  current_run: pending(3, { status: "on_course" }),
  last_scored_run: run(2),
  recent_results: [run(2), run(1, { rider_location: "Kotkapura, Faridkot, Punjab, India" })],
  up_next: [pending(4), pending(5, { rider_location: null })],
  leaderboard: [
    row(1),
    row(2, { location: SHORT }),
    row(3, {
      entrant_key: "team:1",
      name: "Doaba Riders",
      team_name: "Doaba Riders",
      horse_name: null,
      location: null,
      members: [
        {
          team_member_id: "m1",
          rider_name: "Rider A",
          horse_name: "Horse A",
          result: "strike",
          points: 2,
          status: "scored",
        },
      ],
    }),
  ],
  pools: ["A", "B"],
  pool_rosters: {
    A: [{ entrant_key: "solo:1", name: "Rider 1", team_name: null, horse_name: "Horse 1" }],
  },
  next_pool_label: "B",
  rounds: [round],
});

const runsOf = (state: PublicLiveState) =>
  [state.current_run, state.last_scored_run, ...state.recent_results, ...state.up_next].filter(
    (entry): entry is ScoringRun => entry !== null
  );

test("shortLocation keeps the district and state, and is idempotent", () => {
  assert.equal(shortLocation(FULL), SHORT);
  assert.equal(shortLocation("Jalandhar, Punjab, India"), SHORT);
  assert.equal(shortLocation(SHORT), SHORT);
  assert.equal(shortLocation(shortLocation(FULL)), SHORT);
  assert.equal(shortLocation(null), null);
  assert.equal(shortLocation(" , "), null);
});

/* The fixtures shared with public.scoring_short_location, the SQL twin the run
   insert trigger applies (migration 20261026100000). The migration's verify
   block asserts the same five, so a change to either side shows up here. */
const SHARED_FIXTURES: Array<[string, string | null]> = [
  ["Rehearsal Village, Amritsar, Punjab, India", "Amritsar, Punjab"],
  ["Amritsar, Punjab", "Amritsar, Punjab"],
  [" Amritsar ", "Amritsar"],
  [",,", null],
  ["", null],
];

test("shortLocation agrees with its SQL twin on the shared fixtures", () => {
  for (const [input, expected] of SHARED_FIXTURES) {
    assert.equal(shortLocation(input), expected, JSON.stringify(input));
  }

  const migration = repoFile("supabase/migrations/20261026100000_scoring_short_location.sql");
  const verify = migration.slice(migration.indexOf("do $verify$"), migration.indexOf("$verify$;"));

  for (const [input, expected] of SHARED_FIXTURES) {
    const sqlExpected = expected === null ? "null" : `'${expected}'`;
    assert.ok(
      verify.includes(`('${input}', ${sqlExpected})`),
      `the migration checks scoring_short_location(${JSON.stringify(input)})`
    );
  }
});

test("a public run and standings row carry district and state only, and no judge", () => {
  const scored = run(1);
  const shaped = toPublicRun(scored);

  assert.equal(shaped.rider_location, SHORT);
  assert.equal(shaped.scored_by, null);
  assert.deepEqual({ ...shaped, rider_location: FULL, scored_by: JUDGE }, scored, "nothing else changes");
  assert.equal(scored.rider_location, FULL, "the input is not mutated");
  assert.equal(toPublicRun(pending(2, { rider_location: null })).rider_location, null);

  const standing = row(1);
  const shapedRow = toPublicLeaderboardRow(standing);

  assert.equal(shapedRow.location, SHORT);
  assert.deepEqual({ ...shapedRow, location: FULL }, standing, "nothing else changes");
  assert.equal(standing.location, FULL, "the input is not mutated");
});

test("the public live state never carries a village or a judge id", () => {
  const raw = snapshotState();
  const shaped = toPublicLiveState(raw);

  assert.deepEqual(
    runsOf(shaped).map((entry) => [entry.rider_location, entry.scored_by]),
    [
      [SHORT, null], // current_run
      [SHORT, null], // last_scored_run
      [SHORT, null], // recent_results
      ["Faridkot, Punjab", null],
      [SHORT, null], // up_next
      [null, null],
    ]
  );
  assert.deepEqual(
    shaped.leaderboard.map((entry) => entry.location),
    [SHORT, SHORT, null]
  );
  assert.deepEqual(shaped.leaderboard[2].members, raw.leaderboard[2].members);

  // Nothing anywhere in the payload names a village, the country or the judge.
  assert.doesNotMatch(JSON.stringify(shaped), new RegExp(`${VILLAGE}|Kotkapura|India|${JUDGE}`));

  // Everything that carries no location passes through untouched.
  for (const key of [
    "configured",
    "generated_at",
    "live",
    "current_round",
    "pools",
    "pool_rosters",
    "next_pool_label",
    "rounds",
  ] as const) {
    assert.deepEqual(shaped[key], raw[key], key);
  }

  // The snapshot itself is untouched, and shaping twice changes nothing.
  assert.equal(raw.current_run?.rider_location, FULL);
  assert.equal(raw.leaderboard[0].location, FULL);
  assert.deepEqual(toPublicLiveState(shaped), shaped);

  // No round live: the empty state stays empty.
  const empty = toPublicLiveState({
    ...raw,
    current_run: null,
    last_scored_run: null,
    recent_results: [],
    up_next: [],
    leaderboard: [],
  });
  assert.equal(empty.current_run, null);
  assert.equal(empty.last_scored_run, null);
  assert.deepEqual([empty.recent_results, empty.up_next, empty.leaderboard], [[], [], []]);
});

test("every run and standings field of PublicLiveState is shaped; rosters carry no location", () => {
  const types = repoFile("src/lib/scoring/types.ts");
  const block = (name: string) => {
    const start = types.indexOf(`export type ${name} = {`);
    const end = types.indexOf("\n};", start);
    assert.ok(start >= 0 && end > start, `${name} is declared`);
    return types.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  };

  // A field added to PublicLiveState that holds runs or standings must be
  // shaped too, or this fails.
  const fields = [...block("PublicLiveState").matchAll(/^\s+(\w+): ([^;]+);/gm)]
    .filter(([, , type]) => /\b(ScoringRun|LeaderboardRow)\b/.test(type))
    .map(([, field]) => field)
    .sort();
  assert.deepEqual(fields, ["current_run", "last_scored_run", "leaderboard", "recent_results", "up_next"]);

  const start = types.indexOf("export const toPublicLiveState = ");
  const body = types.slice(start, types.indexOf("\n});", start));
  for (const field of fields) {
    assert.match(body, new RegExp(`\\n  ${field}: [^\\n]*toPublic(Run|LeaderboardRow)\\b`), field);
  }

  assert.doesNotMatch(block("PoolRosterEntry"), /location|scored_by/);
  assert.doesNotMatch(block("LiveState"), /location|scored_by/);
});

test("every public builder shapes its payload; the staff states keep the full location", () => {
  const server = repoFile("src/lib/scoring/server.ts");
  const body = (name: string) => {
    const start = server.indexOf(`export const ${name} = async (`);
    assert.ok(start >= 0, `${name} exists`);
    return server.slice(start, server.indexOf("\n};", start));
  };

  // GET /api/live/state and the vMix current / leaderboard feeds.
  assert.match(
    body("buildPublicLiveSnapshot"),
    /return \{ state: toPublicLiveState\(snapshot\.state\), runCount: snapshot\.runs\.length \};/
  );
  assert.match(
    server,
    /export const buildPublicLiveState = async \(\s*client: ScoringDbClient = createPublicScoringClient\(\)\s*\): Promise<PublicLiveState> =>\s*\(await buildPublicLiveSnapshot\(client\)\)\.state;/
  );

  // The vMix entrants feed, for the live round and for any other round.
  const feed = body("buildPublicRoundFeed");
  assert.equal(feed.match(/runs: [^\n]*\.map\(toPublicRun\)/g)?.length, 2, "both branches shape the runs");
  assert.match(feed, /leaderboard: snapshot\.state\.leaderboard\.map\(toPublicLeaderboardRow\),/);
  assert.match(feed, /boardResult\.rows\.map\(\(row\) => toPublicLeaderboardRow\(toLeaderboardRow\(row\)\)\)/);

  // No older, partial redaction left behind.
  assert.doesNotMatch(server, /redactRun|redactPublicState/);

  // Staff only: the announcer may want the village; the judge sees the id.
  assert.doesNotMatch(body("buildJudgeState"), /toPublic/);
  assert.doesNotMatch(body("buildCommentaryState"), /toPublic/);

  // Training mode's public state has the same public shape.
  const session = repoFile("src/lib/scoring/sample-session.ts");
  assert.match(
    session,
    /export const samplePublicLiveState = \(key: string = LOCAL_TRAINING_SESSION\): PublicLiveState =>\s+toPublicLiveState\(assemble\(key\)\.state\);/
  );
  const judgeStart = session.indexOf("export const sampleJudgeState");
  assert.doesNotMatch(session.slice(judgeStart, session.indexOf("\n};", judgeStart)), /toPublic/);

  // And the public route serves exactly those two.
  const route = repoFile("src/app/api/live/state/route.ts");
  assert.match(route, /NextResponse\.json\(samplePublicLiveState\(LOCAL_TRAINING_SESSION\)/);
  assert.match(route, /const state = await buildPublicLiveState\(\);/);
});
