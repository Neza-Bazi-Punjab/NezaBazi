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

/* The next rider in order, as the judges' panel offers Start for it: the
   first pending run after the rider on course or, with nobody on course,
   after the last run ridden. */
const upNext = (snapshot: SampleSeed, roundId = QUAL) => {
  const roundRuns = snapshot.runs
    .filter((item) => item.round_id === roundId)
    .sort((a, b) => a.run_order - b.run_order);
  const current = roundRuns.find((item) => item.id === snapshot.live.current_run_id);
  const after =
    current?.run_order ??
    Math.max(0, ...roundRuns.filter((item) => item.status === "scored").map((item) => item.run_order));
  return roundRuns.find((item) => item.status === "pending" && item.run_order > after)?.id ?? null;
};

const onCourse = (snapshot: SampleSeed) =>
  snapshot.runs.filter((item) => item.status === "on_course").map((item) => item.id);

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

test("scoring the rider on course leaves nobody on course; the next rider waits for Start", () => {
  const session = engine();
  session.recordResult(id("9101", 1), "strike", false);
  let snapshot = session.snapshot();

  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(runAt(snapshot, QUAL, 2).status, "pending");
  assert.deepEqual(onCourse(snapshot), []);
  assert.equal(upNext(snapshot), id("9101", 2), "up next names the next rider");
  assert.equal(snapshot.live.called_pool_label, "A", "a result leaves the called pool alone");

  // Start: the judge puts the next rider on course.
  session.setLive({ current_run_id: id("9101", 2) });
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 2));
  assert.equal(runAt(snapshot, QUAL, 2).status, "on_course");

  // Scoring a run that is not current leaves the pointer alone.
  session.recordResult(id("9101", 4), "miss", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 2));

  // Skipping the rider on course leaves the course empty too; up next is the
  // next run still to ride after the last one ridden (run 4 was scored out of
  // order, so run 3 waits in the panel's Skipped box).
  session.setRunStatus(id("9101", 2), "void");
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, null);
  assert.deepEqual(onCourse(snapshot), []);
  assert.equal(runAt(snapshot, QUAL, 3).status, "pending");
  assert.equal(upNext(snapshot), id("9101", 5));
});

test("the called pool follows the rider into the next pool; the end of the round leaves nobody on course", () => {
  const session = engine();
  session.setLive({ current_run_id: id("9101", 6) });
  session.recordResult(id("9101", 6), "miss", false);
  let snapshot = session.snapshot();

  // Pool A's last ride: nobody on course and A still called until Start.
  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(snapshot.live.called_pool_label, "A");
  assert.equal(upNext(snapshot), id("9101", 7));

  // Start Pool B's first rider: the called pool follows.
  session.setLive({ current_run_id: id("9101", 7) });
  snapshot = session.snapshot();
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
  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(upNext(snapshot), id("9101", 2));

  // Bir (run 2) misses: up next is run 4 (Bir's attempt 2), past Asa's
  // voided run 3.
  session.setLive({ current_run_id: id("9101", 2) });
  session.recordResult(id("9101", 2), "miss", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(upNext(snapshot), id("9101", 4));

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

test("a carry while the rider is on course for a later attempt takes them off the course", () => {
  const session = engine();
  session.setLive({ current_run_id: id("9101", 3) }); // Asa, attempt 2
  session.recordResult(id("9101", 1), "carry", true); // attempt 1 changed to a carry
  const snapshot = session.snapshot();

  assert.equal(runAt(snapshot, QUAL, 3).status, "void");
  assert.equal(snapshot.live.current_run_id, null);
  assert.deepEqual(onCourse(snapshot), []);
  assert.equal(upNext(snapshot), id("9101", 2));
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
  session.setLive({ current_run_id: id("9101", 2) }); // the judge started the next rider

  const cleared = session.clearResult(id("9101", 1), true);
  const snapshot = session.snapshot();

  assert.equal(cleared.status, "on_course");
  assert.equal(cleared.result, null);
  assert.equal(snapshot.live.current_run_id, id("9101", 1));
  assert.equal(runAt(snapshot, QUAL, 2).status, "pending");
});

test("Call Pool brings the pool to the start and shows the roster; nobody is on course until Start", () => {
  const session = engine();
  const live = session.callPool(QUAL, "B");
  let snapshot = session.snapshot();

  assert.equal(live.display_mode, "pool_call");
  assert.equal(live.called_pool_label, "B");
  assert.equal(live.current_run_id, null);
  assert.equal(runAt(snapshot, QUAL, 7).status, "pending", "Pool B's first rider waits for Start");
  assert.equal(runAt(snapshot, QUAL, 1).status, "pending", "the rider leaving the course waits again");
  assert.deepEqual(onCourse(snapshot), []);

  // Calling again changes nothing.
  assert.equal(session.callPool(QUAL, "B").current_run_id, null);

  // Start: Pool B's first rider on course, Pool B still called.
  session.setLive({ current_run_id: id("9101", 7) });
  snapshot = session.snapshot();
  assert.equal(snapshot.live.current_run_id, id("9101", 7));
  assert.equal(snapshot.live.called_pool_label, "B");
  assert.equal(snapshot.live.display_mode, "pool_call");
  assert.deepEqual(onCourse(snapshot), [id("9101", 7)]);

  // Calling the pool while its rider rides takes them off the course too.
  session.callPool(QUAL, "B");
  assert.deepEqual(onCourse(session.snapshot()), []);
  session.setLive({ current_run_id: id("9101", 7) });

  // The first fresh result returns the screens to the scoreboard…
  session.recordResult(id("9101", 7), "strike", false);
  snapshot = session.snapshot();
  assert.equal(snapshot.live.display_mode, "scoreboard");
  assert.equal(snapshot.live.current_run_id, null);
  assert.equal(upNext(snapshot), id("9101", 8));

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
  snapshot.live.current_run_id = id("9101", 2);
  assert.equal(runAt(session.snapshot(), QUAL, 1).result, "carry");
  assert.equal(session.snapshot().live.current_run_id, null);
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

/* Training progression ------------------------------------------------------- */

const dayRider = (index: number) => `solo:${id("7002", index + 1)}`;

/* 30 riders, Pools A–C of ten, three attempts laid out round by round. */
const daySeed = (): SampleSeed => {
  const qual = round({ id: QUAL, pool_size: 10 });
  const runs: ScoringRun[] = [];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (let index = 0; index < 30; index += 1) {
      runs.push(
        run({
          id: id("7003", runs.length + 1),
          round_id: QUAL,
          run_order: runs.length + 1,
          attempt_number: attempt,
          pool_label: "ABC"[Math.floor(index / 10)],
          entrant_key: dayRider(index),
          solo_registration_id: id("7002", index + 1),
          rider_name: `Rider ${index + 1}`,
        })
      );
    }
  }

  return {
    rounds: [qual],
    runs,
    live: {
      current_round_id: QUAL,
      current_run_id: null,
      called_pool_label: null,
      display_mode: "scoreboard",
      message: null,
      updated_at: iso(-60),
    },
    progression: { poolSize: 10, finalAt: 3 },
  };
};

const liveRound = (engine: ReturnType<typeof createSampleEngine>) => {
  const snap = engine.snapshot();
  return snap.rounds.find((candidate) => candidate.id === snap.live.current_round_id)!;
};

/* When nobody is on course: calls the next rider's pool if the riding has
   moved to a new pool, taps Start for them, and scores whoever is on course. */
const rideRound = (
  engine: ReturnType<typeof createSampleEngine>,
  decide: (run: ScoringRun) => RunResult
) => {
  const roundId = liveRound(engine).id;
  const order: string[] = [];

  for (let guard = 0; guard < 500; guard += 1) {
    const snap = engine.snapshot();

    if (snap.live.current_round_id !== roundId) {
      break;
    }

    const open = snap.runs
      .filter((candidate) => candidate.round_id === roundId && candidate.status === "pending")
      .sort((a, b) => a.run_order - b.run_order);
    let current = snap.runs.find((candidate) => candidate.id === snap.live.current_run_id);

    if (!current) {
      if (open.length === 0) {
        break;
      }

      if (snap.live.called_pool_label !== open[0].pool_label) {
        engine.callPool(roundId, open[0].pool_label!);
      }

      engine.setLive({ current_run_id: open[0].id });
      current = engine.snapshot().runs.find((candidate) => candidate.id === open[0].id)!;
    }

    order.push(`${current.attempt_number}${current.pool_label}`);
    engine.recordResult(current.id, decide(current), false);
  }

  return order;
};

test("training runs the whole day: Qualification round by round, then Aarhi rounds to the Final", () => {
  const engine = createSampleEngine(daySeed(), () => T0);
  const index = (run: ScoringRun) => Number(run.rider_name.split(" ")[1]) - 1;

  // Qualification: riders 1–14 carry on their third attempt, the rest never.
  const qualOrder = rideRound(engine, (run) =>
    index(run) < 14 && run.attempt_number === 3 ? "carry" : "strike"
  );
  const blocks = qualOrder.filter((block, at) => block !== qualOrder[at - 1]);
  assert.deepEqual(blocks, ["1A", "1B", "1C", "2A", "2B", "2C", "3A", "3B", "3C"]);

  let snap = engine.snapshot();
  assert.equal(snap.rounds.find((candidate) => candidate.id === QUAL)!.status, "complete");
  let aarhi = liveRound(engine);
  assert.equal(aarhi.name, "Aarhi Round 1");
  assert.equal(aarhi.attempts_per_rider, 1);
  assert.equal(aarhi.status, "live");
  assert.equal(snap.live.current_run_id, null);
  const aarhiRuns = snap.runs.filter((candidate) => candidate.round_id === aarhi.id);
  assert.equal(aarhiRuns.length, 14);
  assert.deepEqual(
    aarhiRuns.map((candidate) => candidate.pool_label).join(""),
    "AAAAAAABBBBBBB"
  );
  assert.deepEqual(
    aarhiRuns.map((candidate) => candidate.entrant_key),
    Array.from({ length: 14 }, (_, at) => dayRider(at))
  );

  // Aarhi Round 1: the first 8 carry, a strike or a miss is out.
  rideRound(engine, (run) => (index(run) < 8 ? "carry" : index(run) % 2 ? "miss" : "strike"));
  aarhi = liveRound(engine);
  assert.equal(aarhi.name, "Aarhi Round 2");
  assert.equal(engine.snapshot().runs.filter((candidate) => candidate.round_id === aarhi.id).length, 8);

  // Aarhi Round 2: nobody carries, so all eight ride again.
  rideRound(engine, () => "strike");
  aarhi = liveRound(engine);
  assert.equal(aarhi.name, "Aarhi Round 3");
  assert.equal(engine.snapshot().runs.filter((candidate) => candidate.round_id === aarhi.id).length, 8);

  // Aarhi Round 3: three carry, so the next round is the Final.
  rideRound(engine, (run) => (index(run) < 3 ? "carry" : "miss"));
  const final = liveRound(engine);
  assert.equal(final.name, "Final");
  assert.equal(final.round_number, 4);
  assert.equal(engine.snapshot().runs.filter((candidate) => candidate.round_id === final.id).length, 3);

  // After the Final nothing more is built.
  rideRound(engine, (run) => (index(run) === 0 ? "carry" : "strike"));
  snap = engine.snapshot();
  assert.equal(snap.rounds.length, 5);
  assert.equal(snap.live.current_round_id, final.id);
  assert.equal(snap.rounds.find((candidate) => candidate.id === final.id)!.status, "complete");
});

test("training rebuilds the next round when an earlier result changes, until it has been ridden", () => {
  const engine = createSampleEngine(daySeed(), () => T0);
  rideRound(engine, (run) => (run.rider_name === "Rider 1" ? "carry" : run.rider_name === "Rider 2" ? "carry" : "miss"));

  const first = liveRound(engine);
  assert.equal(engine.snapshot().runs.filter((candidate) => candidate.round_id === first.id).length, 2);

  // Rider 3's last attempt becomes a carry: Aarhi Round 1 now has three riders.
  const rider3Last = engine
    .snapshot()
    .runs.find((candidate) => candidate.round_id === QUAL && candidate.rider_name === "Rider 3" && candidate.attempt_number === 3)!;
  engine.recordResult(rider3Last.id, "carry", true);
  let rebuilt = liveRound(engine);
  assert.notEqual(rebuilt.id, first.id);
  assert.equal(rebuilt.name, "Final");
  assert.equal(engine.snapshot().runs.filter((candidate) => candidate.round_id === rebuilt.id).length, 3);

  // Clearing a Qualification result reopens it and takes the next round down.
  engine.clearResult(rider3Last.id, true);
  let snap = engine.snapshot();
  assert.equal(snap.live.current_round_id, QUAL);
  assert.equal(snap.rounds.length, 1);
  engine.recordResult(rider3Last.id, "miss", false);
  rebuilt = liveRound(engine);
  assert.equal(rebuilt.name, "Final");

  // Once the Final has a result, changing Qualification leaves it alone.
  const finalRun = engine.snapshot().runs.find((candidate) => candidate.round_id === rebuilt.id)!;
  engine.callPool(rebuilt.id, "A");
  engine.recordResult(finalRun.id, "carry", false);
  engine.recordResult(rider3Last.id, "carry", true);
  snap = engine.snapshot();
  assert.equal(snap.rounds.length, 2);
  assert.equal(snap.runs.filter((candidate) => candidate.round_id === rebuilt.id).length, 2);
});

test("without progression a finished round stays as it is", () => {
  const seed = daySeed();
  delete seed.progression;
  const engine = createSampleEngine(seed, () => T0);
  rideRound(engine, () => "carry");
  assert.equal(engine.snapshot().rounds.length, 1);
});

/* Take out and Bring back (scoring_take_out) ------------------------------------ */

test("Take out skips the rider's rides still to come, marks them out and leaves the course empty", () => {
  const engine = createSampleEngine(daySeed(), () => T0);
  engine.callPool(QUAL, "A");
  const asa = dayRider(0);
  const asaFirst = engine.snapshot().runs.find((candidate) => candidate.entrant_key === asa)!;
  engine.setLive({ current_run_id: asaFirst.id }); // Start

  engine.takeOut(QUAL, asa, true);
  let snap = engine.snapshot();
  const asaRuns = snap.runs.filter((candidate) => candidate.entrant_key === asa);
  assert.deepEqual(asaRuns.map((candidate) => candidate.status), ["void", "void", "void"]);
  assert.equal(snap.live.current_run_id, null);
  assert.deepEqual(onCourse(snap), []);
  assert.equal(snap.runs.find((candidate) => candidate.id === upNext(snap))?.rider_name, "Rider 2");
  assert.deepEqual(snap.overrides, [
    { round_id: QUAL, entrant_key: asa, advanced: false, note: "Taken out on the judges' panel" },
  ]);
  const row = computeSampleLeaderboard(snap.rounds[0], snap.runs, new Map([[asa, false]])).find(
    (candidate) => candidate.entrant_key === asa
  )!;
  assert.equal(row.advanced, false);
  assert.equal(row.advanced_overridden, true);

  assert.throws(() => engine.takeOut(QUAL, asa, true), /Rider 1 is already out\./);

  // Bring back: the rides return and the override goes.
  engine.takeOut(QUAL, asa, false);
  snap = engine.snapshot();
  assert.deepEqual(
    snap.runs.filter((candidate) => candidate.entrant_key === asa).map((candidate) => candidate.status),
    ["pending", "pending", "pending"]
  );
  assert.deepEqual(snap.overrides, []);
  assert.equal(snap.live.current_run_id, null);
  assert.throws(() => engine.takeOut(QUAL, asa, false), /Rider 1 is not taken out\./);
});

test("Take out is refused after a carry; Bring back never undoes the person in control's Mark Out", () => {
  const seed = daySeed();
  seed.overrides = [{ round_id: QUAL, entrant_key: dayRider(2), advanced: false, note: "DQ" }];
  const engine = createSampleEngine(seed, () => T0);
  engine.callPool(QUAL, "A");
  const first = engine.snapshot().runs.find((candidate) => candidate.entrant_key === dayRider(0))!;
  engine.setLive({ current_run_id: first.id }); // Start
  engine.recordResult(first.id, "carry", false);

  assert.throws(
    () => engine.takeOut(QUAL, dayRider(0), true),
    /Rider 1 has already carried in this round\. Ask the person in control\./
  );
  assert.throws(
    () => engine.takeOut(QUAL, dayRider(2), false),
    /The person in control marked Rider 3 out\. Ask them to bring the rider back\./
  );
  assert.throws(() => engine.takeOut(QUAL, `solo:${id("7002", 99)}`, true), /That rider is not in this round\./);
});

/* The database twin (20261107130000_scoring_judge_starts_each_rider.sql) ------- */

test("the judge-starts migration patches the four functions, each substitution asserted, and can be reverted", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  const forward = read("supabase/migrations/20261107130000_scoring_judge_starts_each_rider.sql");
  const revert = read("supabase/migrations/revert/20261107130000_scoring_judge_starts_each_rider.revert.sql");
  const patched = (sql: string) =>
    [...sql.matchAll(/select pg_temp\.scoring_patch_body\(\n  pg_catalog\.to_regprocedure\('public\.(\w+)\(/g)].map(
      (match) => match[1]
    );

  assert.deepEqual(patched(forward), [
    "scoring_record_result",
    "scoring_record_result",
    "scoring_set_run_status",
    "scoring_take_out",
    "scoring_call_pool",
    "scoring_call_pool",
  ]);
  assert.deepEqual(patched(revert), patched(forward));
  assert.match(forward, /expected its anchor once, found it % times/);
  assert.match(forward, /create or replace function public\.scoring_leave_course\(/);
  assert.match(forward, /revoke execute on function public\.scoring_leave_course\(uuid, integer\)\n  from public, anon, authenticated;/);
  assert.match(forward, /current_run_id = null, -- the judge taps Start/);
  assert.doesNotMatch(forward, /scoring_set_live\(jsonb/, "Start (scoring_set_live) is unchanged");
  assert.match(forward, /notify pgrst, 'reload schema';\s*$/);
  assert.match(revert, /drop function if exists public\.scoring_leave_course\(uuid, integer\);/);
  assert.match(revert, /notify pgrst, 'reload schema';\s*$/);
});
