// The demo on the real riders: the practice session's starting state, built
// from the riders registered at the moment "Reset training data" is pressed.
//
// The organisers rehearse the day on /judge/demo and /commentary/demo. With
// the 30 invented riders the rehearsal looked nothing like the day, so a reset
// on the live site now copies the registered solo riders (training-
// registrations.ts reads them) and this file lays them out the way the day
// starts: one random draw, pools of about twelve, Qualification with three
// attempts ridden round by round, nobody ridden and nobody on course.
//
// It is a copy, not a link: riders who register or are edited afterwards are
// not in the demo until the next reset, and nothing a judge does in the demo
// touches a registration, a check-in or a real result.
//
// Pure, with type-only imports, so `node --test` loads it directly
// (training-riders.test.mts) and the engine's rule of no runtime import holds.
import type { SampleRiderFacts, SampleSeed } from "./sample-engine";
import type { ScoringRound, ScoringRun } from "./types";

/* One registered solo rider, as training-registrations.ts reads it. */
export type RegisteredRider = SampleRiderFacts & {
  id: string;
  full_name: string;
  horse_name: string | null;
  location: string | null;
};

/* Pools of about twelve, and the Final once four or fewer are through: the
   event's own numbers (docs/superpowers/plans/2026-11-10-auto-scoring-engine.md). */
export const REGISTERED_POOL_SIZE = 12;
export const REGISTERED_FINAL_AT = 4;
export const REGISTERED_ATTEMPTS = 3;

/* Fewer riders than this and the reset keeps the invented sample riders. */
export const REGISTERED_MINIMUM = 2;

/* Shown on the demo's scoreboard and overlays, so nobody takes a practice
   score next to a real name for a result. */
export const REGISTERED_MESSAGE = "Practice run: real riders, practice scores only";

/* balancedPoolSizes and poolLabelForIndex in types.ts, kept local so this
   file has no runtime import (the test keeps them in step). */
const balancedSizes = (count: number, poolSize: number): number[] => {
  if (count <= 0 || poolSize <= 0) {
    return [];
  }

  const pools = Math.ceil(count / poolSize);
  const base = Math.floor(count / pools);
  const remainder = count % pools;
  return new Array<number>(pools).fill(base).map((size, index) => size + (index < remainder ? 1 : 0));
};

const poolLabel = (index: number) => {
  let label = "";
  let remaining = index;

  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return label;
};

/* The practice ids' shape (sample-session.ts), with this file's own prefixes
   so a rebuilt demo never reuses an invented rider's run id. */
const practiceId = (prefix: string, index: number) =>
  `5a3b1e00-0000-4000-${prefix}-${String(index).padStart(12, "0")}`;

const text = (value: string | null | undefined) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
};

/* Fisher-Yates, on a copy. */
const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[other]] = [result[other], result[index]];
  }

  return result;
};

/* Qualification on the given riders. `roundId` is the practice
   Qualification's fixed id, so everything that points at it keeps working.
   null when there are too few riders to rehearse with. */
export const buildRegisteredSeed = (
  riders: readonly RegisteredRider[],
  {
    roundId,
    now = Date.now,
    random = Math.random,
  }: { roundId: string; now?: () => number; random?: () => number }
): SampleSeed | null => {
  const seen = new Set<string>();
  const entered = riders.filter((rider) => {
    if (!rider.id || text(rider.full_name) === null || seen.has(rider.id)) {
      return false;
    }

    seen.add(rider.id);
    return true;
  });

  if (entered.length < REGISTERED_MINIMUM) {
    return null;
  }

  const order = shuffled(entered, random);
  const labels = balancedSizes(order.length, REGISTERED_POOL_SIZE).flatMap((size, index) =>
    new Array<string>(size).fill(poolLabel(index))
  );
  const createdAt = new Date(now() - 60 * 60_000).toISOString();
  const qualification: ScoringRound = {
    id: roundId,
    event_type: "single",
    name: "Qualification",
    round_number: 0,
    attempts_per_rider: REGISTERED_ATTEMPTS,
    target_points: null,
    status: "live",
    sort_order: 1,
    pool_size: REGISTERED_POOL_SIZE,
    podium: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const runs: ScoringRun[] = [];

  for (let attempt = 1; attempt <= REGISTERED_ATTEMPTS; attempt += 1) {
    order.forEach((rider, index) => {
      runs.push({
        id: practiceId("7103", runs.length + 1),
        round_id: qualification.id,
        run_order: runs.length + 1,
        attempt_number: attempt,
        pool_label: labels[index] ?? null,
        entrant_key: `solo:${rider.id}`,
        solo_registration_id: rider.id,
        team_member_id: null,
        team_id: null,
        rider_name: rider.full_name.trim(),
        horse_name: text(rider.horse_name),
        team_name: null,
        rider_location: text(rider.location),
        status: "pending",
        result: null,
        points: null,
        scored_by: null,
        scored_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      });
    });
  }

  return {
    rounds: [qualification],
    runs,
    live: {
      current_round_id: qualification.id,
      current_run_id: null,
      called_pool_label: null,
      display_mode: "scoreboard",
      message: REGISTERED_MESSAGE,
      updated_at: createdAt,
    },
    progression: { poolSize: REGISTERED_POOL_SIZE, finalAt: REGISTERED_FINAL_AT },
    riders: Object.fromEntries(
      order.map((rider) => [
        rider.id,
        {
          father_name: text(rider.father_name),
          mother_name: text(rider.mother_name),
          age: rider.age ?? null,
          years_experience: rider.years_experience ?? null,
          horse_breed: text(rider.horse_breed),
          horse_age: rider.horse_age ?? null,
        },
      ])
    ),
  };
};
