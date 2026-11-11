// The side on the track in a Section round (team-on-track.ts): which team the
// commentary panel and the vMix team feed show, and that all riders come out.
import assert from "node:assert/strict";
import test from "node:test";

import { teamOnTrack, type TeamState } from "./team-on-track.ts";

const member = (name: string, status: string, result: string | null = null, points: number | null = null) => ({
  rider_name: name,
  horse_name: `${name}'s horse`,
  result,
  points,
  status,
});

const row = (key: string, name: string, points: number, advanced: boolean | null, members: ReturnType<typeof member>[]) => ({
  entrant_key: `team:${key}`,
  name,
  pool_label: "A",
  rank: 1,
  points,
  advanced,
  members,
});

const state = (extra: Partial<TeamState>): TeamState => ({
  current_round: { event_type: "section", target_points: 8 },
  current_run: null,
  last_scored_run: null,
  up_next: [],
  leaderboard: [
    row("one", "First Side", 6, null, [
      member("A", "scored", "carry", 4),
      member("B", "scored", "strike", 2),
      member("C", "pending"),
      member("D", "pending"),
    ]),
    row("two", "Second Side", 0, null, [member("E", "pending"), member("F", "pending"), member("G", "pending"), member("H", "pending")]),
  ],
  ...extra,
});

test("a side that has started stays up until all its riders are scored", () => {
  const team = teamOnTrack(
    state({ last_scored_run: { entrant_key: "team:one" }, up_next: [{ entrant_key: "team:one" }] })
  );

  assert.equal(team?.name, "First Side");
  assert.equal(team?.points, 6);
  assert.equal(team?.target, 8);
  assert.equal(team?.through, null);
  assert.deepEqual(team?.members.map((rider) => rider.rider_name), ["A", "B", "C", "D"]);
});

test("the rider on course decides the side; before anyone rides it is the next side", () => {
  assert.equal(teamOnTrack(state({ current_run: { entrant_key: "team:two" } }))?.name, "Second Side");
  assert.equal(teamOnTrack(state({ up_next: [{ entrant_key: "team:two" }] }))?.name, "Second Side");
});

test("once a side is fully scored the next side comes up; ?which=last keeps the side that just rode", () => {
  const done = state({
    last_scored_run: { entrant_key: "team:one" },
    up_next: [{ entrant_key: "team:two" }],
  });
  done.leaderboard[0] = row("one", "First Side", 8, true, [
    member("A", "scored", "carry", 4),
    member("B", "scored", "strike", 2),
    member("C", "scored", "strike", 2),
    member("D", "scored", "miss", 0),
  ]);

  assert.equal(teamOnTrack(done)?.name, "Second Side");
  assert.equal(teamOnTrack(done, "last")?.name, "First Side");
  assert.equal(teamOnTrack(done, "last")?.through, true);
});

test("nothing outside a Section round", () => {
  assert.equal(teamOnTrack(state({ current_round: { event_type: "single", target_points: null } })), null);
  assert.equal(teamOnTrack(null), null);
});
