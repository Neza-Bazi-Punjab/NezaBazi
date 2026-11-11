// The demo on the registered riders: "Reset training data" on the live site
// copies the solo entry list into the practice session (training-riders.ts
// draws it, training-registrations.ts reads it, sample-session.ts stores it).
// The draw is exercised directly; the rest is asserted from the sources, in
// the house style, so the privacy rules cannot drift silently.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSampleEngine } from "./sample-engine.ts";
import {
  REGISTERED_MESSAGE,
  REGISTERED_POOL_SIZE,
  buildRegisteredSeed,
  type RegisteredRider,
} from "./training-riders.ts";
import { balancedPoolSizes, poolLabelForIndex, toPublicLiveState, type ScoringRun } from "./types.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUND_ID = "5a3b1e00-0000-4000-7001-000000000001";

const riderId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const entry = (index: number, extra: Partial<RegisteredRider> = {}): RegisteredRider => ({
  id: riderId(index),
  full_name: `Rider ${index}`,
  horse_name: `Horse ${index}`,
  location: `Village ${index}, Amritsar, Punjab, India`,
  father_name: `Father ${index}`,
  mother_name: null,
  age: 20 + (index % 20),
  years_experience: index % 10,
  horse_breed: "Marwari",
  horse_age: 5 + (index % 8),
  ...extra,
});

const entries = (count: number) => Array.from({ length: count }, (_, index) => entry(index + 1));

/* A repeatable "random": the draw must still be a permutation. */
const steady = () => {
  let seed = 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

test("145 riders: every rider once per attempt, in balanced pools of about twelve, round by round", () => {
  const riders = entries(145);
  const seed = buildRegisteredSeed(riders, { roundId: ROUND_ID, random: steady(), now: () => 1_800_000_000_000 });

  assert.ok(seed);
  assert.equal(seed.rounds.length, 1);
  assert.equal(seed.rounds[0].id, ROUND_ID);
  assert.equal(seed.rounds[0].attempts_per_rider, 3);
  assert.equal(seed.rounds[0].pool_size, REGISTERED_POOL_SIZE);
  assert.equal(seed.rounds[0].status, "live");
  assert.equal(seed.runs.length, 145 * 3);
  assert.deepEqual(seed.runs.map((run) => run.run_order), seed.runs.map((_, index) => index + 1));
  assert.equal(new Set(seed.runs.map((run) => run.id)).size, seed.runs.length);
  assert.ok(seed.runs.every((run) => run.status === "pending" && run.result === null));
  assert.equal(seed.live.current_round_id, ROUND_ID);
  assert.equal(seed.live.current_run_id, null);
  assert.equal(seed.live.message, REGISTERED_MESSAGE);
  assert.deepEqual(seed.progression, { poolSize: 12, finalAt: 4 });

  const first: ScoringRun[] = seed.runs.filter((run) => run.attempt_number === 1);

  for (const attempt of [1, 2, 3]) {
    const block: ScoringRun[] = seed.runs.filter((run) => run.attempt_number === attempt);
    // Everyone exactly once, and each attempt in the same order and pools.
    assert.deepEqual(
      [...block.map((run) => run.solo_registration_id)].sort(),
      riders.map((rider) => rider.id).sort()
    );
    assert.deepEqual(
      block.map((run) => [run.entrant_key, run.pool_label]),
      first.map((run) => [run.entrant_key, run.pool_label])
    );
  }

  // The pools are the database draw's: the same sizes and letters, in order.
  const sizes = balancedPoolSizes(145, REGISTERED_POOL_SIZE);
  assert.deepEqual(
    first.map((run) => run.pool_label),
    sizes.flatMap((size, index) => new Array<string>(size).fill(poolLabelForIndex(index)))
  );
  assert.equal(sizes.length, 13);
  assert.ok(sizes.every((size) => size === 11 || size === 12));

  // It is a draw, not the registration order.
  assert.notDeepEqual(first.map((run) => run.solo_registration_id), riders.map((rider) => rider.id));
});

test("each run carries the rider's own name, horse and location; the facts are kept apart", () => {
  const seed = buildRegisteredSeed(
    [
      entry(1, { full_name: "  Gurpreet Singh  ", horse_name: "  ", location: "" }),
      entry(2),
      entry(2, { full_name: "A repeat of rider 2" }),
      entry(3, { full_name: "   " }),
    ],
    { roundId: ROUND_ID, random: steady() }
  );

  assert.ok(seed);
  // The repeat and the nameless row are left out.
  assert.equal(seed.runs.length, 2 * 3);
  const one = seed.runs.find((run) => run.solo_registration_id === riderId(1));
  assert.equal(one?.rider_name, "Gurpreet Singh");
  assert.equal(one?.horse_name, null);
  assert.equal(one?.rider_location, null);
  assert.equal(one?.entrant_key, `solo:${riderId(1)}`);
  assert.equal(one?.team_member_id, null);
  assert.deepEqual(Object.keys(seed.riders ?? {}).sort(), [riderId(1), riderId(2)]);
  assert.deepEqual(seed.riders?.[riderId(2)], {
    father_name: "Father 2",
    mother_name: null,
    age: 22,
    years_experience: 2,
    horse_breed: "Marwari",
    horse_age: 7,
  });
  // No run holds a fact.
  for (const run of seed.runs) {
    assert.doesNotMatch(JSON.stringify(run), /Father|Marwari/);
  }
});

test("too few riders: no seed, so the reset keeps the sample riders", () => {
  assert.equal(buildRegisteredSeed([], { roundId: ROUND_ID }), null);
  assert.equal(buildRegisteredSeed([entry(1)], { roundId: ROUND_ID }), null);
});

test("the engine runs the copied riders, carries the facts through a save, and the public shape drops the village", () => {
  const seed = buildRegisteredSeed(entries(30), { roundId: ROUND_ID, random: steady() });
  assert.ok(seed);

  const engine = createSampleEngine(seed);
  const pool = seed.runs[0].pool_label as string;
  engine.callPool(ROUND_ID, pool);
  assert.equal(engine.snapshot().live.called_pool_label, pool);
  // The judge starts the pool's first rider, as on the day.
  const onCourse = seed.runs[0].id;
  engine.setLive({ current_run_id: onCourse });
  assert.equal(engine.snapshot().live.current_run_id, onCourse);
  engine.recordResult(onCourse, "carry", false);

  const after = engine.snapshot();
  assert.equal(after.runs.find((run) => run.id === onCourse)?.points, 4);
  // A carry in Qualification voids that rider's later attempts.
  assert.equal(
    after.runs.filter((run) => run.entrant_key === seed.runs[0].entrant_key && run.status === "void").length,
    2
  );
  assert.deepEqual(after.riders, seed.riders);

  // What a save stores can be loaded again.
  const again = createSampleEngine({ ...after, progression: seed.progression }).snapshot();
  assert.deepEqual(again.riders, seed.riders);
  assert.equal(again.runs.length, after.runs.length);

  // The public state shortens the location like the real scoreboard.
  const shown = toPublicLiveState({
    configured: true,
    generated_at: new Date(0).toISOString(),
    live: after.live,
    current_round: after.rounds[0],
    current_run: null,
    last_scored_run: after.runs.find((run) => run.id === onCourse) ?? null,
    recent_results: [],
    up_next: [],
    leaderboard: [],
    pools: [],
    pool_rosters: {},
    next_pool_label: null,
    rounds: after.rounds,
  });
  assert.equal(shown.last_scored_run?.rider_location, "Amritsar, Punjab");
  assert.doesNotMatch(JSON.stringify(shown), /Village|Father|Marwari/);
});

test("the read of registrations: service role, read only, and never a contact detail", () => {
  const source = repoFile("src/lib/scoring/training-registrations.ts");
  const statements = code(source);

  assert.match(source, /^import "server-only";$/m);
  assert.match(
    statements,
    /"id, full_name, horse_name, location, father_name, mother_name, age, years_experience, horse_breed, horse_age"/
  );
  assert.doesNotMatch(
    statements,
    /phone|email|emergency|confirmation_code|checked_in|headshot|dal_panth|profile_id|select\("\*"\)/
  );
  // One table, one read, nothing written.
  assert.deepEqual(
    [...statements.matchAll(/\.from\(([^)]*)\)/g)].map(([, table]) => table.trim()),
    ["SOLO_TABLE"]
  );
  assert.match(statements, /const SOLO_TABLE = "solo_registrations";/);
  assert.doesNotMatch(statements, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.match(statements, /\.neq\("registration_source", "desk"\)/);
});

test("reset on the live site copies the riders; the laptop and a failed read keep the sample riders", () => {
  const session = repoFile("src/lib/scoring/sample-session.ts");
  const start = session.indexOf("export const reset = async (key: string) => {");
  const body = session.slice(start, session.indexOf("\n};", start));

  assert.match(
    body,
    /if \(key !== LOCAL_TRAINING_SESSION\) \{\s*try \{\s*const client = openTrainingDatabase\(\);\s*const seed = await registeredSeed\(client\);\s*if \(seed\) \{\s*await replaceStoredSession\(client, key, seed\);\s*\} else \{\s*await deleteTrainingState\(openTrainingDatabase\(\), key\);\s*\}/
  );
  // A failed read is logged and answered with null, never thrown at the judge.
  assert.match(
    session,
    /const registeredSeed = async[\s\S]*?try \{\s*return buildRegisteredSeed\(await loadRegisteredRiders\(client\), \{\s*roundId: TRAINING_QUALIFICATION_ROUND_ID,\s*\}\);\s*\} catch \(caught\) \{\s*console\.error\([\s\S]*?\);\s*return null;\s*\}/
  );
  // The replacement goes through the versioned save.
  assert.match(session, /await saveTrainingState\(client, key, seed, stored\?\.version \?\? null, null\)/);
  // The public addresses never receive the commentators' facts.
  assert.match(
    session,
    /const \{ riders: staffOnly, \.\.\.shown \} = engine\.snapshot\(\);\s*void staffOnly;\s*return shown;/
  );
  const judge = session.slice(session.indexOf("export const sampleJudgeState"));
  assert.doesNotMatch(judge.slice(0, judge.indexOf("\n};")), /riders/);
});

test("the practice row is fetched whole only when it has changed", () => {
  const db = repoFile("src/lib/scoring/training-db.ts");

  assert.match(db, /\.select\("version, updated_at"\)/);
  assert.match(
    db,
    /Number\(found\.version\) === cached\.version && Date\.parse\(found\.updated_at\) === cached\.savedAt/
  );
  // Callers never share the cached object.
  assert.match(db, /return \{ state: structuredClone\(cached\.state\), version: cached\.version \};/);
  assert.match(db, /trainingCache\(\)\.set\(key, \{ version, savedAt, state: structuredClone\(state\) \}\);/);
});
