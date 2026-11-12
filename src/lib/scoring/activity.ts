// Has anything happened in live scoring lately? The server uses the answer to
// cache the public feeds for longer once scoring has gone quiet, and the
// live-state hook to poll less often. No imports at all, so the browser, the
// server and `node --test` can load it.
//
// "Activity" is the newest of three timestamps in a state payload: the live
// row's updated_at (a rider put on course, a pool called, a mode changed), the
// last scored run's scored_at, and every round's updated_at. Quiet means the
// newest of those is more than IDLE_AFTER_MS old.
//
// Never idle on doubt: a payload that is not the shape expected (a field
// missing, a timestamp that does not parse, a timestamp in the future) counts
// as active, so the worst a surprise can do is keep today's short intervals.
// The two definite answers that count as quiet: scoring is not configured, or
// there is no live row at all.

export const IDLE_AFTER_MS = 30 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* Epoch milliseconds, or null for anything that is not a parseable string. */
const readTime = (value: unknown): number | null => {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/* The newest activity in a payload in epoch milliseconds; "none" when the
   payload says outright that nothing can be happening (not configured, or no
   live row); null when the payload cannot be read with confidence. */
export const newestScoringActivity = (payload: unknown): number | "none" | null => {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload.configured === false) {
    return "none";
  }

  if (payload.configured !== true) {
    return null;
  }

  if (payload.live === null) {
    return "none";
  }

  if (!isRecord(payload.live) || !Array.isArray(payload.rounds)) {
    return null;
  }

  const liveUpdated = readTime(payload.live.updated_at);

  if (liveUpdated === null) {
    return null;
  }

  let newest = liveUpdated;
  const lastScored = payload.last_scored_run;

  if (lastScored !== null) {
    if (!isRecord(lastScored)) {
      return null;
    }

    const scoredAt = readTime(lastScored.scored_at);

    if (scoredAt === null) {
      return null;
    }

    newest = Math.max(newest, scoredAt);
  }

  for (const round of payload.rounds) {
    const roundUpdated = isRecord(round) ? readTime(round.updated_at) : null;

    if (roundUpdated === null) {
      return null;
    }

    newest = Math.max(newest, roundUpdated);
  }

  return newest;
};

/* True when the payload shows no scoring activity for IDLE_AFTER_MS. "Now" is
   the payload's own generated_at when it has one (the server's clock, so a
   device with a wrong clock cannot make a busy round look quiet), else `now`. */
export const isScoringIdle = (payload: unknown, now: number = Date.now()): boolean => {
  const newest = newestScoringActivity(payload);

  if (newest === "none") {
    return true;
  }

  if (newest === null) {
    return false;
  }

  const generatedAt = isRecord(payload) ? readTime(payload.generated_at) : null;
  const reference = generatedAt ?? now;

  return reference - newest > IDLE_AFTER_MS;
};
