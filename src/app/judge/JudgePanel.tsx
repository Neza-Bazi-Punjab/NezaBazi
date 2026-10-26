"use client";

/* The judges' panel: a phone at the track, in bright sun, often with gloves.
   Two taps per result (choose, then confirm), huge targets, high contrast,
   nothing that depends on hover. Every write's response carries the fresh
   start list, which is applied at once — the panel never waits on realtime
   to show its own action. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConnectionBadge from "@/components/scoring/ConnectionBadge";
import ResultBadge, { ResultMark } from "@/components/scoring/ResultBadge";
import {
  ALREADY_QUALIFIED_NOTE,
  DISPLAY_MODE_CHOICES,
  attemptText,
  carriedEntrantKeys,
  eventTypeName,
  groupRunsByPool,
  normalizeJudgeState,
  poolName,
  runSubtitle,
} from "@/components/scoring/format";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  RUN_RESULTS,
  type JudgeState,
  type RunResult,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import { startListMatcher } from "@/lib/scoring/start-list-search";
import { TRAINING_BANNER, TRAINING_LABEL, type TrainingScope } from "@/lib/scoring/training";
import { useLiveState } from "@/lib/scoring/use-live-state";
import {
  describeAction,
  sendAction,
  successMessage,
  withTrainingFlag,
  type JudgeAction,
} from "./judge-actions";

const JUDGE_STATE_URL = "/api/judge/state";

type Toast = { id: number; tone: "error" | "success"; message: string };
type RunSheet = { runId: string; mode: "actions" | "change" };

const RESULT_BUTTON: Record<RunResult, string> = {
  carry: "bg-emerald-400 text-ink",
  strike: "bg-amber-300 text-ink",
  miss: "bg-stone-200 text-ink",
};

const CONFIRM_BUTTON: Record<RunResult, string> = {
  carry: "bg-emerald-700 text-cream",
  strike: "bg-amber-700 text-cream",
  miss: "bg-ink text-cream",
};

const ROUND_STATUS_TEXT: Record<ScoringRound["status"], string> = {
  upcoming: "Upcoming",
  live: "Live",
  complete: "Complete",
};

const label = "font-display text-xs font-semibold uppercase tracking-[0.18em] text-cream/70";
const secondaryButton =
  "min-h-14 rounded-xl border-2 border-cream/40 px-4 font-display text-base font-semibold uppercase tracking-[0.1em] text-cream active:bg-white/10 disabled:opacity-40";
const primaryButton =
  "min-h-16 w-full rounded-xl bg-bronze px-4 font-display text-xl font-bold uppercase tracking-[0.1em] text-cream active:bg-bronze-dark disabled:opacity-40";

const latestScored = (runs: ScoringRun[]) => {
  let latest: ScoringRun | null = null;

  for (const run of runs) {
    if (run.status !== "scored" || !run.result) {
      continue;
    }

    if (!latest || (run.scored_at ?? "") > (latest.scored_at ?? "")) {
      latest = run;
    }
  }

  return latest;
};

const isOpenRun = (run: ScoringRun) => run.status === "pending" || run.status === "on_course";

/* `sample`: training mode (/judge/demo). Every read and write goes to a
   practice session on the server (?sample=1) instead of the database, and a
   banner says so: "shared" on a SCORING_SAMPLE_MODE=1 laptop, "personal" for
   a signed-in staff member on the live site. The server decides which
   session a request gets; this only chooses the words. */
export default function JudgePanel({ sample }: { sample?: TrainingScope }) {
  const training = sample !== undefined;
  const stateUrl = training ? withTrainingFlag(JUDGE_STATE_URL) : JUDGE_STATE_URL;
  const { data, error, connection, lastUpdated, refetch, setData } =
    useLiveState<JudgeState>(stateUrl);
  const state = useMemo(() => normalizeJudgeState(data), [data]);

  const [pending, setPending] = useState<JudgeAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [screensOpen, setScreensOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState<string | null>(null);
  const [runSheet, setRunSheet] = useState<RunSheet | null>(null);
  const [startListQuery, setStartListQuery] = useState("");
  const busyRef = useRef(false);
  const toastSeq = useRef(0);

  /* Derived view of the round ------------------------------------------- */

  const runs = useMemo(
    () => [...(state?.runs ?? [])].sort((a, b) => a.run_order - b.run_order),
    [state]
  );
  const round = state?.current_round ?? null;
  const live = state?.live ?? null;
  const currentRunId = live?.current_run_id ?? null;
  const currentRun =
    runs.find((run) => run.id === currentRunId) ??
    (state?.current_run && state.current_run.id === currentRunId ? state.current_run : null);
  const pools = state?.pools ?? [];
  const calledPool = live?.called_pool_label ?? null;
  const lastScored = latestScored(runs);
  const scoredCount = runs.filter((run) => run.status === "scored").length;
  const groups = useMemo(() => groupRunsByPool(runs), [runs]);
  /* The start-list drawer's search: rider, team, horse or pool. */
  const shownGroups = useMemo(() => {
    const matches = startListMatcher(startListQuery, state?.pools ?? []);

    return groups
      .map((group) => ({
        ...group,
        shown: group.runs.filter((run) =>
          matches({ texts: [run.rider_name, run.team_name, run.horse_name], pool: run.pool_label })
        ),
      }))
      .filter((group) => group.shown.length > 0);
  }, [groups, startListQuery, state]);
  const searching = startListQuery.trim() !== "";
  const carried = useMemo(() => carriedEntrantKeys(runs, round), [runs, round]);
  /* A voided attempt of a rider who has already carried in a qualification
     round: the database skipped it, and the judge should know why. */
  const alreadyQualified = (run: ScoringRun) =>
    run.status === "void" && carried.has(run.entrant_key);
  const sheetRun = runSheet ? (runs.find((run) => run.id === runSheet.runId) ?? null) : null;
  const nextRider = state?.up_next.find((run) => run.id !== currentRun?.id) ?? null;

  const poolHasOpenRuns = (pool: string) =>
    runs.some((run) => run.pool_label === pool && isOpenRun(run));

  /* The pool to call next: after the called one, or the first with riders
     still to go when nothing has been called yet. */
  const nextPoolToCall = (() => {
    if (pools.length === 0) {
      return null;
    }

    if (!calledPool) {
      return pools.find(poolHasOpenRuns) ?? null;
    }

    const index = pools.indexOf(calledPool);
    const after = index >= 0 ? pools.slice(index + 1) : pools;
    return state?.next_pool_label ?? after.find(poolHasOpenRuns) ?? after[0] ?? null;
  })();
  const calledPoolDone = calledPool ? !poolHasOpenRuns(calledPool) : true;

  /* A result armed from the big buttons belongs to one rider: if someone
     else comes on course (another judge, an administrator) it is dropped. */
  const visiblePending =
    pending && pending.kind === "score" && pending.fromMain && pending.run.id !== currentRun?.id
      ? null
      : pending;

  /* Toasts -------------------------------------------------------------- */

  const dismissToast = useCallback(
    (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)),
    []
  );

  const pushToast = useCallback(
    (tone: Toast["tone"], message: string) => {
      const id = ++toastSeq.current;
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);

      if (tone === "success") {
        window.setTimeout(() => dismissToast(id), 3500);
      }
    },
    [dismissToast]
  );

  /* Writes -------------------------------------------------------------- */

  const perform = async (action: JudgeAction) => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);

    try {
      const next = await sendAction(action, training);

      if (next) {
        setData(next);
      } else {
        refetch();
      }

      setPending(null);
      setRunSheet(null);

      if (action.kind === "display" || action.kind === "message") {
        setScreensOpen(false);
        setMessageDraft(null);
      }

      if (action.kind === "current" || action.kind === "round") {
        setDrawerOpen(false);
        setRoundsOpen(false);
      }

      pushToast("success", successMessage(action));
    } catch (caught) {
      setPending(null);
      pushToast(
        "error",
        caught instanceof Error ? caught.message : "Something went wrong. Nothing was changed."
      );
      refetch();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const arm = (action: JudgeAction) => {
    if (!busyRef.current) {
      setPending(action);
    }
  };

  /* Escape closes the topmost layer (keyboards on tablets and laptops). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (pending) {
        setPending(null);
      } else if (runSheet) {
        setRunSheet(null);
      } else if (roundsOpen) {
        setRoundsOpen(false);
      } else if (drawerOpen) {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, runSheet, roundsOpen, drawerOpen]);

  /* Keep the phone awake while the panel is open (where supported). */
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let disposed = false;

    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          const next = await navigator.wakeLock.request("screen");

          if (disposed) {
            void next.release();
          } else {
            lock = next;
          }
        }
      } catch {
        // Not supported, or denied (battery saver) — the panel works anyway.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, []);

  /* Render -------------------------------------------------------------- */

  const confirmCopy = visiblePending ? describeAction(visiblePending) : null;

  const header = (
    <header className="sticky top-0 z-30 border-b border-cream/10 bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      {sample && (
        <div
          role="note"
          aria-label="Training mode"
          className="mx-auto mb-3 flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-300 bg-amber-300 px-3 py-2 text-ink"
        >
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold uppercase tracking-[0.08em]">
              {TRAINING_LABEL}
            </p>
            <p className="text-sm font-medium leading-snug">{TRAINING_BANNER[sample]}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => arm({ kind: "reset", scope: sample })}
            className="min-h-11 rounded-lg border-2 border-ink px-3 font-display text-xs font-bold uppercase tracking-[0.1em] active:bg-ink/10 disabled:opacity-40"
          >
            Reset training data
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-xl items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold uppercase tracking-wide">
            {round?.name ?? "Judges' Panel"}
          </p>
          <p className="mt-0.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-cream/75">
            {[
              currentRun ? poolName(currentRun.pool_label) : poolName(calledPool),
              currentRun && runs.length > 0
                ? `Run ${currentRun.run_order} of ${runs.length}`
                : runs.length > 0
                  ? `${scoredCount} of ${runs.length} scored`
                  : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No live round"}
          </p>
        </div>
        <ConnectionBadge connection={connection} lastUpdated={lastUpdated} tone="dark" />
      </div>
      <div className="mx-auto mt-3 grid max-w-xl grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          disabled={!round}
          className={`${secondaryButton} px-2`}
        >
          Start list
        </button>
        <button type="button" onClick={() => setRoundsOpen(true)} className={`${secondaryButton} px-2`}>
          Round
        </button>
        <button
          type="button"
          onClick={() => setScreensOpen(true)}
          disabled={!state?.configured}
          className={`${secondaryButton} px-2`}
        >
          Screens
        </button>
      </div>
    </header>
  );

  let body: React.ReactNode;

  if (!state) {
    body = error ? (
      <div className="space-y-4 rounded-2xl border-2 border-red-400/70 bg-red-950/40 p-5">
        <p className="text-lg">{error}</p>
        <div className={`grid gap-2 ${training ? "grid-cols-1" : "grid-cols-2"}`}>
          <button type="button" onClick={refetch} className={secondaryButton}>
            Retry
          </button>
          {!training && (
            <Link
              href="/login?redirect=/judge"
              className={`${secondaryButton} flex items-center justify-center`}
            >
              Log in again
            </Link>
          )}
        </div>
      </div>
    ) : (
      <p className="py-16 text-center text-lg text-cream/75">Loading the start list…</p>
    );
  } else if (!state.configured) {
    body = (
      <div className="rounded-2xl border border-cream/15 bg-white/5 p-6 text-center">
        <p className="font-display text-2xl font-bold uppercase">Live scoring is not set up yet</p>
        <p className="mt-3 text-cream/75">
          An administrator needs to apply the scoring setup. This panel will update by itself.
        </p>
      </div>
    );
  } else if (!round) {
    body = (
      <div className="space-y-4 rounded-2xl border border-cream/15 bg-white/5 p-6 text-center">
        <p className="font-display text-2xl font-bold uppercase">No live round</p>
        <p className="text-cream/75">
          {state.rounds.length > 0
            ? "Choose the round that is being ridden."
            : "No rounds have been created yet. An administrator sets them up under Admin → Scoring."}
        </p>
        {state.rounds.length > 0 && (
          <button type="button" onClick={() => setRoundsOpen(true)} className={primaryButton}>
            Choose round
          </button>
        )}
      </div>
    );
  } else {
    const teamPosition = (() => {
      if (!currentRun || !currentRun.team_id) {
        return null;
      }

      const teamRuns = runs.filter(
        (run) =>
          run.entrant_key === currentRun.entrant_key &&
          run.attempt_number === currentRun.attempt_number
      );
      const index = teamRuns.findIndex((run) => run.id === currentRun.id);
      return index >= 0 ? `Rider ${index + 1} of ${teamRuns.length}` : null;
    })();

    const overrideMode = currentRun?.status === "scored";
    const resultsDisabled = busy || !currentRun || currentRun.status === "void";

    body = (
      <div className="space-y-5">
        {error && (
          <p className="rounded-xl border-2 border-red-400/70 bg-red-950/40 px-4 py-3">
            {error}
          </p>
        )}

        {/* Call Pool --------------------------------------------------- */}
        {pools.length > 0 && (
          <section aria-label="Pool call-up" className="rounded-2xl border border-cream/15 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-display text-lg font-semibold uppercase tracking-wide">
                <span className={label}>Called </span>
                {calledPool ? `Pool ${calledPool}` : "None yet"}
              </p>
              <p className="font-display text-lg font-semibold uppercase tracking-wide text-cream/80">
                <span className={label}>Next </span>
                {nextPoolToCall ? `Pool ${nextPoolToCall}` : "—"}
              </p>
            </div>

            {live?.display_mode === "pool_call" && (
              <div className="mt-3 space-y-2 rounded-xl bg-bronze/25 p-3">
                <p className="text-base">
                  Screens show the Pool {calledPool} call-up. They return to the scoreboard on the
                  first result.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => arm({ kind: "scoreboard" })}
                  className={`${secondaryButton} w-full`}
                >
                  Show scoreboard now
                </button>
              </div>
            )}

            {nextPoolToCall && calledPoolDone ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => arm({ kind: "call", roundId: round.id, pool: nextPoolToCall })}
                className={`${primaryButton} mt-3 min-h-20 text-2xl`}
              >
                Call Pool {nextPoolToCall}
              </button>
            ) : nextPoolToCall ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => arm({ kind: "call", roundId: round.id, pool: nextPoolToCall })}
                className={`${secondaryButton} mt-3 w-full`}
              >
                Call Pool {nextPoolToCall} early
              </button>
            ) : calledPoolDone && calledPool ? (
              <p className="mt-3 text-cream/75">Every pool in this round has ridden.</p>
            ) : null}
          </section>
        )}

        {/* Current rider ----------------------------------------------- */}
        <section
          aria-labelledby="current-rider-name"
          className={`rounded-2xl border-2 p-5 ${
            currentRun ? "border-bronze bg-white/5" : "border-cream/15"
          }`}
        >
          {currentRun ? (
            <>
              <p className={label}>
                {[
                  currentRun.status === "void" ? "Skipped" : "On course",
                  poolName(currentRun.pool_label),
                  attemptText(currentRun, round),
                  teamPosition,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <h1
                id="current-rider-name"
                className="mt-2 break-words font-display text-[2.6rem] font-bold uppercase leading-[1.02] tracking-wide sm:text-5xl"
              >
                {currentRun.rider_name}
              </h1>
              {runSubtitle(currentRun) && (
                <p className="mt-2 text-xl text-cream/85">{runSubtitle(currentRun)}</p>
              )}
              {overrideMode && currentRun.result && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-cream/80">Already recorded:</span>
                  <ResultBadge result={currentRun.result} tone="dark" size="md" />
                  <span className="text-cream/80">Pick a result to change it.</span>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 id="current-rider-name" className="font-display text-2xl font-bold uppercase">
                Nobody on course
              </h1>
              <p className="mt-2 text-cream/75">
                {nextRider
                  ? `Next waiting: ${nextRider.rider_name}.`
                  : "No riders are waiting in this round."}
              </p>
              {nextRider && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void perform({ kind: "current", run: nextRider })}
                  className={`${primaryButton} mt-4`}
                >
                  Put {nextRider.rider_name} on course
                </button>
              )}
            </>
          )}
        </section>

        {/* Result buttons ---------------------------------------------- */}
        <section aria-label="Record a result" className="grid gap-3">
          {RUN_RESULTS.map((result) => {
            const armed =
              visiblePending?.kind === "score" &&
              visiblePending.fromMain &&
              visiblePending.result === result;
            const sameAsRecorded = overrideMode && currentRun?.result === result;

            return (
              <button
                key={result}
                type="button"
                disabled={resultsDisabled || sameAsRecorded}
                aria-pressed={armed}
                onClick={() =>
                  currentRun &&
                  arm({
                    kind: "score",
                    run: currentRun,
                    result,
                    override: overrideMode,
                    fromMain: true,
                  })
                }
                className={`flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl px-5 font-display font-bold uppercase tracking-[0.06em] disabled:opacity-35 ${
                  RESULT_BUTTON[result]
                } ${armed ? "outline outline-4 outline-offset-4 outline-cream" : ""}`}
              >
                <span className="flex items-center gap-3 text-3xl">
                  <ResultMark result={result} className="h-6 w-6" />
                  {RESULT_LABELS[result]}
                </span>
                <span className="text-4xl tabular-nums">
                  {RESULT_POINTS[result]}
                  <span className="sr-only"> points</span>
                </span>
              </button>
            );
          })}
        </section>

        {currentRun && (
          <div className="grid grid-cols-1 gap-2">
            {currentRun.status === "void" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => arm({ kind: "restore", run: currentRun })}
                className={secondaryButton}
              >
                Restore this run
              </button>
            ) : currentRun.status !== "scored" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => arm({ kind: "void", run: currentRun })}
                className={secondaryButton}
              >
                Skip run
              </button>
            ) : null}
          </div>
        )}

        {/* Last result ------------------------------------------------- */}
        {lastScored && lastScored.result && (
          <section aria-label="Last result" className="rounded-2xl border border-cream/15 p-4">
            <p className={label}>Last result · Run {lastScored.run_order}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words font-display text-xl font-semibold uppercase">
                {lastScored.rider_name}
              </p>
              <ResultBadge result={lastScored.result} tone="dark" size="md" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRunSheet({ runId: lastScored.id, mode: "change" })}
                className={secondaryButton}
              >
                Change result
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => arm({ kind: "clear", run: lastScored, returnToRun: true })}
                className={secondaryButton}
              >
                Undo last result
              </button>
            </div>
          </section>
        )}

        {nextRider && currentRun && (
          <p className="text-center text-cream/70">
            <span className={label}>Next </span>
            {nextRider.rider_name}
            {runSubtitle(nextRider) ? ` · ${runSubtitle(nextRider)}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ink text-cream">
      {header}

      <main className={`mx-auto max-w-xl px-4 pt-5 ${visiblePending ? "pb-56" : "pb-10"}`}>
        {body}

        {/* Practice from home before event day; back again afterwards. */}
        <p className="mt-10 text-center">
          <Link
            href={training ? "/judge" : "/judge/demo"}
            className="inline-flex min-h-11 items-center font-display text-sm font-semibold uppercase tracking-[0.12em] text-cream/70 underline underline-offset-4"
          >
            {training ? "Leave practice — open the live panel" : "Practise on sample riders"}
          </Link>
        </p>
      </main>

      {/* Start list drawer ---------------------------------------------- */}
      {drawerOpen && round && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-list-title"
          className="fixed inset-0 z-40 overflow-y-auto bg-ink"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cream/10 bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <div className="min-w-0">
              <h2 id="start-list-title" className="font-display text-xl font-bold uppercase">
                Start list
              </h2>
              <p className="truncate text-sm text-cream/70">
                {round.name} · {scoredCount} of {runs.length} scored
              </p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setDrawerOpen(false)}
              className={`${secondaryButton} shrink-0`}
            >
              Close
            </button>
          </div>

          <div className={`mx-auto max-w-xl space-y-6 px-4 pt-4 ${visiblePending ? "pb-56" : "pb-10"}`}>
            {runs.length > 0 && (
              <div className="space-y-1">
                <label htmlFor="start-list-search" className={label}>
                  Find a rider
                </label>
                <div className="flex gap-2">
                  <input
                    id="start-list-search"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    enterKeyHint="search"
                    value={startListQuery}
                    onChange={(event) => setStartListQuery(event.target.value)}
                    placeholder="Name, team, horse or pool"
                    className="min-h-14 w-full min-w-0 flex-1 rounded-xl border-2 border-cream/30 bg-white/5 px-3 text-lg text-cream placeholder:text-cream/40 focus:border-bronze focus:outline-none"
                  />
                  {searching && (
                    <button
                      type="button"
                      onClick={() => setStartListQuery("")}
                      className={`${secondaryButton} shrink-0`}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-sm text-cream/65">Tap a rider to put them on course.</p>
              </div>
            )}
            {runs.length === 0 && (
              <p className="py-10 text-center text-cream/75">
                No start list has been drawn for this round yet.
              </p>
            )}
            {runs.length > 0 && shownGroups.length === 0 && (
              <p className="py-6 text-center text-lg text-cream/75">
                No rider matches “{startListQuery.trim()}”.
              </p>
            )}
            {shownGroups.map((group) => {
              const open = group.runs.filter(isOpenRun).length;
              const scored = group.runs.filter((run) => run.status === "scored").length;

              return (
                <section key={group.label ?? "unpooled"} aria-label={poolName(group.label) ?? "Start list"}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-2xl font-bold uppercase">
                        {poolName(group.label) ?? "All riders"}
                        {group.label && group.label === calledPool && (
                          <span className="ml-2 rounded-full bg-bronze px-2 py-0.5 align-middle text-xs tracking-[0.12em]">
                            Called
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-cream/70">
                        {open} to ride · {scored} scored
                      </p>
                    </div>
                    {group.label && (
                      <button
                        type="button"
                        disabled={busy || open === 0}
                        onClick={() =>
                          arm({ kind: "call", roundId: round.id, pool: group.label as string })
                        }
                        className={secondaryButton}
                      >
                        Call Pool {group.label}
                      </button>
                    )}
                  </div>
                  <ol className="space-y-2">
                    {group.shown.map((run) => {
                      const isCurrent = run.id === currentRun?.id;

                      return (
                        <li key={run.id}>
                          <button
                            type="button"
                            onClick={() => setRunSheet({ runId: run.id, mode: "actions" })}
                            aria-current={isCurrent ? "step" : undefined}
                            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left active:bg-white/10 ${
                              isCurrent
                                ? "border-bronze border-l-8 bg-white/10"
                                : run.status === "void"
                                  ? "border-dashed border-cream/25 text-cream/60"
                                  : "border-cream/15"
                            }`}
                          >
                            <span className="w-9 shrink-0 text-right font-display text-lg font-bold tabular-nums text-cream/60">
                              {run.run_order}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block break-words font-display text-lg font-semibold uppercase leading-tight">
                                {run.rider_name}
                              </span>
                              <span className="block text-sm text-cream/65">
                                {[
                                  run.team_name,
                                  round.attempts_per_rider > 1
                                    ? `Attempt ${run.attempt_number}`
                                    : null,
                                  isCurrent ? "Current rider" : null,
                                  alreadyQualified(run) ? ALREADY_QUALIFIED_NOTE : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            <ResultBadge result={run.result} status={run.status} tone="dark" size="sm" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Screens: what /live and the stream overlays show ---------------- */}
      {screensOpen && state && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="screens-title"
          className="fixed inset-0 z-40 overflow-y-auto bg-ink"
        >
          <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-cream/10 bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h2 id="screens-title" className="font-display text-xl font-bold uppercase">
              Screens
            </h2>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setScreensOpen(false);
                setMessageDraft(null);
              }}
              className={`${secondaryButton} shrink-0`}
            >
              Close
            </button>
          </div>
          <div className={`mx-auto max-w-xl space-y-6 px-4 pt-4 ${visiblePending ? "pb-56" : "pb-10"}`}>
            <section aria-label="Display mode" className="grid grid-cols-2 gap-2">
              {DISPLAY_MODE_CHOICES.map((choice) => {
                const active = live?.display_mode === choice.mode;

                return (
                  <button
                    key={choice.mode}
                    type="button"
                    aria-pressed={active}
                    disabled={busy || active}
                    onClick={() => arm({ kind: "display", mode: choice.mode })}
                    className={`min-h-20 rounded-xl border-2 px-3 py-2 text-left disabled:cursor-default ${
                      active ? "border-bronze bg-bronze/30" : "border-cream/25 active:bg-white/10"
                    }`}
                  >
                    <span className="block font-display text-lg font-bold uppercase leading-tight">
                      {choice.label}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-cream/70">
                      {active ? "On screen now" : choice.hint}
                    </span>
                  </button>
                );
              })}
            </section>

            <section aria-labelledby="screens-message-label" className="space-y-2">
              <label
                id="screens-message-label"
                htmlFor="screens-message"
                className={label}
              >
                Message on the screens
              </label>
              <textarea
                id="screens-message"
                rows={2}
                maxLength={200}
                value={messageDraft ?? live?.message ?? ""}
                onChange={(event) => setMessageDraft(event.target.value)}
                className="block w-full rounded-xl border-2 border-cream/30 bg-white/5 px-3 py-3 text-lg text-cream placeholder:text-cream/40 focus:border-bronze focus:outline-none"
                placeholder="e.g. Short break — Pool C rides at 2:30"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || (messageDraft ?? live?.message ?? "").trim() === ""}
                  onClick={() =>
                    arm({ kind: "message", message: (messageDraft ?? live?.message ?? "").trim() })
                  }
                  className={secondaryButton}
                >
                  Set message
                </button>
                <button
                  type="button"
                  disabled={busy || !live?.message}
                  onClick={() => arm({ kind: "message", message: null })}
                  className={secondaryButton}
                >
                  Clear
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Round picker --------------------------------------------------- */}
      {roundsOpen && state && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="round-picker-title"
          className="fixed inset-0 z-40 overflow-y-auto bg-ink"
        >
          <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-cream/10 bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h2 id="round-picker-title" className="font-display text-xl font-bold uppercase">
              Live round
            </h2>
            <button
              type="button"
              autoFocus
              onClick={() => setRoundsOpen(false)}
              className={`${secondaryButton} shrink-0`}
            >
              Close
            </button>
          </div>
          <ul className={`mx-auto max-w-xl space-y-2 px-4 pt-4 ${visiblePending ? "pb-56" : "pb-10"}`}>
            {state.rounds.length === 0 && (
              <li className="py-10 text-center text-cream/75">No rounds have been created yet.</li>
            )}
            {state.rounds.map((option) => {
              const isCurrent = option.id === round?.id;

              return (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={busy || isCurrent}
                    onClick={() => arm({ kind: "round", round: option })}
                    className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left disabled:cursor-default ${
                      isCurrent ? "border-bronze border-l-8 bg-white/10" : "border-cream/20 active:bg-white/10"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-lg font-semibold uppercase leading-tight">
                        {option.name}
                      </span>
                      <span className="block text-sm text-cream/65">
                        {[eventTypeName(option.event_type), isCurrent ? "Current live round" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-cream/30 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-[0.12em]">
                      {ROUND_STATUS_TEXT[option.status] ?? option.status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Run actions sheet ---------------------------------------------- */}
      {runSheet && sheetRun && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setRunSheet(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-sheet-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border-t-4 border-bronze bg-ink px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
          >
            <div className="mx-auto max-w-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={label}>
                    {[
                      `Run ${sheetRun.run_order}`,
                      poolName(sheetRun.pool_label),
                      attemptText(sheetRun, round),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <h2
                    id="run-sheet-title"
                    className="mt-1 break-words font-display text-3xl font-bold uppercase leading-tight"
                  >
                    {sheetRun.rider_name}
                  </h2>
                  {runSubtitle(sheetRun) && (
                    <p className="text-cream/75">{runSubtitle(sheetRun)}</p>
                  )}
                </div>
                <ResultBadge result={sheetRun.result} status={sheetRun.status} tone="dark" size="md" />
              </div>

              {runSheet.mode === "change" && sheetRun.status === "scored" && sheetRun.result ? (
                <div className="space-y-3">
                  <p className="text-lg">
                    Recorded now: <strong>{RESULT_LABELS[sheetRun.result]} {RESULT_POINTS[sheetRun.result]}</strong>.
                    Choose the correct result:
                  </p>
                  {RUN_RESULTS.map((result) => (
                    <button
                      key={result}
                      type="button"
                      disabled={busy || result === sheetRun.result}
                      onClick={() => {
                        setRunSheet(null);
                        arm({ kind: "score", run: sheetRun, result, override: true, fromMain: false });
                      }}
                      className={`flex min-h-16 w-full items-center justify-between rounded-2xl px-5 font-display text-2xl font-bold uppercase disabled:opacity-35 ${RESULT_BUTTON[result]}`}
                    >
                      <span className="flex items-center gap-3">
                        <ResultMark result={result} className="h-5 w-5" />
                        {RESULT_LABELS[result]}
                        {result === sheetRun.result ? " (recorded)" : ""}
                      </span>
                      <span className="tabular-nums">{RESULT_POINTS[result]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2">
                  {sheetRun.id !== currentRun?.id && sheetRun.status === "pending" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void perform({ kind: "current", run: sheetRun })}
                      className={primaryButton}
                    >
                      Put on course
                    </button>
                  )}
                  {sheetRun.status === "scored" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRunSheet({ runId: sheetRun.id, mode: "change" })}
                        className={primaryButton}
                      >
                        Change result
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRunSheet(null);
                          arm({ kind: "clear", run: sheetRun, returnToRun: false });
                        }}
                        className={secondaryButton}
                      >
                        Clear result
                      </button>
                    </>
                  )}
                  {(sheetRun.status === "pending" || sheetRun.status === "on_course") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRunSheet(null);
                        arm({ kind: "void", run: sheetRun });
                      }}
                      className={secondaryButton}
                    >
                      Skip run
                    </button>
                  )}
                  {alreadyQualified(sheetRun) && (
                    <p className="rounded-xl bg-white/10 px-4 py-3 text-base">
                      {ALREADY_QUALIFIED_NOTE}. The rider carried earlier in this round.
                    </p>
                  )}
                  {sheetRun.status === "void" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRunSheet(null);
                        arm({ kind: "restore", run: sheetRun });
                      }}
                      className={primaryButton}
                    >
                      Restore run
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                autoFocus
                onClick={() => setRunSheet(null)}
                className={`${secondaryButton} w-full`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm bar ---------------------------------------------------- */}
      {visiblePending && confirmCopy && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="confirm-question"
          className="fixed inset-x-0 bottom-0 z-[60] border-t-4 border-bronze bg-cream px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-ink shadow-[0_-12px_32px_rgba(0,0,0,0.45)]"
        >
          <div className="mx-auto max-w-xl">
            <p id="confirm-question" className="text-xl font-semibold leading-snug">
              {confirmCopy.question}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => setPending(null)}
                className="min-h-16 rounded-xl border-2 border-ink/50 font-display text-lg font-semibold uppercase tracking-[0.1em] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void perform(visiblePending)}
                className={`min-h-16 rounded-xl px-2 font-display text-lg font-bold uppercase tracking-[0.06em] disabled:opacity-60 ${
                  confirmCopy.result ? CONFIRM_BUTTON[confirmCopy.result] : "bg-bronze-deep text-cream"
                }`}
              >
                {busy ? "Saving…" : confirmCopy.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts --------------------------------------------------------- */}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border-2 px-4 py-3 shadow-lg ${
              toast.tone === "error"
                ? "border-red-300 bg-red-900 text-cream"
                : "border-emerald-300 bg-emerald-900 text-cream"
            }`}
          >
            <p className="flex-1 pt-2 text-lg leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="min-h-11 shrink-0 rounded-lg border border-cream/40 px-3 font-display text-sm font-semibold uppercase tracking-[0.1em]"
            >
              OK
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
