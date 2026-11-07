// Who rides next while nobody is on course.
//
// The judges start each rider (supabase/migrations/
// 20261107130000_scoring_judge_starts_each_rider.sql): after a result, a
// Skip, a Take out or a pool call-up the live pointer is empty until the
// judge taps Start. The judges' panel names one rider on its Start button;
// the public state's "up next", the overlays and the commentary panel must
// name the same rider, so the rule lives here once.
//
// Import-free and pure (structural types only), so the server, the panels and
// `node --test` can all load it.

export type RideRun = {
  id: string;
  run_order: number;
  attempt_number: number;
  pool_label: string | null;
  status: string;
};

export type RideLive = {
  current_run_id: string | null;
  called_pool_label: string | null;
};

const inStartOrder = <T extends RideRun>(runs: readonly T[]) =>
  [...runs].sort((first, second) => first.run_order - second.run_order);

/* The furthest run scored so far in start order (round-first order, so a
   later round counts as further on). Null before the first result. */
export const lastRiddenRun = <T extends RideRun>(runs: readonly T[]): T | null =>
  runs.reduce<T | null>(
    (furthest, run) =>
      run.status === "scored" && (!furthest || run.run_order > furthest.run_order) ? run : furthest,
    null
  );

/* The rider on course, if the live pointer names a run of this list. */
const onCourse = <T extends RideRun>(runs: readonly T[], live: RideLive | null) =>
  live?.current_run_id ? (runs.find((run) => run.id === live.current_run_id) ?? null) : null;

/* Who the judge's Start names when nobody is on course: the called pool's
   first rider still to ride when that pool was called ahead (it is not the
   pool that rode last), otherwise the next rider still to ride after the
   furthest one scored, or the first rider still to ride when nothing has been
   scored yet. Riders passed over earlier in the list are not named; they wait
   in the judges' Skipped box. Null while a rider is on course, or when
   nobody is left to ride after the furthest result. */
export const nextToRide = <T extends RideRun>(runs: readonly T[], live: RideLive | null): T | null => {
  const ordered = inStartOrder(runs);

  if (onCourse(ordered, live)) {
    return null;
  }

  const called = live?.called_pool_label ?? null;
  const last = lastRiddenRun(ordered);

  if (called !== null && last?.pool_label !== called) {
    const first = ordered.find((run) => run.pool_label === called && run.status === "pending");

    if (first) {
      return first;
    }
  }

  return (
    ordered.find((run) => run.status === "pending" && run.run_order > (last?.run_order ?? 0)) ?? null
  );
};

/* The riders still to ride, in order, from the one who rides next. With a
   rider on course: the pending runs after theirs. With nobody on course: the
   rider Start will name (nextToRide), then the pending runs after them. */
export const upNextRuns = <T extends RideRun>(
  runs: readonly T[],
  live: RideLive | null,
  limit: number
): T[] => {
  const ordered = inStartOrder(runs);
  const current = onCourse(ordered, live);
  const first = current ? null : nextToRide(ordered, live);
  const after = current ?? first;

  if (!after) {
    return [];
  }

  const rest = ordered.filter((run) => run.status === "pending" && run.run_order > after.run_order);
  return (first ? [first, ...rest] : rest).slice(0, limit);
};
