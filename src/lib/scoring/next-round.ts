// The auto engine's "Next step" for Single tent pegging (steps 1–3 of
// docs/superpowers/plans/2026-11-10-auto-scoring-engine.md).
//
// The database decides everything — who goes through, what comes next, and
// whether it is allowed — in supabase/migrations/20261110130000_scoring_auto_next_round.sql
// (scoring_next_step, scoring_start_next_round, scoring_undo_next_round,
// scoring_set_auto_engine). This file only:
//   - parses a request to POST /api/admin/scoring/next-round;
//   - reads the scoring_next_step() payload safely for the Scoring page;
//   - words the card's button.
//
// Pure and dependency-free, so `node --test` loads it directly.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NextRoundAction =
  | { action: "start_qualifying" }
  | { action: "start"; round_id: string }
  | { action: "undo"; round_id: string }
  | { action: "switch"; auto_on: boolean };

export type NextRoundActionParsed =
  | { ok: true; value: NextRoundAction }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (record: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(record).every((key) => keys.includes(key));

/* { action: "start_qualifying" }, { action: "start" | "undo", round_id } or
   { action: "switch", auto_on } (true = Automatic, false = Manual). */
export const parseNextRoundRequest = (body: unknown): NextRoundActionParsed => {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid request." };
  }

  if (body.action === "start_qualifying") {
    if (!hasOnlyKeys(body, ["action"])) {
      return { ok: false, error: "Invalid request." };
    }

    return { ok: true, value: { action: "start_qualifying" } };
  }

  if (body.action === "start" || body.action === "undo") {
    if (!hasOnlyKeys(body, ["action", "round_id"]) || typeof body.round_id !== "string" || !UUID_PATTERN.test(body.round_id)) {
      return { ok: false, error: "Choose a round." };
    }

    return { ok: true, value: { action: body.action, round_id: body.round_id.toLowerCase() } };
  }

  if (body.action === "switch") {
    if (!hasOnlyKeys(body, ["action", "auto_on"]) || typeof body.auto_on !== "boolean") {
      return { ok: false, error: "Send auto_on: true or false." };
    }

    return { ok: true, value: { action: "switch", auto_on: body.auto_on } };
  }

  return { ok: false, error: "Unknown action." };
};

/* The scoring_next_step() payload. */

export type NextRoundState =
  | "no_rounds"
  | "manual_setup"
  | "manual"
  | "no_start_list"
  | "riding"
  | "later_round"
  | "no_show"
  | "placings"
  | "nobody_through"
  | "ready";

export type NextRoundRule = "carry" | "strike" | "all_zero";

export type NextRoundPlan = {
  state: NextRoundState;
  message: string;
  round_id: string | null;
  round_name: string | null;
  /* The round the plan is about: qualifier, aarhi, final or rideoff. */
  stage: string | null;
  rule: NextRoundRule | null;
  through_count: number | null;
  entrant_count: number | null;
  through: { entrant_key: string; name: string }[];
  next_stage: "aarhi" | "final" | null;
  next_name: string | null;
  first_up: string | null;
  left: number | null;
  total: number | null;
};

export type NextStep = {
  engine: { auto_on: boolean; changed_at: string | null; changed_by: string | null };
  /* Solo riders checked in right now (Start qualifying's preview). Null
     until 20261110140000_scoring_auto_qualifying.sql is applied, which is
     also what Start qualifying needs. */
  checked_in_count: number | null;
  plan: NextRoundPlan;
  undo: { round_id: string; round_name: string } | null;
};

const STATES: readonly NextRoundState[] = [
  "no_rounds",
  "manual_setup",
  "manual",
  "no_start_list",
  "riding",
  "later_round",
  "no_show",
  "placings",
  "nobody_through",
  "ready",
];

const text = (value: unknown) => (typeof value === "string" ? value : null);
const whole = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

/* Narrows an unknown payload; null when it is not a next step. */
export const toNextStep = (value: unknown): NextStep | null => {
  if (!isRecord(value) || !isRecord(value.engine) || !isRecord(value.plan)) {
    return null;
  }

  const { engine, plan } = value;
  const state = STATES.find((candidate) => candidate === plan.state);

  if (!state || typeof engine.auto_on !== "boolean") {
    return null;
  }

  const rule = plan.rule === "carry" || plan.rule === "strike" || plan.rule === "all_zero" ? plan.rule : null;
  const nextStage = plan.next_stage === "aarhi" || plan.next_stage === "final" ? plan.next_stage : null;
  const through = Array.isArray(plan.through)
    ? plan.through.flatMap((entry) =>
        isRecord(entry) && typeof entry.entrant_key === "string" && typeof entry.name === "string"
          ? [{ entrant_key: entry.entrant_key, name: entry.name }]
          : []
      )
    : [];
  const undo =
    isRecord(value.undo) && typeof value.undo.round_id === "string" && typeof value.undo.round_name === "string"
      ? { round_id: value.undo.round_id, round_name: value.undo.round_name }
      : null;

  return {
    engine: {
      auto_on: engine.auto_on,
      changed_at: text(engine.changed_at),
      changed_by: text(engine.changed_by),
    },
    checked_in_count: whole(value.checked_in_count),
    plan: {
      state,
      message: text(plan.message) ?? "",
      round_id: text(plan.round_id),
      round_name: text(plan.round_name),
      stage: text(plan.stage),
      rule,
      through_count: whole(plan.through_count),
      entrant_count: whole(plan.entrant_count),
      through,
      next_stage: nextStage,
      next_name: text(plan.next_name),
      first_up: text(plan.first_up),
      left: whole(plan.left),
      total: whole(plan.total),
    },
    undo,
  };
};

/* "Start Aarhi Round 2" / "Start the Final". */
export const startButtonLabel = (plan: NextRoundPlan) =>
  plan.next_stage === "final" ? "Start the Final" : `Start ${plan.next_name ?? "next round"}`;

/* The confirm bar's detail line. */
export const startConfirmDetail = (plan: NextRoundPlan) => {
  const count = plan.through_count ?? 0;
  const riders = count === 1 ? "1 rider" : `${count} riders`;
  const first = plan.first_up ? ` First up: ${plan.first_up}.` : "";

  return `${plan.message} ${riders} ride ${plan.next_name ?? "the next round"} once each, in start order, no pools.${first} You can undo it until the first rider has ridden.`;
};

/* Qualifying: three attempts, pools of about 12, sizes differing by at most
   one (the same split as balancedPoolSizes and the database draw). */
export const QUALIFYING_POOL_SIZE = 12;

export const qualifyingPools = (riders: number): number[] => {
  if (!Number.isInteger(riders) || riders <= 0) {
    return [];
  }

  const pools = Math.ceil(riders / QUALIFYING_POOL_SIZE);
  const base = Math.floor(riders / pools);
  const extra = riders % pools;

  return Array.from({ length: pools }, (_, index) => base + (index < extra ? 1 : 0));
};

/* "129 riders → 11 pools of 11–12". */
export const qualifyingPreview = (riders: number) => {
  const sizes = qualifyingPools(riders);

  if (sizes.length === 0) {
    return "Nobody has checked in yet.";
  }

  const smallest = Math.min(...sizes);
  const largest = Math.max(...sizes);
  const range = smallest === largest ? `${largest}` : `${smallest}–${largest}`;
  const ridersText = riders === 1 ? "1 rider" : `${riders} riders`;
  const poolsText = sizes.length === 1 ? "1 pool" : `${sizes.length} pools`;

  return `${ridersText} checked in → ${poolsText} of ${range}, 3 attempts each`;
};
