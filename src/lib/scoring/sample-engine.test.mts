// Behaviour of the training-mode engine (sample-engine.ts) against the rules
// of the database functions in 20261025120000_live_scoring.sql (§4 and §5 of
// the live-scoring design spec), and of the shared start-list search.
import assert from "node:assert/strict";
import test from "node:test";

import {
  SampleRefusal,
  computeSampleLeaderboard,
  createSampleEngine,
  type SampleSeed,
} from "./sample-engine.ts";
import { startListMatcher } from "./start-list-search.ts";
import { createTrainingStore } from "./training-store.ts";
import { RESULT_POINTS, type RunResult, type ScoringRound, type ScoringRun } from "./types.ts";

const T0 = Date.parse("2026-11-11T04:30:00.000Z");
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const id = (prefix: string, index: number) =>
  `5a3b1e00-0000-4000-${prefix}-${String(index).padStart(12, "0")}`;

const QUAL = id("9001", 1);
const SECTION = id("9001", 2);
const EMPTY = id("9001", 3);

const round = (overrides: Partial<ScoringRound> & Pick<ScoringRound, "id">): ScoringRound => ({
  event_type: "single",
  name: "Qualification",
  round_number: 0,
  attempts_per_rider: 3,
  target_points: null,
  status: "live",
  sort_order: 1,
  pool_size: 2,
  podium: null,
  created_at: iso(-60),
  updated_at: iso(-60),
  ...overrides,
});

const run = (
  overrides: Partial<ScoringRun> & Pick<ScoringRun, "id" | "round_id" | "run_order" | "entrant_key" | "rider_name">
): ScoringRun => ({
  attempt_number: 1,
  pool_label: null,
  solo_registration_id: null,
  team_member_id: null,
  team_id: null,
  horse_name: null,
  team_name: null,
  rider_location: null,
  status: "pending",
  result: null,
  points: null,
  scored_by: null,
  scored_at: null,
  created_at: iso(-60),
  updated_at: iso(-60),
  ...overrides,
});

/* Qualification: Single, three attempts, Pool A (Asa, Bir) then Pool B
   (Cheema, Dhami). Within a pool, attempt 1 for everyone, then 2, then 3.
   Section 1: two teams of four, target 8, all scored. "Empty" is an upcoming
   Single round with no runs. */
const RIDERS = [
  { name: "Asa Singh", pool: "A" },
  { name: "Bir Singh", pool: "A" },
  { name: "Cheema Singh", pool: "B" },
  { name: "Dhami Singh", pool: "B" },
] as const;

const seed = (): SampleSeed => {
  const runs: ScoringRun[] = [];
  let order = 0;

  for (const pool of ["A", "B"]) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      RIDERS.forEach((rider, index) => {
        if (rider.pool !== pool) {
          return;
        }

        order += 1;
        runs.push(
          run({
            id: id("9101", order),
            round_id: QUAL,
            run_order: order,
            attempt_number: attempt,
            pool_label: pool,
            entrant_key: `solo:${id("9201", index + 1)}`,
            solo_registration_id: id("9201", index + 1),
            rider_name: rider.name,
            horse_name: `Horse ${index + 1}`,
          })
        );
      });
    }
  }

  const sectionResults: RunResult[][] = [
    ["carry", "strike", "carry", "miss"], // 10 >= 8: through
    ["strike", "miss", "strike", "strike"], // 6 < 8: out
  ];

  sectionResults.forEach((results, team) => {
    results.forEach((result, rider) => {
      const index = team * 4 + rider + 1;
      runs.push(
        run({
          id: id("9102", index),
          round_id: SECTION,
          run_order: index,
          entrant_key: `team:${id("9202", team + 1)}`,
          team_id: id("9202", team + 1),
          team_member_id: id("9203", index),
          team_name: team === 0 ? "Sher-e-Punjab" : "Doaba Riders",
          rider_name: `Team ${team + 1} Rider ${rider + 1}`,
          status: "scored",
          result,
          points: RESULT_POINTS[result],
          scored_at: iso(-30 + index),
        })
      );
    });
  });

  runs[0].status = "on_course";

  return {
    rounds: [
      round({ id: QUAL }),
      round({
        id: SECTION,
        event_type: "section",
        name: "Section 1",
        round_number: 1,
        attempts_per_rider: 1,
        target_points: 8,
        status: "complete",
        sort_order: 2,
        pool_size: null,
      }),
      round({ id: EMPTY, name: "Aarhi 1", round_number: 1, attempts_per_rider: 1, status: "upcoming", sort_order: 3 }),
    ],
    runs,
    live: {
      current_round_id: QUAL,
      current_run_id: runs[0].id,
      called_pool_label: "A",
      display_mode: "scoreboard",
      message: null,
      updated_at: iso(-1),
    },
  };
};

/* A clock that moves one second per call, starting before the seed's data. */
const clock = () => {
  let now = T0 - 86_400_000;
  return () => (now += 1000);
};

const engine = () => createSampleEngine(seed(), clock());

const runAt = (snapshot: SampleSeed, roundId: string, order: number) => {
  const found = snapshot.runs.find((item) => item.round_id === roundId && item.run_order === order);
  assert.ok(found, `run ${order} exists`);
  return found;
};

const refusal = (code: "P0002" | "22023", message: string) => (error: unknown) => {
  assert.ok(error instanceof SampleRefusal, "throws a SampleRefusal");
  assert.equal(error.code, code);
  assert.equal(error.status, code === "P0002" ? 404 : 409);
  assert.equal(error.message, message);
  return true;
};

const qualificationRows = (snapshot: SampleSeed) =>
  computeSampleLeaderboard(
    snapshot.rounds.find((item) => item.id === QUAL) as ScoringRound,
    snapshot.runs.filter((item) => item.round_id === QUAL)
  );

test("points match RESULT_POINTS and the database's generated column", () => {
  const session = engine();

  // A carry would void the rider's later attempts, so it comes last.
  for (const [index, result] of (["miss", "strike", "carry"] as const).entries()) {
    const scored = session.recordResult(id("9101", index + 1), result, false);
    assert.equal(scored.points, RESULT_POINTS[result]);
    assert.equal(scored.status, "scored");
  }
});

test("scoring the current run puts the next pending run on course", () => {
  const session = engine();
  session.recordResult(id("9101", 1), "strike", false);
  let snapshot = session.snapshot();

  assert.equal(snapshot.live.current_run_id, id("9101", 2));
  assert.equal(runAt(snapshot, QUAL, 2).status, "on_course");

  // Scoring a run that is not current leaves the pointer alone.
  session.recordResult(id("9101", 4), "miss", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 2));

  // Skipping the current run moves on like a score, past runs already scored.
  session.setRunStatus(id("9101", 2), "void");
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 3));
});

test("the called pool follows the rider into the next pool; the end of the round leaves nobody on course", () => {
  const session = engine();
  session.setLive({ current_run_id: id("9101", 6) });
  session.recordResult(id("9101", 6), "miss", false);
  let snapshot = session.snapshot();

  assert.equal(snapshot.live.current_run_id, id("9101", 7));
  assert.equal(snapshot.live.called_pool_label, "B");

  session.setLive({ current_run_id: id("9101", 12) });
  session.recordResult(id("9101", 12), "miss", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(snapshot.live.current_round_id, QUAL);
});

test("a run with a result needs Change result (override); skipping it is refused", () => {
  const session = engine();
  session.recordResult(id("9101", 1), "strike", false);

  assert.throws(
    () => session.recordResult(id("9101", 1), "miss", false),
    refusal("22023", "This run already has a result. Use Change result to replace it.")
  );
  assert.throws(
    () => session.setRunStatus(id("9101", 1), "void"),
    refusal("22023", "This run has a result. Clear the result first.")
  );

  const changed = session.recordResult(id("9101", 1), "miss", true);
  assert.equal(changed.result, "miss");
  assert.equal(changed.points, 0);

  session.setRunStatus(id("9101", 3), "void");
  assert.throws(
    () => session.recordResult(id("9101", 3), "carry", false),
    refusal("22023", "This run was skipped. Restore it before recording a result.")
  );
  assert.throws(
    () => session.setRunStatus(id("9101", 3), "void"),
    refusal("22023", "This run is already skipped.")
  );
  assert.throws(
    () => session.setRunStatus(id("9101", 4), "pending"),
    refusal("22023", "Only a skipped run can be restored.")
  );
  assert.throws(
    () => session.recordResult(id("9999", 1), "carry", false),
    refusal("P0002", "That run is no longer in the start list. Refresh and try again.")
  );
  assert.throws(
    () => session.clearResult(id("9101", 4), false),
    refusal("22023", "This run has no result to clear.")
  );
});

test("a qualifying carry voids the rider's other attempts and the pointer skips them", () => {
  const session = engine();
  // Asa: attempt 1 (run 1) carried. Attempts 2 and 3 are runs 3 and 5.
  session.recordResult(id("9101", 1), "carry", false);
  let snapshot = session.snapshot();

  assert.equal(runAt(snapshot, QUAL, 3).status, "void");
  assert.equal(runAt(snapshot, QUAL, 5).status, "void");
  assert.equal(snapshot.live.current_run_id, id("9101", 2));

  // Bir (run 2) misses: the pointer goes to run 4 (Bir's attempt 2), past
  // Asa's voided run 3.
  session.recordResult(id("9101", 2), "miss", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 4));

  // The carry stands even though runs remain: through at once.
  const asa = qualificationRows(snapshot).find((row) => row.name === "Asa Singh");
  assert.equal(asa?.advanced, true);
  assert.equal(asa?.runs_total, 1);
  assert.equal(asa?.runs_scored, 1);

  // Changing the carry to a strike puts the two attempts back.
  session.recordResult(id("9101", 1), "strike", true);
  snapshot = session.snapshot();
  assert.equal(runAt(snapshot, QUAL, 3).status, "pending");
  assert.equal(runAt(snapshot, QUAL, 5).status, "pending");

  // Carry again, then clear it: restored again.
  session.recordResult(id("9101", 1), "carry", true);
  assert.equal(runAt(session.snapshot(), QUAL, 3).status, "void");
  session.clearResult(id("9101", 1), false);
  snapshot = session.snapshot();
  assert.equal(runAt(snapshot, QUAL, 3).status, "pending");
  assert.equal(runAt(snapshot, QUAL, 5).status, "pending");
  assert.equal(runAt(snapshot, QUAL, 1).status, "pending");
});

test("a carry while the rider is on course for a later attempt moves the pointer past it", () => {
  const session = engine();
  session.setLive({ current_run_id: id("9101", 3) }); // Asa, attempt 2
  session.recordResult(id("9101", 1), "carry", true); // attempt 1 changed to a carry
  const snapshot = session.snapshot();

  assert.equal(runAt(snapshot, QUAL, 3).status, "void");
  assert.equal(snapshot.live.current_run_id, id("9101", 4));
});

test("with a second carry, clearing one keeps the attempts voided under the other", () => {
  const session = engine();
  session.recordResult(id("9101", 1), "strike", false);
  session.setLive({ current_run_id: id("9101", 3) });
  session.recordResult(id("9101", 3), "carry", false); // voids run 5
  session.recordResult(id("9101", 1), "carry", true); // second carry; nothing left to void
  session.clearResult(id("9101", 3), false);
  const snapshot = session.snapshot();

  assert.equal(runAt(snapshot, QUAL, 5).status, "void", "still not needed: attempt 1 carried");
});

test("Undo last result puts the rider back on course and the next rider back to waiting", () => {
  const session = engine();
  session.recordResult(id("9101", 1), "miss", false);
  assert.equal(session.snapshot().live.current_run_id, id("9101", 2));

  const cleared = session.clearResult(id("9101", 1), true);
  const snapshot = session.snapshot();

  assert.equal(cleared.status, "on_course");
  assert.equal(cleared.result, null);
  assert.equal(snapshot.live.current_run_id, id("9101", 1));
  assert.equal(runAt(snapshot, QUAL, 2).status, "pending");
});

test("Call Pool brings the pool's first rider still to ride on course and shows the roster", () => {
  const session = engine();
  const live = session.callPool(QUAL, "B");
  let snapshot = session.snapshot();

  assert.equal(live.display_mode, "pool_call");
  assert.equal(live.called_pool_label, "B");
  assert.equal(live.current_run_id, id("9101", 7));
  assert.equal(runAt(snapshot, QUAL, 7).status, "on_course");
  assert.equal(runAt(snapshot, QUAL, 1).status, "pending", "the rider leaving the course waits again");
  assert.equal(
    snapshot.runs.filter((item) => item.round_id === QUAL && item.status === "on_course").length,
    1
  );

  // Calling again does not skip the rider already on course.
  assert.equal(session.callPool(QUAL, "B").current_run_id, id("9101", 7));

  // The first fresh result returns the screens to the scoreboard…
  session.recordResult(id("9101", 7), "strike", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.display_mode, "scoreboard");
  assert.equal(snapshot.live.current_run_id, id("9101", 8));

  // …but changing a result does not.
  session.callPool(QUAL, "B");
  session.recordResult(id("9101", 7), "miss", true);
  assert.equal(session.snapshot().live.display_mode, "pool_call");

  assert.throws(
    () => session.callPool(QUAL, "C"),
    refusal("P0002", "Pool C is not in Qualification.")
  );
  assert.throws(() => session.callPool(id("9999", 9), "A"), refusal("P0002", "That round no longer exists."));
});

test("Call Pool refuses a pool that has finished", () => {
  const session = engine();

  for (let order = 1; order <= 6; order += 1) {
    session.setLive({ current_run_id: id("9101", order) });
    session.recordResult(id("9101", order), "miss", false);
  }

  assert.throws(
    () => session.callPool(QUAL, "A"),
    refusal("22023", "Every rider in Pool A has already ridden.")
  );
});

test("set live: the run must be in the round and still to ride; switching rounds clears the rider", () => {
  const session = engine();

  assert.throws(
    () => session.setLive({ current_run_id: id("9102", 1) }),
    refusal("22023", "That rider is not in the live round.")
  );

  session.recordResult(id("9101", 1), "miss", false);
  assert.throws(
    () => session.setLive({ current_run_id: id("9101", 1) }),
    refusal("22023", "That run already has a result. Clear it before making it current.")
  );
  session.setRunStatus(id("9101", 3), "void");
  assert.throws(
    () => session.setLive({ current_run_id: id("9101", 3) }),
    refusal("22023", "That run was skipped. Restore it before making it current.")
  );
  assert.throws(
    () => session.setLive({ current_round_id: null, current_run_id: id("9101", 4) }),
    refusal("22023", "Choose a round before choosing a rider.")
  );
  assert.throws(() => session.setLive({}), refusal("22023", "Nothing to change."));
  assert.throws(
    () => session.setLive({ display_mode: "pool_call", called_pool_label: null }),
    refusal("22023", "Call a pool before showing the pool call screen.")
  );
  assert.throws(
    () => session.setLive({ called_pool_label: "Q" }),
    refusal("22023", "Pool Q is not in the live round.")
  );

  // A rider in another pool: on course, the previous rider waits again, and
  // the called pool follows the riding forward.
  session.setLive({ current_run_id: id("9101", 8) });
  let snapshot = session.snapshot();
  assert.equal(runAt(snapshot, QUAL, 8).status, "on_course");
  assert.equal(runAt(snapshot, QUAL, 2).status, "pending");
  assert.equal(snapshot.live.called_pool_label, "B");

  // Switching round without a run: nobody on course; an upcoming round goes live.
  session.setLive({ current_round_id: EMPTY });
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_round_id, EMPTY);
  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(snapshot.live.called_pool_label, null);
  assert.equal(runAt(snapshot, QUAL, 8).status, "pending");
  assert.equal(snapshot.rounds.find((item) => item.id === EMPTY)?.status, "live");

  // Round and run together (the administrator's "Put on course" in another round).
  session.setLive({ current_round_id: QUAL, current_run_id: id("9101", 9) });
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 9));
  assert.equal(runAt(snapshot, QUAL, 9).status, "on_course");

  // Message and display mode.
  session.setLive({ message: "  Short break  ", display_mode: "message" });
  snapshot = session.snapshot();
  assert.equal(snapshot.live.message, "Short break");
  assert.equal(snapshot.live.display_mode, "message");
  session.setLive({ message: "" });
  assert.equal(session.snapshot().live.message, null);
});

test("the leaderboard follows the view: best run, team sum, advanced, rank and pool rank", () => {
  const session = engine();
  // Pool A attempt 1: Asa strike, Bir miss. Attempt 2: Bir carry.
  session.recordResult(id("9101", 1), "strike", false);
  session.recordResult(id("9101", 2), "miss", false);
  session.recordResult(id("9101", 4), "carry", false);
  const snapshot = session.snapshot();
  const rows = qualificationRows(snapshot);
  const byName = new Map(rows.map((row) => [row.name, row]));

  const bir = byName.get("Bir Singh");
  const asa = byName.get("Asa Singh");
  const cheema = byName.get("Cheema Singh");
  assert.ok(bir && asa && cheema);

  assert.equal(bir.points, 4);
  assert.equal(bir.best_result, "carry");
  assert.equal(bir.advanced, true);
  assert.equal(bir.runs_total, 2, "the voided third attempt does not count");
  assert.equal(bir.rank, 1);
  assert.equal(bir.pool_rank, 1);

  assert.equal(asa.points, 2);
  assert.equal(asa.advanced, null, "undecided while attempts remain");
  assert.equal(asa.rank, 2);
  assert.equal(asa.pool_rank, 2);

  assert.equal(cheema.points, 0);
  assert.equal(cheema.runs_scored, 0);
  assert.equal(cheema.pool_label, "B");
  assert.equal(cheema.pool_rank, 1);
  assert.equal(cheema.horse_name, "Horse 3");

  // Points desc, then fewer runs scored first, then name.
  assert.deepEqual(
    rows.map((row) => row.name),
    ["Bir Singh", "Asa Singh", "Cheema Singh", "Dhami Singh"]
  );

  // A Single rider with every attempt ridden and no carry is out.
  const finished = createSampleEngine(seed(), clock());
  for (const order of [1, 3, 5]) {
    finished.recordResult(id("9101", order), "strike", true);
  }
  const asaDone = qualificationRows(finished.snapshot()).find((row) => row.name === "Asa Singh");
  assert.equal(asaDone?.advanced, false);
  assert.equal(asaDone?.points, 2, "best run, not the sum");

  // Section: the team's sum against the target, members in run order.
  const section = computeSampleLeaderboard(
    snapshot.rounds.find((item) => item.id === SECTION) as ScoringRound,
    snapshot.runs.filter((item) => item.round_id === SECTION)
  );
  assert.deepEqual(
    section.map((row) => [row.name, row.points, row.advanced, row.rank]),
    [
      ["Sher-e-Punjab", 10, true, 1],
      ["Doaba Riders", 6, false, 2],
    ]
  );
  assert.equal(section[0].horse_name, null);
  assert.deepEqual(
    section[0].members?.map((member) => member.rider_name),
    ["Team 1 Rider 1", "Team 1 Rider 2", "Team 1 Rider 3", "Team 1 Rider 4"]
  );
});

test("the engine owns its copy: the seed is never changed and snapshots are deep copies", () => {
  const original = seed();
  const frozen = JSON.stringify(original);
  const session = createSampleEngine(original, clock());
  session.recordResult(id("9101", 1), "carry", false);

  assert.equal(JSON.stringify(original), frozen);

  const snapshot = session.snapshot();
  snapshot.runs[0].result = "miss";
  snapshot.live.current_run_id = null;
  assert.equal(runAt(session.snapshot(), QUAL, 1).result, "carry");
  assert.notEqual(session.snapshot().live.current_run_id, null);
});

test("a result recorded in training is newer than every seeded one", () => {
  // The clock starts a day before the seed's timestamps.
  const session = engine();
  const scored = session.recordResult(id("9101", 1), "strike", false);
  const seeded = Math.max(
    ...seed()
      .runs.map((item) => (item.scored_at ? Date.parse(item.scored_at) : 0))
  );

  assert.ok(scored.scored_at && Date.parse(scored.scored_at) > seeded);
  assert.ok(Date.parse(session.snapshot().live.updated_at) > Date.parse(seed().live.updated_at));
});

test("the start-list search matches names, teams, horses and pools as you type", () => {
  const pools = ["A", "B"];
  const rows = [
    { texts: ["Harpreet Singh Sandhu", null, "Toofan"], pool: "A" },
    { texts: ["Balraj Singh Sidhu", "Doaba Riders", "Moti"], pool: "B" },
  ];
  const names = (query: string) =>
    rows.filter(startListMatcher(query, pools)).map((row) => row.texts[0]);

  assert.deepEqual(names(""), ["Harpreet Singh Sandhu", "Balraj Singh Sidhu"]);
  assert.deepEqual(names("  "), ["Harpreet Singh Sandhu", "Balraj Singh Sidhu"]);
  assert.deepEqual(names("sandhu"), ["Harpreet Singh Sandhu"]);
  assert.deepEqual(names("TOOF"), ["Harpreet Singh Sandhu"]);
  assert.deepEqual(names("doaba"), ["Balraj Singh Sidhu"]);
  assert.deepEqual(names("b"), ["Balraj Singh Sidhu"], "a pool letter picks the pool");
  assert.deepEqual(names("Pool A"), ["Harpreet Singh Sandhu"]);
  assert.deepEqual(names("pool  b"), ["Balraj Singh Sidhu"]);
  assert.deepEqual(names("singh   s"), ["Harpreet Singh Sandhu", "Balraj Singh Sidhu"]);
  assert.deepEqual(names("z"), [], "no Pool Z: searched as text");
  assert.deepEqual(names("nobody"), []);
});

test("practice sessions: one per key, the least recently used dropped at the cap, idle ones dropped", () => {
  let time = 0;
  let created = 0;
  const store = createTrainingStore(() => ({ id: ++created }), {
    max: 3,
    idleMs: 1000,
    now: () => time,
  });

  const alice = store.get("user:alice");
  assert.equal(store.get("user:alice"), alice, "the same key returns the same session");
  const bob = store.get("user:bob");
  assert.notEqual(bob, alice, "two people never share a session");
  store.get("local");
  assert.deepEqual(store.keys(), ["user:alice", "user:bob", "local"]);

  // Using Alice's session makes Bob's the least recently used, so the fourth
  // session pushes Bob's out and the store stays at the cap.
  time = 10;
  store.get("user:alice");
  store.get("user:carol");
  assert.equal(store.size(), 3);
  assert.deepEqual(store.keys(), ["local", "user:alice", "user:carol"]);
  assert.notEqual(store.get("user:bob"), bob, "an evicted session starts again");
  assert.deepEqual(store.keys(), ["user:alice", "user:carol", "user:bob"]);

  // Reset replaces only that key's session.
  const carol = store.get("user:carol");
  const aliceBefore = store.get("user:alice");
  const fresh = store.reset("user:carol");
  assert.notEqual(fresh, carol);
  assert.equal(store.get("user:carol"), fresh);
  assert.equal(store.get("user:alice"), aliceBefore);

  // Idle longer than idleMs: dropped on the next touch; recent ones stay.
  time = 500;
  store.get("user:alice");
  time = 1200;
  store.get("user:dev");
  assert.deepEqual(store.keys(), ["user:alice", "user:dev"], "Bob and Carol idled out");
});
