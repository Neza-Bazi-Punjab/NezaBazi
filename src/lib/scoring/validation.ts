// Request-body validation for every scoring route.
//
// Bodies arrive as `unknown` and are narrowed with explicit type guards — never
// an `as` cast — into the request shapes in types.ts. Unknown keys are
// ignored, strings are trimmed and length-capped, ids must be UUIDs, and enum
// values must be one of the shared constants. The database functions validate
// everything again under their row locks; this layer exists so a malformed
// request is refused with a clear 400 before it reaches Postgres.
import {
  DISPLAY_MODES,
  EVENT_TYPES,
  ROUND_STATUSES,
  isRunResult,
  type AdvanceOverrideRequest,
  type CallPoolRequest,
  type ClearScoreRequest,
  type DisplayMode,
  type EventType,
  type LiveUpdateRequest,
  type PodiumEntry,
  type PoolMoveRequest,
  type RoundInput,
  type RoundPatch,
  type RoundStatus,
  type RunStatusRequest,
  type ScoreRequest,
  type StartListRequest,
} from "@/lib/scoring/types";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* "A" … "Z", "AA" … — the same shape the database CHECK enforces. */
export const POOL_LABEL_PATTERN = /^[A-Z]{1,2}$/;

/* entrant_key as stored: lower-case uuid, because Postgres renders uuid::text
   in lower case. */
export const ENTRANT_KEY_PATTERN =
  /^(solo|team):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ROUND_NAME_MAX = 80;
export const LIVE_MESSAGE_MAX = 200;
export const OVERRIDE_NOTE_MAX = 300;
export const PODIUM_NAME_MAX = 200;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });
const pass = <T>(value: T): Parsed<T> => ({ ok: true, value });

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

export const isPoolLabel = (value: unknown): value is string =>
  typeof value === "string" && POOL_LABEL_PATTERN.test(value);

export const isEntrantKey = (value: unknown): value is string =>
  typeof value === "string" && ENTRANT_KEY_PATTERN.test(value);

export const isIntegerInRange = (
  value: unknown,
  minimum: number,
  maximum: number
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum;

const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown
): value is T => typeof value === "string" && (values as readonly string[]).includes(value);

export const isEventType = (value: unknown): value is EventType =>
  isOneOf(EVENT_TYPES, value);

export const isRoundStatus = (value: unknown): value is RoundStatus =>
  isOneOf(ROUND_STATUSES, value);

export const isDisplayMode = (value: unknown): value is DisplayMode =>
  isOneOf(DISPLAY_MODES, value);

/* A trimmed, non-empty string of at most `maxLength` characters, or null. */
export const readBoundedString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
};

/* Optional free text: undefined or null → null, "" → null, otherwise trimmed
   and capped. `ok: false` when the value is present but not acceptable. */
const readOptionalText = (
  value: unknown,
  maxLength: number
): { ok: true; value: string | null } | { ok: false } => {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return { ok: false };
  }

  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
};

const isNullableUuid = (value: unknown): value is string | null =>
  value === null || isUuid(value);

/* Judge requests ------------------------------------------------------------ */

export const parseScoreRequest = (body: unknown): Parsed<ScoreRequest> => {
  if (!isRecord(body) || !isUuid(body.run_id)) {
    return fail("Choose a run to score.");
  }

  if (!isRunResult(body.result)) {
    return fail("Choose Carried, Struck or Miss.");
  }

  if (body.override !== undefined && typeof body.override !== "boolean") {
    return fail("Please send a valid result.");
  }

  return pass({
    run_id: body.run_id,
    result: body.result,
    override: body.override === true,
  });
};

/* `make_current` defaults to false: only the judge's "Undo last result" asks
   for the pointer to come back to this rider. */
export const parseClearScoreRequest = (body: unknown): Parsed<ClearScoreRequest> => {
  if (!isRecord(body) || !isUuid(body.run_id)) {
    return fail("Choose a run to clear.");
  }

  if (body.make_current !== undefined && typeof body.make_current !== "boolean") {
    return fail("Please send a valid request.");
  }

  return pass({ run_id: body.run_id, make_current: body.make_current === true });
};

export const parseRunStatusRequest = (body: unknown): Parsed<RunStatusRequest> => {
  if (!isRecord(body) || !isUuid(body.run_id)) {
    return fail("Choose a run.");
  }

  if (body.status !== "pending" && body.status !== "void") {
    return fail("A run can only be skipped or restored.");
  }

  return pass({ run_id: body.run_id, status: body.status });
};

/* Partial update: only the keys present are forwarded, so the database
   applies exactly what the panel meant to change. */
export const parseLiveUpdateRequest = (body: unknown): Parsed<LiveUpdateRequest> => {
  if (!isRecord(body)) {
    return fail("Nothing to change.");
  }

  const update: LiveUpdateRequest = {};

  if ("current_round_id" in body) {
    if (!isNullableUuid(body.current_round_id)) {
      return fail("Choose a valid round.");
    }

    update.current_round_id = body.current_round_id;
  }

  if ("current_run_id" in body) {
    if (!isNullableUuid(body.current_run_id)) {
      return fail("Choose a valid run.");
    }

    update.current_run_id = body.current_run_id;
  }

  if ("called_pool_label" in body) {
    if (body.called_pool_label !== null && !isPoolLabel(body.called_pool_label)) {
      return fail("Choose a pool by its letter.");
    }

    update.called_pool_label = body.called_pool_label;
  }

  if ("display_mode" in body) {
    if (!isDisplayMode(body.display_mode)) {
      return fail("Unknown display mode.");
    }

    update.display_mode = body.display_mode;
  }

  if ("message" in body) {
    const message = readOptionalText(body.message, LIVE_MESSAGE_MAX);

    if (!message.ok) {
      return fail(`Keep the message to ${LIVE_MESSAGE_MAX} characters.`);
    }

    update.message = message.value;
  }

  if (Object.keys(update).length === 0) {
    return fail("Nothing to change.");
  }

  return pass(update);
};

export const parseCallPoolRequest = (body: unknown): Parsed<CallPoolRequest> => {
  if (!isRecord(body) || !isUuid(body.round_id)) {
    return fail("Choose a round.");
  }

  if (!isPoolLabel(body.pool_label)) {
    return fail("Choose a pool to call.");
  }

  return pass({ round_id: body.round_id, pool_label: body.pool_label });
};

/* Administrator requests ------------------------------------------------------ */

const ROUND_NUMBER_RANGE = [0, 50] as const;
const ATTEMPTS_RANGE = [1, 3] as const;
const TARGET_RANGE = [1, 16] as const;
const SORT_ORDER_RANGE = [0, 10000] as const;
const POOL_SIZE_RANGE = [2, 100] as const;

type RoundFieldResult = { ok: true } | { ok: false; error: string };

/* Validates the round fields that are present in `body` and copies them into
   `target`. Shared by create (every field required) and edit (any subset). */
const readRoundFields = (
  body: Record<string, unknown>,
  target: Partial<RoundInput>
): RoundFieldResult => {
  if ("event_type" in body) {
    if (!isEventType(body.event_type)) {
      return { ok: false, error: "Choose Single or Section." };
    }

    target.event_type = body.event_type;
  }

  if ("name" in body) {
    const name = readBoundedString(body.name, ROUND_NAME_MAX);

    if (!name) {
      return { ok: false, error: `Give the round a name of up to ${ROUND_NAME_MAX} characters.` };
    }

    target.name = name;
  }

  if ("round_number" in body) {
    if (!isIntegerInRange(body.round_number, ...ROUND_NUMBER_RANGE)) {
      return { ok: false, error: "Round number must be a whole number from 0 to 50." };
    }

    target.round_number = body.round_number;
  }

  if ("attempts_per_rider" in body) {
    if (!isIntegerInRange(body.attempts_per_rider, ...ATTEMPTS_RANGE)) {
      return { ok: false, error: "Attempts per rider must be 1, 2 or 3." };
    }

    target.attempts_per_rider = body.attempts_per_rider;
  }

  if ("target_points" in body) {
    if (body.target_points !== null && !isIntegerInRange(body.target_points, ...TARGET_RANGE)) {
      return { ok: false, error: "Target points must be empty or a whole number from 1 to 16." };
    }

    target.target_points = body.target_points;
  }

  if ("sort_order" in body) {
    if (!isIntegerInRange(body.sort_order, ...SORT_ORDER_RANGE)) {
      return { ok: false, error: "Sort order must be a whole number from 0 to 10000." };
    }

    target.sort_order = body.sort_order;
  }

  if ("pool_size" in body) {
    if (body.pool_size !== null && !isIntegerInRange(body.pool_size, ...POOL_SIZE_RANGE)) {
      return { ok: false, error: "Pool size must be empty or a whole number from 2 to 100." };
    }

    target.pool_size = body.pool_size;
  }

  return { ok: true };
};

export const parseRoundInput = (body: unknown): Parsed<RoundInput> => {
  if (!isRecord(body)) {
    return fail("The round details are missing.");
  }

  const fields: Partial<RoundInput> = {};
  const result = readRoundFields(body, fields);

  if (!result.ok) {
    return fail(result.error);
  }

  const {
    event_type,
    name,
    round_number,
    attempts_per_rider,
    target_points,
    sort_order,
    pool_size,
  } = fields;

  if (
    event_type === undefined ||
    name === undefined ||
    round_number === undefined ||
    sort_order === undefined
  ) {
    return fail("A new round needs an event, a name, a round number and a sort order.");
  }

  return pass({
    event_type,
    name,
    round_number,
    attempts_per_rider: attempts_per_rider ?? 1,
    target_points: target_points ?? null,
    sort_order,
    pool_size: pool_size ?? null,
  });
};

const parsePodium = (value: unknown): Parsed<PodiumEntry[] | null> => {
  if (value === null) {
    return pass(null);
  }

  if (!Array.isArray(value) || value.length > 3) {
    return fail("A podium is a list of up to three places.");
  }

  const entries: PodiumEntry[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return fail("Each podium place needs a place and an entrant.");
    }

    const place = item.place;

    if (place !== 1 && place !== 2 && place !== 3) {
      return fail("Podium places are 1, 2 and 3.");
    }

    if (!isEntrantKey(item.entrant_key)) {
      return fail("Each podium place needs an entrant from this round.");
    }

    // The database replaces the name with the one in the start list; it is
    // accepted here only so the request matches PodiumEntry.
    const name = readOptionalText(item.name, PODIUM_NAME_MAX);

    entries.push({
      place,
      entrant_key: item.entrant_key,
      name: name.ok ? name.value ?? "" : "",
    });
  }

  return pass(entries.length > 0 ? entries : null);
};

export const parseRoundPatch = (body: unknown): Parsed<RoundPatch> => {
  if (!isRecord(body)) {
    return fail("Nothing to change.");
  }

  const patch: RoundPatch = {};
  const result = readRoundFields(body, patch);

  if (!result.ok) {
    return fail(result.error);
  }

  if ("status" in body) {
    if (!isRoundStatus(body.status)) {
      return fail("Status must be upcoming, live or complete.");
    }

    patch.status = body.status;
  }

  if ("podium" in body) {
    const podium = parsePodium(body.podium);

    if (!podium.ok) {
      return fail(podium.error);
    }

    patch.podium = podium.value;
  }

  if (Object.keys(patch).length === 0) {
    return fail("Nothing to change.");
  }

  return pass(patch);
};

export const parseStartListRequest = (body: unknown): Parsed<StartListRequest> => {
  if (!isRecord(body) || (body.mode !== "all_checked_in" && body.mode !== "advanced")) {
    return fail("Choose who to draw: every checked-in entrant, or those who advanced.");
  }

  return pass({ mode: body.mode });
};

export type AddEntrantRequest = {
  solo_registration_id: string | null;
  team_id: string | null;
};

export const parseAddEntrantRequest = (body: unknown): Parsed<AddEntrantRequest> => {
  if (!isRecord(body)) {
    return fail("Choose one rider or one team to add.");
  }

  const solo = body.solo_registration_id ?? null;
  const team = body.team_id ?? null;

  if (!isNullableUuid(solo) || !isNullableUuid(team) || (solo === null) === (team === null)) {
    return fail("Choose one rider or one team to add.");
  }

  return pass({ solo_registration_id: solo, team_id: team });
};

export const parseMoveRunRequest = (body: unknown): Parsed<{ run_order: number }> => {
  if (!isRecord(body) || !isIntegerInRange(body.run_order, 1, 100000)) {
    return fail("Choose a position in the start list.");
  }

  return pass({ run_order: body.run_order });
};

export const parsePoolMoveRequest = (body: unknown): Parsed<PoolMoveRequest> => {
  if (!isRecord(body) || !isUuid(body.round_id)) {
    return fail("Choose a round.");
  }

  if (!isEntrantKey(body.entrant_key)) {
    return fail("Choose an entrant.");
  }

  if (!isPoolLabel(body.pool_label)) {
    return fail("Choose a pool by its letter.");
  }

  return pass({
    round_id: body.round_id,
    entrant_key: body.entrant_key,
    pool_label: body.pool_label,
  });
};

export const parseAdvanceOverrideRequest = (
  body: unknown
): Parsed<AdvanceOverrideRequest> => {
  if (!isRecord(body) || !isUuid(body.round_id)) {
    return fail("Choose a round.");
  }

  if (!isEntrantKey(body.entrant_key)) {
    return fail("Choose an entrant.");
  }

  if (body.advanced !== null && typeof body.advanced !== "boolean") {
    return fail("Choose through, out, or remove the override.");
  }

  const note = readOptionalText(body.note, OVERRIDE_NOTE_MAX);

  if (!note.ok) {
    return fail(`Keep the note to ${OVERRIDE_NOTE_MAX} characters.`);
  }

  return pass({
    round_id: body.round_id,
    entrant_key: body.entrant_key,
    advanced: body.advanced,
    note: note.value,
  });
};

/* Path segments ----------------------------------------------------------------- */

/* Dynamic segments arrive decoded by Next, but a client that double-encodes a
   colon would send "%3A"; decode once more defensively and validate after. */
const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const readUuidSegment = (value: string | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const decoded = decodeSegment(value).trim();
  return isUuid(decoded) ? decoded.toLowerCase() : null;
};

export const readEntrantKeySegment = (value: string | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const decoded = decodeSegment(value).trim().toLowerCase();
  return isEntrantKey(decoded) ? decoded : null;
};

/* `?force=1` on the destructive DELETE routes. */
export const readForceFlag = (request: Request) =>
  new URL(request.url).searchParams.get("force") === "1";
