// Building a round's start list by hand on /admin/scoring.
//
//   1. "Move to position": one number box per run, sent to the existing
//      POST /api/admin/scoring/runs/[id]/move (one place or many at once,
//      still only within the run's own pool and attempt pass).
//   2. The pool builder: the administrator taps entrants in riding order;
//      each tap puts the entrant next in the current pool, and "New pool"
//      starts the next letter, so pools can be any size. "Save start list"
//      sends the whole layout to PUT /api/admin/scoring/rounds/[id]/start-list,
//      which calls scoring_save_start_list
//      (supabase/migrations/20261111100000_scoring_pool_builder.sql) and
//      writes every run in one transaction.
//
// Pure and dependency-free, so `node --test` loads it directly.

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* 1. Move to position                                                         */
/* -------------------------------------------------------------------------- */

/* Reads the "Move to position" box. `first` and `last` are the run orders the
   run may take (its pool and attempt pass); `current` is where it is now. */
export const parseMovePosition = (
  text: string,
  first: number,
  last: number,
  current: number
): Checked<number> => {
  const trimmed = text.trim();

  if (!/^\d{1,6}$/.test(trimmed)) {
    return { ok: false, error: `Type a position from ${first} to ${last}.` };
  }

  const value = Number(trimmed);

  if (value < first || value > last) {
    return { ok: false, error: `This run can only move between positions ${first} and ${last}.` };
  }

  if (value === current) {
    return { ok: false, error: `Already at position ${current}.` };
  }

  return { ok: true, value };
};

/* -------------------------------------------------------------------------- */
/* 2. The pool builder                                                         */
/* -------------------------------------------------------------------------- */

/* The builder's layout: pools in riding order, each a list of entrant keys
   ("solo:<uuid>" or "team:<uuid>") in riding order. The last pool is the one
   a tap adds to. Never empty: it starts as one empty pool. */
export type BuilderPools = string[][];

export const MAX_BUILDER_POOLS = 52;
export const MAX_BUILDER_ENTRANTS = 600;

export const emptyBuilder = (): BuilderPools => [[]];

/* Pool letters, the same as scoring_pool_label / poolLabelForIndex. */
export const builderPoolLabel = (index: number) => {
  let label = "";
  let remaining = index;

  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return label;
};

export const builderHas = (pools: BuilderPools, key: string) =>
  pools.some((pool) => pool.includes(key));

export const builderCount = (pools: BuilderPools) =>
  pools.reduce((total, pool) => total + pool.length, 0);

/* A tap: the entrant rides next in the current (last) pool. Tapping one who
   is already placed changes nothing. */
export const builderAdd = (pools: BuilderPools, key: string): BuilderPools => {
  if (builderHas(pools, key)) {
    return pools;
  }

  const base = pools.length > 0 ? pools : emptyBuilder();

  return [...base.slice(0, -1), [...base[base.length - 1], key]];
};

/* "New pool": only once the current pool has someone in it. */
export const builderCanStartPool = (pools: BuilderPools) =>
  pools.length > 0 && pools[pools.length - 1].length > 0 && pools.length < MAX_BUILDER_POOLS;

export const builderStartPool = (pools: BuilderPools): BuilderPools =>
  builderCanStartPool(pools) ? [...pools, []] : pools;

/* Takes an entrant out. A pool left empty is dropped, unless it is the
   current pool (the one taps go into), so the letters stay contiguous. */
export const builderRemove = (pools: BuilderPools, key: string): BuilderPools => {
  const next = pools
    .map((pool) => pool.filter((entry) => entry !== key))
    .filter((pool, index, all) => pool.length > 0 || index === all.length - 1);

  return next.length > 0 ? next : emptyBuilder();
};

/* One place earlier (-1) or later (+1) within the entrant's pool. */
export const builderShift = (pools: BuilderPools, key: string, delta: -1 | 1): BuilderPools =>
  pools.map((pool) => {
    const index = pool.indexOf(key);
    const target = index + delta;

    if (index < 0 || target < 0 || target >= pool.length) {
      return pool;
    }

    const copy = [...pool];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  });

/* Moves an entrant to the end of another pool (by index). */
export const builderMoveToPool = (
  pools: BuilderPools,
  key: string,
  poolIndex: number
): BuilderPools => {
  if (!builderHas(pools, key) || poolIndex < 0 || poolIndex >= pools.length) {
    return pools;
  }

  if (pools[poolIndex].includes(key)) {
    return pools;
  }

  const moved = pools.map((pool, index) =>
    index === poolIndex ? [...pool, key] : pool.filter((entry) => entry !== key)
  );

  // Drop pools emptied by the move, but keep the current (last) pool.
  return moved.filter((pool, index, all) => pool.length > 0 || index === all.length - 1);
};

/* The layout to save: empty pools left out (an empty current pool at the
   end is simply not sent). */
export const builderToSave = (pools: BuilderPools): string[][] =>
  pools.filter((pool) => pool.length > 0);

/* Starts the builder from a round's existing start list, so a drawn or saved
   list can be adjusted rather than rebuilt. `runs` in run order. */
export const builderFromRuns = (
  runs: ReadonlyArray<{ entrant_key: string; pool_label: string | null; run_order: number }>
): BuilderPools => {
  const pools = new Map<string, string[]>();
  const sorted = [...runs].sort((first, second) => first.run_order - second.run_order);

  for (const run of sorted) {
    const label = run.pool_label ?? "";
    const pool = pools.get(label) ?? [];

    if (!pool.includes(run.entrant_key)) {
      pool.push(run.entrant_key);
    }

    pools.set(label, pool);
  }

  const ordered = [...pools.entries()]
    .sort(([first], [second]) =>
      first.length !== second.length ? first.length - second.length : first.localeCompare(second)
    )
    .map(([, pool]) => pool);

  return ordered.length > 0 ? ordered : emptyBuilder();
};

/* -------------------------------------------------------------------------- */
/* The request                                                                 */
/* -------------------------------------------------------------------------- */

const ENTRANT_KEY =
  /^(solo|team):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SaveStartListRequest = { pools: string[][] };

/* PUT /api/admin/scoring/rounds/[id]/start-list: { pools: string[][] }. The
   database checks the rest (the round's event type, that every entrant still
   exists, no results in the round). */
export const parseSaveStartListRequest = (body: unknown): Checked<SaveStartListRequest> => {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray((body as { pools?: unknown }).pools)
  ) {
    return { ok: false, error: "Send the pools to save." };
  }

  const raw = (body as { pools: unknown[] }).pools;

  if (raw.length === 0) {
    return { ok: false, error: "Put at least one rider in the start list." };
  }

  if (raw.length > MAX_BUILDER_POOLS) {
    return { ok: false, error: `At most ${MAX_BUILDER_POOLS} pools.` };
  }

  const seen = new Set<string>();
  const pools: string[][] = [];

  for (const [index, pool] of raw.entries()) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return { ok: false, error: `Pool ${builderPoolLabel(index)} is empty.` };
    }

    const keys: string[] = [];

    for (const key of pool) {
      if (typeof key !== "string" || !ENTRANT_KEY.test(key)) {
        return { ok: false, error: "One of the entrants is not recognised. Refresh and try again." };
      }

      const normalised = key.toLowerCase();

      if (seen.has(normalised)) {
        return { ok: false, error: "An entrant is in the start list twice." };
      }

      seen.add(normalised);
      keys.push(normalised);
    }

    pools.push(keys);
  }

  if (seen.size > MAX_BUILDER_ENTRANTS) {
    return { ok: false, error: `At most ${MAX_BUILDER_ENTRANTS} entrants.` };
  }

  const kinds = new Set([...seen].map((key) => key.slice(0, 4)));

  if (kinds.size > 1) {
    return { ok: false, error: "A start list is either solo riders or teams, not both." };
  }

  return { ok: true, value: { pools } };
};
