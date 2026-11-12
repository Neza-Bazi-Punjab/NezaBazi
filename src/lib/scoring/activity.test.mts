// Quiet scoring: when the public feeds may be cached for longer and the
// live-state hook may poll less often. Never quiet on doubt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { IDLE_AFTER_MS, isScoringIdle, newestScoringActivity } from "./activity.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-12T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;

/* A public state with the three timestamps the rule reads, all `age` old. */
const stateAged = (age: number, extra: Record<string, unknown> = {}) => ({
  configured: true,
  live: { current_round_id: "r1", updated_at: ago(age) },
  last_scored_run: { id: "run-1", scored_at: ago(age) },
  rounds: [
    { id: "r1", updated_at: ago(age) },
    { id: "r2", updated_at: ago(age) },
  ],
  ...extra,
});

test("half an hour is the line", () => {
  assert.equal(IDLE_AFTER_MS, 30 * MINUTE);
});

test("fresh activity is active; activity older than half an hour is quiet", () => {
  assert.equal(isScoringIdle(stateAged(0), NOW), false);
  assert.equal(isScoringIdle(stateAged(29 * MINUTE), NOW), false);
  assert.equal(isScoringIdle(stateAged(30 * MINUTE), NOW), false, "exactly 30 minutes is not yet quiet");
  assert.equal(isScoringIdle(stateAged(31 * MINUTE), NOW), true);
  assert.equal(isScoringIdle(stateAged(24 * 60 * MINUTE), NOW), true);
});

test("the newest of the three timestamps counts", () => {
  const old = 2 * 60 * MINUTE;

  const liveFresh = stateAged(old);
  liveFresh.live.updated_at = ago(MINUTE);
  assert.equal(isScoringIdle(liveFresh, NOW), false, "live row");

  const scoredFresh = stateAged(old);
  scoredFresh.last_scored_run.scored_at = ago(MINUTE);
  assert.equal(isScoringIdle(scoredFresh, NOW), false, "last scored run");

  const roundFresh = stateAged(old);
  roundFresh.rounds[1].updated_at = ago(MINUTE);
  assert.equal(isScoringIdle(roundFresh, NOW), false, "a round");

  assert.equal(newestScoringActivity(roundFresh), NOW - MINUTE);
});

test("nothing scored yet, or no rounds, is fine: the other timestamps decide", () => {
  assert.equal(isScoringIdle(stateAged(2 * 60 * MINUTE, { last_scored_run: null }), NOW), true);
  assert.equal(isScoringIdle(stateAged(MINUTE, { last_scored_run: null }), NOW), false);
  assert.equal(isScoringIdle(stateAged(2 * 60 * MINUTE, { rounds: [] }), NOW), true);
});

test("not configured, or no live row, is quiet", () => {
  assert.equal(isScoringIdle({ configured: false, live: null, rounds: [] }, NOW), true);
  assert.equal(isScoringIdle(stateAged(MINUTE, { live: null }), NOW), true);
});

test("missing fields count as active", () => {
  const old = 2 * 60 * MINUTE;

  for (const payload of [
    null,
    undefined,
    "text",
    42,
    [],
    {},
    { configured: "yes" },
    stateAged(old, { configured: undefined }),
    stateAged(old, { live: undefined }),
    stateAged(old, { live: { current_round_id: "r1" } }),
    stateAged(old, { rounds: undefined }),
    stateAged(old, { rounds: "r1" }),
    stateAged(old, { rounds: [{ id: "r1" }] }),
    stateAged(old, { rounds: [null] }),
    stateAged(old, { last_scored_run: undefined }),
    stateAged(old, { last_scored_run: { id: "run-1" } }),
  ]) {
    assert.equal(isScoringIdle(payload, NOW), false, JSON.stringify(payload) ?? String(payload));
  }
});

test("timestamps that do not parse count as active", () => {
  const old = 2 * 60 * MINUTE;

  for (const bad of ["", "soon", "2026-13-45T99:00:00Z", 1731300000000, null]) {
    const live = stateAged(old);
    (live.live as Record<string, unknown>).updated_at = bad;
    assert.equal(isScoringIdle(live, NOW), false, `live.updated_at ${String(bad)}`);

    const scored = stateAged(old);
    (scored.last_scored_run as Record<string, unknown>).scored_at = bad;
    assert.equal(isScoringIdle(scored, NOW), false, `scored_at ${String(bad)}`);

    const round = stateAged(old);
    (round.rounds[0] as Record<string, unknown>).updated_at = bad;
    assert.equal(isScoringIdle(round, NOW), false, `round updated_at ${String(bad)}`);
  }
});

test("the payload's generated_at is the clock when it has one", () => {
  // Built two hours after the last activity, read on a device whose clock says
  // it is only a minute later: still quiet, by the server's clock.
  const quiet = stateAged(0, { generated_at: new Date(NOW + 2 * 60 * MINUTE).toISOString() });
  assert.equal(isScoringIdle(quiet, NOW + MINUTE), true);

  // Built a minute after the last activity, read on a device whose clock is
  // two hours fast: still active.
  const busy = stateAged(0, { generated_at: new Date(NOW + MINUTE).toISOString() });
  assert.equal(isScoringIdle(busy, NOW + 2 * 60 * MINUTE), false);

  // An unreadable generated_at falls back to the given clock.
  assert.equal(isScoringIdle(stateAged(2 * 60 * MINUTE, { generated_at: "later" }), NOW), true);
  assert.equal(isScoringIdle(stateAged(MINUTE, { generated_at: "later" }), NOW), false);
});

test("activity in the future (a clock out of step) is active", () => {
  assert.equal(isScoringIdle(stateAged(-2 * 60 * MINUTE), NOW), false);
});

test("the idle cache is longer, and only the real public states use it", () => {
  const http = repoFile("src/lib/scoring/http.ts");
  assert.match(http, /PUBLIC_LIVE_CACHE = "public, s-maxage=5, stale-while-revalidate=10"/);
  assert.match(http, /IDLE_PUBLIC_LIVE_CACHE = "public, s-maxage=60, stale-while-revalidate=600"/);
  assert.match(
    http,
    /export const publicLiveCacheFor = \(state: unknown\) =>\s*isScoringIdle\(state\) \? IDLE_PUBLIC_LIVE_CACHE : PUBLIC_LIVE_CACHE;/
  );
  assert.equal(http.match(/IDLE_PUBLIC_LIVE_CACHE/g)?.length, 2, "defined once, used once");

  // The routes built from a full public state choose by that state; their
  // sample and demo answers keep the short cache.
  for (const path of [
    "src/app/api/live/state/route.ts",
    "src/app/api/live/vmix/current/route.ts",
    "src/app/api/live/vmix/leaderboard/route.ts",
    "src/app/api/live/vmix/team/route.ts",
    "src/app/api/broadcast/current/route.ts",
  ]) {
    const source = repoFile(path);
    assert.equal(source.match(/publicLiveCacheFor\(state\)/g)?.length, 1, path);
    assert.doesNotMatch(source, /IDLE_PUBLIC_LIVE_CACHE/, path);
    const sample = source.search(/if \((wantsSample\(url\)|isDemoRequest\(request\))\)/);
    assert.ok(sample > 0 && sample < source.indexOf("publicLiveCacheFor(state)"), path);
    assert.match(source.slice(sample, source.indexOf("publicLiveCacheFor(state)")), /PUBLIC_LIVE_CACHE/, path);
  }

  // The activity rule loads anywhere: no imports, no server-only.
  assert.doesNotMatch(repoFile("src/lib/scoring/activity.ts"), /^import /m);
});

test("the live-state hook polls once a minute while quiet, and only then", () => {
  const hook = repoFile("src/lib/scoring/use-live-state.ts");

  assert.match(hook, /import \{ isScoringIdle \} from "@\/lib\/scoring\/activity";/);
  assert.match(hook, /POLL_WHILE_IDLE_MS = 60_000;/);
  // Training first, then quiet, then the usual two intervals.
  assert.match(
    hook,
    /training\s*\? POLL_IN_TRAINING_MS\s*: idleRef\.current\s*\? POLL_WHILE_IDLE_MS\s*: isSubscribed\s*\? subscribedPollMs\s*: POLL_WHILE_UNSUBSCRIBED_MS/
  );
  // Set from every good payload, the polled ones and a panel's own write.
  assert.equal(hook.match(/idleRef\.current = isScoringIdle\((payload|next)\);/g)?.length, 2);
  // A failed or timed-out request clears it, so retries keep their interval.
  assert.equal(hook.match(/if \(inFlight === controller\) \{\s*idleRef\.current = false;\s*\}/g)?.length, 2);
  // Realtime events still refetch straight away.
  assert.match(hook, /\(payload\) => scheduleRefetch\(realtimeCacheKey\(payload\)\)/);
});
