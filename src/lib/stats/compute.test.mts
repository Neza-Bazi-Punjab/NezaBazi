// The Stats page's arithmetic: points, rates with unrecorded runs, rank order
// and shared ranks, team rides with an unrecorded total, round names,
// sorting, pages and the cells each column shows. Fixtures are made up here; the real season
// file is checked by src/app/stats/stats-page.test.mts.
import assert from "node:assert/strict";
import test from "node:test";

import { RIDER_COLUMNS, TEAM_COLUMNS, TEAM_GROUPS } from "./columns.ts";
import {
  SINGLE_STAGE_LABELS,
  TEAM_STAGE_LABELS,
  clampPage,
  formatDate,
  formatDecimal,
  formatPercent,
  formatPlace,
  matchesSearch,
  pageCount,
  pageList,
  riderNumbers,
  riderRows,
  riderSummary,
  showingText,
  sortRows,
  stateOf,
  statesOf,
  teamNumbers,
  teamRows,
  teamSummary,
} from "./compute.ts";
import { parseSeason } from "./seasons.ts";
import type { SingleStage, StatResult, StatRider, StatTeam, TeamStage } from "./types.ts";

const rider = (
  id: string,
  runs: [SingleStage, StatResult][],
  extra: Partial<StatRider> = {}
): StatRider => ({
  id,
  name: id,
  horse: null,
  location: null,
  runs: runs.map(([stage, result]) => ({ stage, result })),
  place: null,
  ...extra,
});

const team = (id: string, rides: [TeamStage, number | null][], extra: Partial<StatTeam> = {}): StatTeam => ({
  id,
  name: id,
  riders: [],
  rides: rides.map(([stage, points]) => ({ stage, points })),
  place: null,
  ...extra,
});

const column = <T,>(columns: readonly { id: string }[], id: string) => {
  const found = columns.find((candidate) => candidate.id === id);
  assert.ok(found, `column ${id} exists`);
  return found as T;
};

test("points: carry 4, strike 2, miss 0, unknown 0", () => {
  const row = riderNumbers(
    rider("a", [
      ["qualification", "miss"],
      ["qualification", "strike"],
      ["aarhi1", "carry"],
      ["aarhi2", "unknown"],
    ])
  );
  assert.equal(row.runs, 4);
  assert.equal(row.carries, 1);
  assert.equal(row.strikes, 1);
  assert.equal(row.misses, 1);
  assert.equal(row.unknown, 1);
  assert.equal(row.known, 3);
  assert.equal(row.points, 6);
  assert.deepEqual(row.stages, { qualification: 2, aarhi1: 4, aarhi2: null, final: undefined });
  assert.equal(row.reached, "aarhi2");
});

test("unknown runs count as ridden and are left out of every rate", () => {
  const row = riderNumbers(
    rider("a", [
      ["qualification", "carry"],
      ["qualification", "strike"],
      ["aarhi1", "unknown"],
      ["aarhi2", "unknown"],
    ])
  );
  assert.equal(row.runs, 4);
  assert.equal(row.known, 2);
  assert.equal(row.pointsPerRun, 3);
  assert.equal(row.carryRate, 0.5);
  assert.equal(row.hitRate, 1);
});

test("a rider with no known result has no rates, shown as dashes not zeros", () => {
  const row = riderNumbers(rider("a", [["qualification", "unknown"]]));
  assert.equal(row.runs, 1);
  assert.equal(row.pointsPerRun, null);
  assert.equal(row.carryRate, null);
  assert.equal(row.hitRate, null);
  for (const id of ["points", "pointsPerRun", "carryRate", "hitRate", "stage-qualification"]) {
    const cell = column<(typeof RIDER_COLUMNS)[number]>(RIDER_COLUMNS, id).cell({ ...row, rank: 1 });
    assert.equal(cell.kind, "dash", `${id} is a dash`);
  }
  const final = column<(typeof RIDER_COLUMNS)[number]>(RIDER_COLUMNS, "stage-final").cell({ ...row, rank: 1 });
  assert.equal(final.kind, "blank", "a stage not ridden is blank");
});

test("a stage with one known and one unknown run shows the known points", () => {
  const row = riderNumbers(
    rider("a", [
      ["qualification", "unknown"],
      ["qualification", "strike"],
    ])
  );
  assert.equal(row.stages.qualification, 2);
});

test("rider rank: placed first, then furthest stage, stage points, total, carry rate, name", () => {
  const rows = riderRows({
    riders: [
      rider("zed", [["qualification", "miss"]]),
      rider("third", [["qualification", "carry"], ["final", "carry"]], { place: 3 }),
      rider("first", [["qualification", "carry"], ["final", "miss"]], { place: 1 }),
      rider("aarhi-carry", [["qualification", "carry"], ["aarhi1", "carry"]]),
      rider("aarhi-strike", [["qualification", "carry"], ["aarhi1", "strike"]]),
      // Same stage and stage points; more total points wins.
      rider("aarhi-strike-more", [["qualification", "strike"], ["qualification", "carry"], ["aarhi1", "strike"]]),
      rider("qual-only", [["qualification", "carry"]]),
    ],
  });
  assert.deepEqual(
    rows.map((row) => [row.id, row.rank]),
    [
      ["first", 1],
      ["third", 2],
      ["aarhi-carry", 3],
      ["aarhi-strike-more", 4],
      ["aarhi-strike", 5],
      ["qual-only", 6],
      ["zed", 7],
    ]
  );
});

test("carry rate breaks a tie on points, and riders level on everything share a rank", () => {
  const rows = riderRows({
    riders: [
      // Both 4 points in qualification. "few" carried 1 of 1, "many" 1 of 3.
      rider("many", [["qualification", "miss"], ["qualification", "miss"], ["qualification", "carry"]]),
      rider("few", [["qualification", "carry"]]),
      rider("bravo", [["qualification", "miss"]]),
      rider("alpha", [["qualification", "miss"]]),
      rider("charlie", [["qualification", "miss"]]),
      rider("none", []),
    ],
  });
  assert.deepEqual(
    rows.map((row) => [row.id, row.rank]),
    [
      ["few", 1],
      ["many", 2],
      ["alpha", 3],
      ["bravo", 3],
      ["charlie", 3],
      ["none", 6],
    ]
  );
  assert.equal(rows[5].reached, null);
});

test("a team ride with no recorded total counts as a ride, not toward the best", () => {
  const row = teamNumbers(
    team("t", [
      ["round1", 12],
      ["round2", null],
      ["third", 16],
    ])
  );
  assert.equal(row.rides, 3);
  assert.equal(row.best, 16);
  assert.equal(row.fullHouses, 1);
  assert.deepEqual(row.stages, { round1: 12, round2: null, third: 16, final1: undefined, final2: undefined });
  assert.equal(row.reached, "third");

  const none = teamNumbers(team("n", [["round1", null]]));
  assert.equal(none.rides, 1);
  assert.equal(none.best, null);
  const cell = column<(typeof TEAM_COLUMNS)[number]>(TEAM_COLUMNS, "stage-round1").cell({ ...none, rank: 1 });
  assert.equal(cell.kind, "dash");
});

test("the teams table has no running total: only round points and the result", () => {
  assert.deepEqual(
    TEAM_GROUPS.map((group) => group.id),
    ["rounds", "result"]
  );
  assert.deepEqual(
    TEAM_COLUMNS.map((candidate) => candidate.id),
    ["stage-round1", "stage-round2", "stage-third", "stage-final1", "stage-final2", "reached", "place"]
  );
});

test("round names say what each round was; short headings keep the full name for screen readers", () => {
  assert.deepEqual(SINGLE_STAGE_LABELS, {
    qualification: "Qualification",
    aarhi1: "Aarhi round 1",
    aarhi2: "Aarhi round 2",
    final: "Placing ride",
  });
  assert.deepEqual(TEAM_STAGE_LABELS, {
    round1: "Round 1",
    round2: "Round 2",
    third: "3rd place ride-off",
    final1: "Final",
    final2: "Final tie-break",
  });

  const riderStages = RIDER_COLUMNS.filter((candidate) => candidate.id.startsWith("stage-"));
  assert.deepEqual(
    riderStages.map((candidate) => candidate.label),
    ["Qual", "Aarhi 1", "Aarhi 2", "Placing"]
  );
  assert.equal(riderStages[3].title, "Points in Placing ride");
  const teamStages = TEAM_COLUMNS.filter((candidate) => candidate.id.startsWith("stage-"));
  assert.deepEqual(
    teamStages.map((candidate) => candidate.label),
    ["Round 1", "Round 2", "3rd place", "Final", "Tie-break"]
  );
  assert.equal(teamStages[4].title, "Points in Final tie-break, out of 16");

  // The Reached column shows the full name.
  const reached = column<(typeof RIDER_COLUMNS)[number]>(RIDER_COLUMNS, "reached").cell({
    ...riderNumbers(rider("r", [["final", "carry"]])),
    rank: 1,
  });
  assert.deepEqual(reached, { kind: "value", text: "Placing ride" });
  const teamReached = column<(typeof TEAM_COLUMNS)[number]>(TEAM_COLUMNS, "reached").cell({
    ...teamNumbers(team("t", [["final2", 12]])),
    rank: 1,
  });
  assert.deepEqual(teamReached, { kind: "value", text: "Final tie-break" });
});

test("team rank: placed first, then furthest stage, points in that stage, then name (no running total)", () => {
  const rows = teamRows({
    teams: [
      team("out-early", [["round1", 16]]),
      team("winner", [["round1", 8], ["round2", 12], ["final1", 8], ["final2", 12]], { place: 1 }),
      team("bronze", [["round1", 12], ["round2", 10], ["third", null]], { place: 3 }),
      team("round2-low", [["round1", 16], ["round2", 8]]),
      team("round2-high", [["round1", 8], ["round2", 12]]),
      team("b-tied", [["round1", 8], ["round2", 8]]),
      team("a-tied", [["round1", 8], ["round2", 8]]),
    ],
  });
  assert.deepEqual(
    rows.map((row) => [row.id, row.rank]),
    [
      ["winner", 1],
      ["bronze", 2],
      ["round2-high", 3],
      // Level on round 2 points: round 1 does not break the tie.
      ["a-tied", 4],
      ["b-tied", 4],
      ["round2-low", 4],
      ["out-early", 7],
    ]
  );
});

test("summary tiles count the whole season", () => {
  const riders = riderRows({
    riders: [
      rider("a", [["qualification", "carry"], ["aarhi1", "unknown"]]),
      rider("b", [["qualification", "miss"], ["qualification", "carry"]]),
      rider("c", []),
    ],
  });
  assert.deepEqual(riderSummary(riders), { riders: 2, runs: 4, carries: 2, reachedAarhi: 1 });

  const teams = teamRows({
    teams: [team("x", [["round1", 16], ["round2", 16]]), team("y", [["round1", null]])],
  });
  assert.deepEqual(teamSummary(teams), { teams: 2, rides: 3, fullHouses: 2, best: 16 });
  assert.equal(teamSummary(teamRows({ teams: [team("y", [["round1", null]])] })).best, null);
});

test("sortRows keeps blanks and dashes last both ways and breaks ties by rank", () => {
  const rows = [
    { rank: 1, name: "a", value: 2 as number | null },
    { rank: 2, name: "b", value: null },
    { rank: 3, name: "c", value: 5 },
    { rank: 4, name: "d", value: 2 },
  ];
  assert.deepEqual(
    sortRows(rows, (row) => row.value, "descending").map((row) => row.name),
    ["c", "a", "d", "b"]
  );
  assert.deepEqual(
    sortRows(rows, (row) => row.value, "ascending").map((row) => row.name),
    ["a", "d", "c", "b"]
  );
  assert.deepEqual(
    sortRows(rows, (row) => row.name, "descending").map((row) => row.name),
    ["d", "c", "b", "a"]
  );
  assert.equal(rows[0].name, "a", "the input is not reordered");
});

test("search matches every word across name, horse and place, ignoring case", () => {
  assert.equal(matchesSearch("", ["anything"]), true);
  assert.equal(matchesSearch("  baaz ", ["Bunty Singh", "Baaz", "Amritsar, Punjab"]), true);
  assert.equal(matchesSearch("bunty amritsar", ["Bunty Singh", "Baaz", "Amritsar, Punjab"]), true);
  assert.equal(matchesSearch("bunty ludhiana", ["Bunty Singh", "Baaz", "Amritsar, Punjab"]), false);
  assert.equal(matchesSearch("x", [null, undefined]), false);
});

test("states come from the last part of the location", () => {
  assert.equal(stateOf("Amritsar, Punjab"), "Punjab");
  assert.equal(stateOf("Surrey,  British Columbia "), "British Columbia");
  assert.equal(stateOf(null), null);
  assert.equal(stateOf(" , "), null);
  const rows = riderRows({
    riders: [
      rider("a", [], { location: "X, Punjab" }),
      rider("b", [], { location: "Y, Haryana" }),
      rider("c", [], { location: "Z, Punjab" }),
      rider("d", []),
    ],
  });
  assert.deepEqual(statesOf(rows), ["Haryana", "Punjab"]);
});

test("pages: count, clamping, numbered list with gaps, and the showing line", () => {
  assert.equal(pageCount(0, 25), 1);
  assert.equal(pageCount(25, 25), 1);
  assert.equal(pageCount(26, 25), 2);
  assert.equal(clampPage(9, 30, 25), 2);
  assert.equal(clampPage(0, 30, 25), 1);
  assert.deepEqual(pageList(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageList(1, 12), [1, 2, 3, 4, "gap", 12]);
  assert.deepEqual(pageList(6, 12), [1, "gap", 5, 6, 7, "gap", 12]);
  assert.deepEqual(pageList(12, 12), [1, "gap", 9, 10, 11, 12]);
  assert.equal(showingText(1, 25, 111, "rider"), "Showing 1–25 of 111 riders");
  assert.equal(showingText(5, 25, 111, "rider"), "Showing 101–111 of 111 riders");
  assert.equal(showingText(1, 25, 1, "team"), "Showing 1–1 of 1 team");
  assert.equal(showingText(1, 25, 0, "team"), "Showing 0 teams");
});

test("formatting: percentages, decimals, places and dates", () => {
  assert.equal(formatPercent(2 / 3), "67%");
  assert.equal(formatPercent(null), null);
  assert.equal(formatDecimal(3, 2), "3.00");
  assert.equal(formatDecimal(14 / 3, 1), "4.7");
  assert.equal(formatPlace(1), "1st");
  assert.equal(formatPlace(3), "3rd");
  assert.equal(formatPlace(null), null);
  assert.equal(formatDate("2026-11-11"), "11 November 2026");
  assert.equal(formatDate("soon"), "soon");
});

test("parseSeason rejects a file with an unknown result or a total over 16", () => {
  const good = {
    season: 2030,
    eventName: "E",
    eventDate: "2030-01-01",
    updated: "2030-01-02",
    provisional: false,
    notes: [],
    riders: [rider("a", [["qualification", "carry"]])],
    teams: [team("t", [["round1", 16]])],
  };
  assert.equal(parseSeason(good).season, 2030);
  assert.throws(
    () => parseSeason({ ...good, riders: [{ ...good.riders[0], runs: [{ stage: "qualification", result: "win" }] }] }),
    /unknown result/
  );
  assert.throws(
    () => parseSeason({ ...good, teams: [{ ...good.teams[0], rides: [{ stage: "round1", points: 17 }] }] }),
    /0 to 16/
  );
  assert.throws(() => parseSeason({ ...good, riders: [good.riders[0], good.riders[0]] }), /repeats the id/);
  assert.throws(() => parseSeason(null), /not an object/);
});
