"use client";

/* The commentators' panel ("Live Scoring 6e", screen 7b): a laptop or tablet
   in landscape at the commentary table. Who is on course with everything an
   announcer needs to introduce them, how their pool stands, how far the round
   has got, and who and which pool come next. Read-only. Below 1280px the
   three columns stack into one.

   Stacked (below `xl`), the columns' blocks are reordered with CSS order
   classes into what a commentator reads between runs: on course, next
   riders, round progress, recent results, standings, all pools; the
   standings keep to one pool with a "Show all pools" toggle. On a phone
   (below `sm`) the name and the standings rows are sized so a full name fits.
   From `xl` up nothing changes. */
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DISPLAY_MODE_CHOICES,
  normalizeCommentaryState,
  poolName,
  standingsFor,
} from "@/components/scoring/format";
import {
  LEDGER_ROOT,
  PoolList,
  RoundChips,
  StatusBar,
  TopStrip,
} from "@/components/scoring/ledger/Ledger";
import {
  attemptMarks,
  blockPosition,
  nextPoolBlock,
  poolSummaries,
  ridingPoolBlock,
  roundChips,
  type AttemptMark,
} from "@/lib/scoring/blocks";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  type CommentaryState,
  type RiderDetail,
  type RunResult,
  type ScoringRun,
} from "@/lib/scoring/types";
import { plural } from "@/lib/scoring/format";
import { TRAINING_BANNER, TRAINING_LABEL, type TrainingScope } from "@/lib/scoring/training";
import { STAFF_RESYNC_MS, useLiveState } from "@/lib/scoring/use-live-state";

const COMMENTARY_STATE_URL = "/api/commentary/state";

const label = "mono text-[11px] uppercase text-[var(--ledger-muted)]";
const sectionTitle = "border-t-[3px] border-[var(--ledger-rule)] pt-2 text-[16px] font-bold uppercase";

/* Where each block sits when the columns stack (below `xl`); at `xl` every
   block goes back to its place in its column. */
const STACK_ORDER = {
  next: "order-1 xl:order-none",
  progress: "order-2 xl:order-none",
  recent: "order-3 xl:order-none",
  standings: "order-4 xl:order-none",
  pools: "order-5 xl:order-none",
  practice: "order-6 xl:order-none",
} as const;

/* Result colours on this screen: carried green, struck ink, miss faded. */
const RESULT_COLOUR: Record<RunResult, string> = {
  carry: "text-[var(--ledger-green)]",
  strike: "text-[var(--ledger-ink)]",
  miss: "text-[#a08a70]",
};

/* 14:31 in the browser's time zone. */
const shortTime = (iso: string | null) => {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toTimeString().slice(0, 5);
};

/* One big cell along the bottom of the rider column: Round 1 / 4 / Carried. */
type TodayCell = { key: string; label: string; big: string; text: string; colour: string };

const markCell = (mark: AttemptMark, attempt: number): TodayCell => {
  const base = { key: String(attempt), label: `Round ${attempt}` };

  switch (mark.kind) {
    case "result":
      return {
        ...base,
        big: String(RESULT_POINTS[mark.result]),
        text: RESULT_LABELS[mark.result],
        colour: RESULT_COLOUR[mark.result],
      };
    case "on_course":
      return { ...base, big: "●", text: "On course", colour: "text-[var(--ledger-bronze)]" };
    case "not_needed":
      return { ...base, big: "—", text: "Not needed", colour: "text-[var(--ledger-faint)]" };
    case "to_ride":
      return { ...base, big: "–", text: "To ride", colour: "text-[var(--ledger-faint)]" };
    case "none":
      return { ...base, big: "—", text: "", colour: "text-[var(--ledger-faint)]" };
  }
};

/* One-attempt rounds (the Aarhi rounds, the Final, Section): the rider's
   last three runs of the day instead, leaving out attempts not needed. */
const todayCells = (rider: RiderDetail | null): TodayCell[] => {
  const ridden = (rider?.today ?? []).filter((entry) => entry.status !== "void");
  const manyIn = new Set(
    (rider?.today ?? []).filter((entry) => entry.attempt_number > 1).map((entry) => entry.round_name)
  );

  return ridden.slice(-3).map((entry, index) => {
    const name = manyIn.has(entry.round_name)
      ? `${entry.round_name} · R${entry.attempt_number}`
      : entry.round_name;

    if (entry.status === "scored" && entry.result) {
      return {
        key: `${index}`,
        label: name,
        big: String(RESULT_POINTS[entry.result]),
        text: RESULT_LABELS[entry.result],
        colour: RESULT_COLOUR[entry.result],
      };
    }

    return entry.status === "on_course"
      ? { key: `${index}`, label: name, big: "●", text: "On course", colour: "text-[var(--ledger-bronze)]" }
      : entry.status === "void"
        ? { key: `${index}`, label: name, big: "—", text: "Not needed", colour: "text-[var(--ledger-faint)]" }
        : { key: `${index}`, label: name, big: "–", text: "To ride", colour: "text-[var(--ledger-faint)]" };
  });
};

/* A standings cell: filled green for a carry, a bronze dot on course. */
const standingCell = (mark: AttemptMark) => {
  if (mark.kind === "result") {
    return mark.result === "carry"
      ? { text: String(mark.points), className: "border-[var(--ledger-green)] bg-[var(--ledger-green)] text-[var(--ledger-paper)]" }
      : { text: String(mark.points), className: "border-[var(--ledger-chip)] bg-[var(--ledger-panel)] text-[var(--ledger-ink)]" };
  }

  if (mark.kind === "on_course") {
    return { text: "●", className: "border-[var(--ledger-bronze)] bg-[var(--ledger-panel)] text-[var(--ledger-bronze)]" };
  }

  return {
    text: "",
    className: mark.kind === "not_needed" ? "border-[var(--ledger-hair)]" : "border-[var(--ledger-chip)]",
  };
};

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-[var(--ledger-hair)] py-1.5">
      <span className="mono pt-[3px] text-[12px] uppercase text-[var(--ledger-muted)]">{term}</span>
      <span className="break-words text-[18px]">{value}</span>
    </div>
  );
}

/* `sample`: training mode (/commentary/demo). Reads a practice session on the
   server (?sample=1) instead of the database — the riders and their
   background are invented — and a banner says so: "shared" on a
   SCORING_SAMPLE_MODE=1 laptop, "personal" for a signed-in staff member on
   the live site, who sees the session their own /judge/demo drives. */
export default function CommentaryPanel({ sample }: { sample?: TrainingScope }) {
  const training = sample !== undefined;
  const stateUrl = training ? `${COMMENTARY_STATE_URL}?sample=1` : COMMENTARY_STATE_URL;
  const { data, error, connection, refetch } = useLiveState<CommentaryState>(stateUrl, {
    resyncMs: STAFF_RESYNC_MS,
  });
  const state = useMemo(() => normalizeCommentaryState(data), [data]);
  /* Stacked layout only: the standings of every pool, not just the current one. */
  const [allPools, setAllPools] = useState(false);

  /* Derived view of the round ------------------------------------------- */

  const runs = useMemo(
    () => [...(state?.runs ?? [])].sort((a, b) => a.run_order - b.run_order),
    [state]
  );
  const round = state?.current_round ?? null;
  const live = state?.live ?? null;
  const currentRunId = live?.current_run_id ?? null;
  const currentRun: ScoringRun | null =
    runs.find((run) => run.id === currentRunId) ??
    (state?.current_run && state.current_run.id === currentRunId ? state.current_run : null);
  const rider = currentRun ? (state?.current_rider ?? null) : null;
  const calledPool = live?.called_pool_label ?? null;
  const leaderboard = useMemo(() => state?.leaderboard ?? [], [state]);
  const attempts = round?.attempts_per_rider ?? 1;
  const manyAttempts = attempts > 1;

  const riding = useMemo(
    () => ridingPoolBlock(runs, calledPool, currentRunId),
    [runs, calledPool, currentRunId]
  );
  const nextBlock = useMemo(
    () => nextPoolBlock(runs, calledPool, currentRunId),
    [runs, calledPool, currentRunId]
  );
  const chips = useMemo(() => roundChips(runs, riding?.attempt ?? null), [runs, riding]);
  const advanced = useMemo(
    () => new Map(leaderboard.map((row) => [row.entrant_key, row.advanced])),
    [leaderboard]
  );
  const poolRows = useMemo(
    () => poolSummaries(runs, advanced, calledPool, currentRunId),
    [runs, advanced, calledPool, currentRunId]
  );

  const counted = runs.filter((run) => run.status !== "void");
  const done = counted.filter((run) => run.status === "scored").length;
  const total = counted.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const throughCount = leaderboard.filter((row) => row.advanced === true).length;
  const outCount = leaderboard.filter((row) => row.advanced === false).length;

  const standingsPool = currentRun?.pool_label ?? riding?.pool ?? calledPool ?? null;
  /* The pool's riders in the order they ride — the same order as the judges'
     panel and the All pools list — not by score, so commentators can follow
     along. */
  const firstRide = new Map<string, number>();

  for (const run of runs) {
    if (!firstRide.has(run.entrant_key)) {
      firstRide.set(run.entrant_key, run.run_order);
    }
  }

  const standings = standingsFor(leaderboard, standingsPool).sort(
    (a, b) =>
      (firstRide.get(a.entrant_key) ?? Number.MAX_SAFE_INTEGER) -
      (firstRide.get(b.entrant_key) ?? Number.MAX_SAFE_INTEGER)
  );
  const upNext = (state?.up_next ?? []).filter((run) => run.id !== currentRun?.id).slice(0, 3);
  /* Stacked layout: the one pool the standings show until "Show all pools":
     the pool riding or called, else the next one, else the first listed.
     When a pool is riding the full list is that pool already, so nothing is
     hidden; when none is, the full list is every pool. */
  const stackedPool = standingsPool ?? nextBlock?.pool ?? standings[0]?.pool_label ?? null;
  const hiddenWhenStacked = (row: { pool_label: string | null }) =>
    !allPools && stackedPool !== null && row.pool_label !== stackedPool;
  const stackedHides = standings.some(hiddenWhenStacked);
  const nextEntrant = upNext[0]?.entrant_key ?? null;
  const roundText = (attempt: number | null | undefined) =>
    manyAttempts && attempt ? `Round ${attempt}` : null;
  const where = (run: Pick<ScoringRun, "pool_label" | "attempt_number">, short = false) =>
    [
      poolName(run.pool_label),
      manyAttempts ? (short ? `R${run.attempt_number}` : `Round ${run.attempt_number}`) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const whereText =
    [
      round?.name,
      roundText(currentRun?.attempt_number ?? riding?.attempt),
      poolName(currentRun?.pool_label ?? calledPool),
    ]
      .filter(Boolean)
      .join(" · ") || "No live round";

  const screensText = live
    ? `Screens: ${DISPLAY_MODE_CHOICES.find((choice) => choice.mode === live.display_mode)?.label ?? live.display_mode}`
    : null;

  /* Render -------------------------------------------------------------- */

  /* Into practice and back again. On /judge this lives in the panel's own
     sidebar, which is on screen whatever the panel is showing. The commentary
     panel has no sidebar outside its full layout, so the link went missing
     exactly when it is wanted most: before event day no round is live, and
     "No round is live" was a dead end with no way into the demo. One
     definition, used by every branch below. */
  const practiceLink = (
    <Link
      href={training ? "/commentary" : "/commentary/demo"}
      className="mono inline-flex min-h-11 items-center text-[12px] uppercase text-[var(--ledger-muted)] underline underline-offset-4"
    >
      {training ? "Leave practice — open the live panel" : "Practise on sample riders"}
    </Link>
  );

  let body: React.ReactNode;

  if (!state) {
    body = error ? (
      <div className="max-w-2xl space-y-4 border-[3px] border-[var(--ledger-red)] bg-[var(--ledger-panel)] p-5">
        <p className="text-xl">{error}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refetch}
            className="mono min-h-12 border-2 border-[var(--ledger-ink)] px-5 text-[13px] font-semibold uppercase"
          >
            Retry
          </button>
          {!training && (
            <Link
              href="/login?redirect=/commentary"
              className="mono flex min-h-12 items-center border-2 border-[var(--ledger-ink)] px-5 text-[13px] font-semibold uppercase"
            >
              Log in again
            </Link>
          )}
          {practiceLink}
        </div>
      </div>
    ) : (
      <p className="mono py-16 text-center text-[13px] uppercase text-[var(--ledger-muted)]">Loading…</p>
    );
  } else if (!state.configured || !round) {
    body = (
      <div className="max-w-2xl border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] p-6">
        <p className="text-[30px] font-bold uppercase">
          {state.configured ? "No round is live" : "Live scoring is not set up yet"}
        </p>
        <p className="mt-3 text-[var(--ledger-muted)]">
          The panel fills in by itself as soon as a round goes live.
        </p>
        {/* Before event day this is the whole screen, so practice has to be
            reachable from it. */}
        <p className="mt-4">{practiceLink}</p>
      </div>
    );
  } else {
    const cells: TodayCell[] = currentRun
      ? manyAttempts
        ? attemptMarks(runs, currentRun.entrant_key, attempts).map((mark, index) => markCell(mark, index + 1))
        : todayCells(rider)
      : [];
    const horse = [
      rider?.horse_name ?? currentRun?.horse_name,
      rider?.horse_breed,
      rider?.horse_age !== null && rider?.horse_age !== undefined ? plural(rider.horse_age, "yr") : null,
    ]
      .filter(Boolean)
      .join(", ");
    const team = rider?.team_name ?? currentRun?.team_name ?? null;
    const facts: [string, string | null][] = [
      ["Father", rider?.father_name ?? null],
      ["Mother", rider?.mother_name ?? null],
      ["Hometown", rider?.location ?? currentRun?.rider_location ?? null],
      ["Age", rider?.age !== null && rider?.age !== undefined ? plural(rider.age, "year") : null],
      [
        "Years riding",
        rider?.years_experience !== null && rider?.years_experience !== undefined
          ? String(rider.years_experience)
          : null,
      ],
      ["Team", team ? (rider?.is_leader ? `${team} · Team leader` : team) : null],
      ["Horse", horse || null],
    ];
    const roundComplete = runs.length > 0 && done === total;
    /* Rider | R1 R2 R3 | Status, or Rider | Pts | Status. On a phone the
       boxes shrink to 26px and the status to a short tag, so the name gets
       the room. Both go in as CSS variables for the grid classes below. */
    const standingColumns = manyAttempts
      ? `22px minmax(0,1fr) repeat(${attempts},34px) minmax(0,130px)`
      : "22px minmax(0,1fr) 48px minmax(0,130px)";
    const phoneStandingColumns = manyAttempts
      ? `22px minmax(0,1fr) repeat(${attempts},26px) auto`
      : "22px minmax(0,1fr) 26px auto";
    const standingGrid = {
      "--standing-cols": standingColumns,
      "--standing-cols-phone": phoneStandingColumns,
    } as React.CSSProperties;
    const standingGridClass =
      "grid-cols-[var(--standing-cols-phone)] gap-1.5 sm:grid-cols-[var(--standing-cols)] sm:gap-2";
    const rule = round.event_type === "single"
      ? "Carried (4) = through"
      : round.target_points !== null
        ? `Target ${plural(round.target_points, "point")} = through`
        : null;

    body = (
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[1.15fr_1fr_320px] xl:gap-8">
        {/* Rider on course ------------------------------------------------ */}
        <section
          aria-labelledby="rider-name"
          className="flex min-w-0 flex-col gap-3.5 xl:overflow-y-auto xl:pb-6"
        >
          <span className="mono text-[13px] uppercase text-[var(--ledger-bronze)]">
            {currentRun
              ? `● On course · Rider ${blockPosition(runs, currentRun).index} of ${blockPosition(runs, currentRun).size}`
              : "Nobody on course"}
          </span>
          <h1
            id="rider-name"
            className="break-words text-[36px] font-bold uppercase leading-[0.92] tracking-[-0.02em] sm:text-[60px] xl:text-[72px]"
          >
            {currentRun
              ? (rider?.full_name ?? currentRun.rider_name)
              : roundComplete
                ? `${round.name} complete`
                : "Waiting for the next rider"}
          </h1>

          {currentRun && (
            <>
              <div className="flex flex-col border-t border-[var(--ledger-rule)]">
                {facts.map(([term, value]) => (
                  <Fact key={term} term={term} value={value ?? "—"} />
                ))}
              </div>
              {!rider && (
                <p className="text-[var(--ledger-muted)]">Full rider details are not available for this run.</p>
              )}
            </>
          )}

          {cells.length > 0 && (
            <div className="mt-auto grid grid-cols-3 border-t-[3px] border-[var(--ledger-rule)]">
              {cells.map((cell) => (
                <div key={cell.key} className="flex min-w-0 flex-col gap-0.5 pr-3 pt-2.5">
                  <span className={`${label} truncate`}>{cell.label}</span>
                  <span className={`text-[48px] font-bold leading-[0.9] sm:text-[64px] ${cell.colour}`}>
                    {cell.big}
                  </span>
                  <span className={`text-[15px] font-semibold ${cell.colour}`}>{cell.text}</span>
                </div>
              ))}
            </div>
          )}
          {currentRun && !manyAttempts && cells.length === 0 && (
            <p className="mt-auto border-t-[3px] border-[var(--ledger-rule)] pt-2.5 text-[var(--ledger-muted)]">
              First run of the day.
            </p>
          )}
        </section>

        {/* Pool standings and round progress ------------------------------ */}
        {/* Stacked, this column's blocks join the page's grid (contents) so
            the order classes can place them among the others. */}
        <section
          aria-labelledby="standings-title"
          className="flex min-w-0 flex-col gap-3 max-xl:contents xl:overflow-y-auto xl:pb-6"
        >
          <div className={`flex items-baseline justify-between gap-3 border-b-[3px] border-[var(--ledger-rule)] pb-1.5 ${STACK_ORDER.standings}`}>
            <h2 id="standings-title" className="text-[22px] font-bold uppercase">
              {standingsPool ? (
                `Pool ${standingsPool} standings`
              ) : stackedHides ? (
                <>
                  <span className="xl:hidden">Pool {stackedPool} standings</span>
                  <span className="max-xl:hidden">Standings</span>
                </>
              ) : (
                "Standings"
              )}
            </h2>
            {rule && <span className="mono text-[11px] uppercase text-[var(--ledger-muted)]">{rule}</span>}
          </div>

          <div
            className={`mono grid px-1 text-[10px] uppercase text-[var(--ledger-muted)] ${standingGridClass} ${STACK_ORDER.standings}`}
            style={standingGrid}
          >
            <span className="text-right">#</span>
            <span>{standings.some((row) => row.entrant_key.startsWith("team:")) ? "Team" : "Rider"}</span>
            {manyAttempts
              ? Array.from({ length: attempts }, (_, index) => <span key={index}>R{index + 1}</span>)
              : <span>Pts</span>}
            <span>Status</span>
          </div>

          <div id="standings-rows" className={`flex flex-col ${STACK_ORDER.standings}`}>
            {standings.length === 0 && (
              <p className="px-1 py-2 text-[var(--ledger-muted)]">No standings yet.</p>
            )}
            {standings.map((row, index) => {
              const onCourse = currentRun?.entrant_key === row.entrant_key;
              /* [words, phone tag, colour]: the tag is what fits a phone. */
              const [status, tag, colour] =
                row.advanced === true
                  ? ["Through", "Through", "text-[var(--ledger-green)]"]
                  : row.advanced === false
                    ? ["Out", "Out", "text-[var(--ledger-red)]"]
                    : onCourse
                      ? ["Riding now", "Riding", "text-[var(--ledger-bronze)]"]
                      : nextEntrant === row.entrant_key
                        ? ["Still riding", "Next", "text-[var(--ledger-ink)]"]
                        : ["Still riding", "—", "text-[var(--ledger-ink)]"];

              return (
                <div
                  key={row.entrant_key}
                  className={`grid items-center border-b border-[var(--ledger-hair)] px-1 py-1.5 ${standingGridClass} ${
                    onCourse ? "bg-[var(--ledger-hl)]" : ""
                  } ${hiddenWhenStacked(row) ? "max-xl:hidden" : ""}`}
                  style={standingGrid}
                >
                  {/* Riding order in the pool (standings are listed in it). */}
                  <span className="mono text-right text-[13px] text-[var(--ledger-muted)]">{index + 1}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold sm:text-[18px]">{row.name}</span>
                    {row.team_name && row.team_name !== row.name && (
                      <span className="truncate text-[12px] text-[var(--ledger-muted)] sm:text-[13px]">{row.team_name}</span>
                    )}
                  </span>
                  {manyAttempts ? (
                    attemptMarks(runs, row.entrant_key, attempts).map((mark, index) => {
                      const cell = standingCell(mark);

                      return (
                        <span
                          key={index}
                          className={`mono flex h-[26px] items-center justify-center border text-[13px] font-semibold sm:h-[34px] sm:text-[15px] ${cell.className}`}
                        >
                          {cell.text}
                        </span>
                      );
                    })
                  ) : (
                    <span className="mono flex h-[26px] items-center justify-center border border-[var(--ledger-chip)] bg-[var(--ledger-panel)] text-[13px] font-semibold sm:h-[34px] sm:text-[15px]">
                      {row.points}
                    </span>
                  )}
                  <span className={`mono text-[10px] font-semibold uppercase sm:text-[12px] ${colour}`}>
                    <span aria-hidden="true" className="sm:hidden">
                      {tag}
                    </span>
                    <span className="max-sm:sr-only">{status}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stacked only: the other pools' standings on request. */}
          {(stackedHides || allPools) && (
            <button
              type="button"
              aria-expanded={allPools}
              aria-controls="standings-rows"
              onClick={() => setAllPools((open) => !open)}
              className={`mono min-h-11 border-2 border-[var(--ledger-ink)] bg-transparent px-4 text-[13px] font-semibold uppercase xl:hidden ${STACK_ORDER.standings}`}
            >
              {allPools ? `Show Pool ${stackedPool} only` : "Show all pools"}
            </button>
          )}

          <div className={`mt-auto flex flex-col gap-1.5 border-t-[3px] border-[var(--ledger-rule)] pt-2.5 ${STACK_ORDER.progress}`}>
            <span id="progress-title" className={label}>
              Round progress
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[52px] font-bold leading-[0.9] sm:text-[64px]">
                {done}
                <span className="text-[var(--ledger-faint)]">/{total}</span>
              </span>
              <span className="mono text-right text-[12px] uppercase text-[var(--ledger-rule)]">
                {throughCount} through
                <br />
                {outCount} out
              </span>
            </div>
            <div
              role="progressbar"
              aria-labelledby="progress-title"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1 bg-[var(--ledger-hair)]"
            >
              <div className="h-full bg-[var(--ledger-ink)]" style={{ width: `${percent}%` }} />
            </div>
            <RoundChips chips={chips} />
          </div>
        </section>

        {/* Next riders, next pool, recent results, all pools -------------- */}
        {/* Stacked, like the standings column: its blocks join the page's
            grid and take their places by order. */}
        <aside className="-mx-4 flex min-w-0 flex-col gap-3 border-t-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-side)] px-4 pb-6 pt-4 max-xl:contents xl:-mr-9 xl:ml-0 xl:overflow-y-auto xl:border-l-[3px] xl:border-t-0 xl:pl-6 xl:pr-9 xl:pt-0">
          <div className={`flex flex-col gap-1 border-t-[3px] border-[var(--ledger-rule)] pt-2.5 xl:border-t-0 xl:pt-0 ${STACK_ORDER.next}`}>
            <span className={label}>
              {["Next riders", upNext[0] ? where(upNext[0]) : null].filter(Boolean).join(" · ")}
            </span>
            {upNext.length === 0 ? (
              <span className="text-[28px] font-bold uppercase leading-none">—</span>
            ) : (
              <ol className="flex flex-col gap-1">
                {upNext.map((run, index) => (
                  <li key={run.id} className="flex flex-col">
                    <span
                      className={`break-words font-bold uppercase leading-none ${
                        index === 0 ? "text-[28px]" : "text-[20px]"
                      }`}
                    >
                      {run.rider_name}
                    </span>
                    {index > 0 && upNext[0] && where(run) !== where(upNext[0]) && (
                      <span className="mono text-[11px] uppercase text-[var(--ledger-muted)]">{where(run)}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className={`flex items-baseline justify-between gap-3 border-t border-[var(--ledger-rule)] pt-2.5 ${STACK_ORDER.next}`}>
            <span className={label}>
              Next pool
              {roundText(nextBlock?.attempt) && (
                <>
                  <br />
                  {roundText(nextBlock?.attempt)}
                </>
              )}
            </span>
            <span className="text-[52px] font-bold leading-[0.9]">
              {nextBlock ? `Pool ${nextBlock.pool}` : "None"}
            </span>
          </div>

          <h2 className={`${sectionTitle} ${STACK_ORDER.recent}`}>Recent results</h2>
          {state.recent_results.length === 0 && (
            <p className={`text-[13px] text-[var(--ledger-muted)] ${STACK_ORDER.recent}`}>No results yet in this round.</p>
          )}
          <div className={`flex flex-col ${STACK_ORDER.recent}`}>
            {state.recent_results.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="grid grid-cols-[62px_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-[var(--ledger-hair)] py-[3px] text-[13px]"
              >
                <span className="mono text-[11px] text-[var(--ledger-muted)]">{shortTime(run.scored_at)}</span>
                <span className="min-w-0">
                  <b>{run.rider_name}</b>{" "}
                  <span className="text-[12px] text-[var(--ledger-muted)]">{where(run, true)}</span>
                </span>
                <span className={`font-bold ${run.result ? RESULT_COLOUR[run.result] : ""}`}>
                  {run.result ? `${RESULT_LABELS[run.result]} ${RESULT_POINTS[run.result]}` : ""}
                </span>
              </div>
            ))}
          </div>

          {poolRows.length > 0 && (
            <>
              <h2 className={`${sectionTitle} ${STACK_ORDER.pools}`}>All pools</h2>
              <div className={`flex flex-col ${STACK_ORDER.pools}`}>
                <PoolList pools={poolRows} rounds={manyAttempts} compact openPool={riding?.pool ?? null} />
              </div>
            </>
          )}

          {/* Practise from home before event day; back again afterwards. */}
          <p className={`mt-auto pt-4 ${STACK_ORDER.practice}`}>{practiceLink}</p>
        </aside>
      </div>
    );
  }

  return (
    <div className={`${LEDGER_ROOT} flex min-h-dvh flex-col uppercase xl:h-dvh [&_input]:normal-case [&_textarea]:normal-case`}>
      {sample && (
        <p
          role="note"
          aria-label="Training mode"
          className="bg-[#f2b07a] px-4 py-2 text-[14px] text-[var(--ledger-ink)] xl:px-9"
        >
          <span className="mono mr-3 font-semibold uppercase">{TRAINING_LABEL}</span>
          {TRAINING_BANNER[sample]}
        </p>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-5 xl:px-9 xl:pt-6">
        <TopStrip who="Commentary" where={whereText} />
        {state && error && (
          <p className="border-2 border-[var(--ledger-red)] bg-[var(--ledger-panel)] px-4 py-2 text-[var(--ledger-red)]">
            {error}
          </p>
        )}
        {body}
      </main>

      {live?.message && (
        <p className="border-t-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-pick)] px-4 py-2 text-center text-[20px] font-bold uppercase xl:px-9">
          {live.message}
        </p>
      )}

      <div className="sticky bottom-0 z-20">
        <StatusBar
          role="Commentary"
          items={[
            round?.name,
            poolName(currentRun?.pool_label ?? riding?.pool ?? null),
            round && total > 0 ? `${done}/${plural(total, "run")}` : null,
            screensText,
          ]}
          phoneItems={[round && total > 0 ? `${done}/${plural(total, "run")}` : null]}
          connection={connection}
          liveWord="Live"
        />
      </div>
    </div>
  );
}
