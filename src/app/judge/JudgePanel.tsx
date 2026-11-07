"use client";

/* The judges' panel ("Live Scoring 6e", screen 7a): a laptop at the track,
   or a phone, in bright sun. Pick Carried 4 / Struck 2 / Miss 0, then
   Confirm — two taps per result, big targets, high contrast, nothing that
   depends on hover. Every write's response carries the fresh start list,
   which is applied at once — the panel never waits on realtime to show its
   own action. Below 1024px the two columns stack into one.

   Kept simple for judges who are not at home with technology: score, Skip
   (the rider waits in the Skipped box until "Ride now"), Take out (an injured
   horse, a disqualification; "Bring back" undoes it), Undo last and Call next
   pool. Rounds, the full start list and what the screens show belong to the
   person in control on /admin/scoring. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  carriedEntrantKeys,
  normalizeJudgeState,
  poolName,
} from "@/components/scoring/format";
import {
  LEDGER_ROOT,
  PoolList,
  RoundChips,
  StatusBar,
  TopStrip,
} from "@/components/scoring/ledger/Ledger";
import {
  blockPosition,
  isOpenRun,
  nextPoolBlock,
  poolSummaries,
  ridingPoolBlock,
  roundChips,
} from "@/lib/scoring/blocks";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  RUN_RESULTS,
  type JudgeState,
  type RunResult,
  type ScoringRun,
} from "@/lib/scoring/types";
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
type Saved = { name: string; result: RunResult; at: number };

/* The big number on each result card (the design's colours). */
const RESULT_NUMBER: Record<RunResult, string> = {
  carry: "text-[var(--ledger-carry)]",
  strike: "text-[var(--ledger-ink)]",
  miss: "text-[var(--ledger-miss)]",
};

const SAVED_FOR_MS = 5000;

const label = "mono text-[11px] uppercase text-[var(--ledger-muted)]";
const secondaryButton =
  "mono min-h-12 border-2 border-[var(--ledger-ink)] bg-transparent px-4 text-[13px] font-semibold uppercase text-[var(--ledger-ink)] active:bg-[var(--ledger-pick)] disabled:opacity-40";
const primaryButton =
  "min-h-14 w-full bg-[var(--ledger-ink)] px-4 text-[19px] font-bold uppercase text-[var(--ledger-paper)] active:opacity-90 disabled:opacity-40";

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

/* 14:31:52 in the browser's time zone. */
const clockTime = (iso: string | null) => {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toTimeString().slice(0, 8);
};

/* One labelled cell of the facts row under the rider's name. */
function FactCell({ term, value, first = false }: { term: string; value: string; first?: boolean }) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 px-3.5 py-[9px] ${
        first ? "" : "border-l border-[var(--ledger-rule)]"
      }`}
    >
      <span className={label}>{term}</span>
      <span className="truncate text-[21px] font-semibold">{value}</span>
    </div>
  );
}

/* `sample`: training mode (/judge/demo). Every read and write goes to a
   practice session on the server (?sample=1) instead of the database, and a
   banner says so: "shared" on a SCORING_SAMPLE_MODE=1 laptop, "personal" for
   a signed-in staff member on the live site. The server decides which
   session a request gets; this only chooses the words. */
export default function JudgePanel({ sample }: { sample?: TrainingScope }) {
  const training = sample !== undefined;
  const stateUrl = training ? withTrainingFlag(JUDGE_STATE_URL) : JUDGE_STATE_URL;
  const { data, error, connection, refetch, setData } =
    useLiveState<JudgeState>(stateUrl);
  const state = useMemo(() => normalizeJudgeState(data), [data]);

  const [pending, setPending] = useState<JudgeAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /* The result picked on the 4 / 2 / 0 cards, waiting for Confirm. */
  const [selected, setSelected] = useState<RunResult | null>(null);
  /* "Change" in the log: the run whose result the cards now change. */
  const [editRunId, setEditRunId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
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
  const carried = useMemo(() => carriedEntrantKeys(runs, round), [runs, round]);
  const nextRider = state?.up_next.find((run) => run.id !== currentRun?.id) ?? null;

  /* Round 1 / 2 / 3 (riders with more than one attempt). */
  const manyAttempts = (round?.attempts_per_rider ?? 1) > 1;
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
    () => new Map((state?.leaderboard ?? []).map((row) => [row.entrant_key, row.advanced])),
    [state]
  );
  const poolRows = useMemo(
    () => poolSummaries(runs, advanced, calledPool, currentRunId),
    [runs, advanced, calledPool, currentRunId]
  );
  const roundComplete = runs.length > 0 && !runs.some(isOpenRun);

  /* The Out box: riders a judge took out ("Bring back" undoes it). The
     database records Take out as an override to Out and skips the rides
     still to come; an administrator's own Mark Out does not show here. */
  const takenOut = useMemo(() => {
    const keys = new Set<string>();

    for (const row of state?.leaderboard ?? []) {
      if (
        row.advanced === false &&
        row.advanced_overridden &&
        !carried.has(row.entrant_key) &&
        runs.some((run) => run.entrant_key === row.entrant_key && run.status === "void")
      ) {
        keys.add(row.entrant_key);
      }
    }

    return keys;
  }, [state, runs, carried]);
  const outRows = (state?.leaderboard ?? []).filter((row) => takenOut.has(row.entrant_key));

  /* The Skipped box: rides skipped on this panel, and rides still to come
     that the riding has already passed (a rider brought back, or put back on
     the list). Not the attempts a carry made unnecessary, nor a taken-out
     rider's. */
  const lastRidden = Math.max(0, ...runs.filter((run) => run.status === "scored").map((run) => run.run_order));
  const passedOrder = currentRun ? currentRun.run_order : lastRidden;
  const skippedRuns = runs.filter(
    (run) =>
      run.id !== currentRun?.id &&
      !takenOut.has(run.entrant_key) &&
      ((run.status === "void" && !carried.has(run.entrant_key)) ||
        (run.status === "pending" && run.run_order < passedOrder))
  );

  /* The run the result cards act on: the one being changed from the log, or
     the rider on course. */
  const editRun = editRunId ? (runs.find((run) => run.id === editRunId) ?? null) : null;
  const targetRun = editRun ?? currentRun;
  const editing = editRun !== null;

  /* A result picked for one rider is dropped if someone else comes on course
     (another judge, an administrator). */
  const [pickedFor, setPickedFor] = useState<string | null>(null);
  const shownSelected = selected && pickedFor === targetRun?.id ? selected : null;

  /* Who Take out applies to: the rider, or their team in a Section round. */
  const entrantName = (run: ScoringRun) =>
    run.entrant_key.startsWith("team:") ? (run.team_name ?? run.rider_name) : run.rider_name;

  const roundText = (attempt: number | null | undefined) =>
    manyAttempts && attempt ? `Round ${attempt}` : null;

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

  /* "Saved · Name · Carried 4" fades after a few seconds. */
  useEffect(() => {
    if (!saved) {
      return;
    }

    const timer = window.setTimeout(() => setSaved(null), SAVED_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

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
      setSelected(null);
      setEditRunId(null);

      if (action.kind === "score") {
        // The message line under the cards says it; no toast over the panel.
        setSaved({ name: action.run.rider_name, result: action.result, at: Date.now() });
      } else {
        pushToast("success", successMessage(action));
      }
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

  const pick = (result: RunResult) => {
    if (!busyRef.current && targetRun) {
      setSelected(result);
      setPickedFor(targetRun.id);
      setSaved(null);
    }
  };

  const cancelPick = () => {
    setSelected(null);
    setEditRunId(null);
  };

  const confirmPick = () => {
    if (!shownSelected || !targetRun) {
      return;
    }

    void perform({
      kind: "score",
      run: targetRun,
      result: shownSelected,
      override: targetRun.status === "scored",
      fromMain: !editing,
    });
  };

  /* Escape closes the topmost layer (keyboards on tablets and laptops). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (pending) {
        setPending(null);
      } else if (selected || editRunId) {
        setSelected(null);
        setEditRunId(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, selected, editRunId]);

  /* Keep the screen awake while the panel is open (where supported). */
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

  const confirmCopy = pending ? describeAction(pending) : null;

  const whereText =
    [
      round?.name,
      roundText(currentRun?.attempt_number ?? riding?.attempt),
      poolName(currentRun?.pool_label ?? calledPool),
    ]
      .filter(Boolean)
      .join(" · ") || "No live round";

  /* "3 / 10": the run's place among its pool's rides in this round. */
  const runInPool = (run: ScoringRun) => {
    const { index, size } = blockPosition(runs, run);
    return `${index} / ${size}`;
  };

  /* The facts row: Horse | Pool | Run | Round (or the team's rider). */
  const facts = (run: ScoringRun) => {
    const teamRuns = run.team_id
      ? runs.filter(
          (other) => other.entrant_key === run.entrant_key && other.attempt_number === run.attempt_number
        )
      : [];
    const teamIndex = teamRuns.findIndex((other) => other.id === run.id);
    const last: [string, string] = manyAttempts
      ? ["Round", `${run.attempt_number} of ${round?.attempts_per_rider ?? 1}`]
      : run.team_id
        ? ["Team", [run.team_name, teamIndex >= 0 ? `rider ${teamIndex + 1} of ${teamRuns.length}` : null].filter(Boolean).join(" · ")]
        : ["Round", round?.name ?? "—"];

    return (
      <div className="grid grid-cols-2 border-y border-[var(--ledger-rule)] bg-[var(--ledger-panel)] sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <FactCell term="Horse" value={run.horse_name ?? "—"} first />
        <FactCell term="Pool" value={run.pool_label ?? "—"} />
        <FactCell term="Rider" value={runInPool(run)} />
        <FactCell term={last[0]} value={last[1] || "—"} />
      </div>
    );
  };

  let main: React.ReactNode;

  if (!state) {
    main = error ? (
      <div className="space-y-4 border-[3px] border-[var(--ledger-red)] bg-[var(--ledger-panel)] p-5">
        <p className="text-xl">{error}</p>
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
      <p className="mono py-16 text-center text-[13px] uppercase text-[var(--ledger-muted)]">Loading the start list…</p>
    );
  } else if (!state.configured) {
    main = (
      <div className="border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] p-6 text-center">
        <p className="text-[30px] font-bold uppercase">Live scoring is not set up yet</p>
        <p className="mt-3 text-[var(--ledger-muted)]">
          An administrator needs to apply the scoring setup. This panel will update by itself.
        </p>
      </div>
    );
  } else if (!round) {
    main = (
      <div className="space-y-4 border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] p-6 text-center">
        <p className="text-[30px] font-bold uppercase">No live round</p>
        <p className="text-[var(--ledger-muted)]">
          The person in control makes a round live. This panel will update by itself.
        </p>
      </div>
    );
  } else {
    const overrideMode = targetRun?.status === "scored";
    const resultsDisabled = busy || !targetRun || targetRun.status === "void";
    const message = saved
      ? `Saved · ${saved.name.split(" ")[0]} · ${RESULT_LABELS[saved.result]} ${RESULT_POINTS[saved.result]}`
      : shownSelected
        ? `${RESULT_LABELS[shownSelected]} ${RESULT_POINTS[shownSelected]} selected`
        : overrideMode && targetRun?.result
          ? `Recorded: ${RESULT_LABELS[targetRun.result]} ${RESULT_POINTS[targetRun.result]} — pick a result to change it`
          : "";

    main = (
      <>
        {error && (
          <p className="border-2 border-[var(--ledger-red)] bg-[var(--ledger-panel)] px-4 py-2 text-[var(--ledger-red)]">
            {error}
          </p>
        )}

        {/* Rider on course ------------------------------------------- */}
        <section aria-labelledby="current-rider-name" className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="mono text-[13px] uppercase text-[var(--ledger-bronze)]">
              {editing && editRun?.result
                ? `Changing result · was ${RESULT_LABELS[editRun.result]} ${RESULT_POINTS[editRun.result]}`
                : targetRun?.status === "void"
                  ? "Skipped"
                  : targetRun
                    ? "● On course"
                    : "Nobody on course"}
            </span>
            {editing && (
              <button
                type="button"
                onClick={cancelPick}
                className="mono h-7 border border-[var(--ledger-bronze)] bg-transparent px-2.5 text-[11px] uppercase text-[var(--ledger-bronze)]"
              >
                Back to rider on course
              </button>
            )}
          </div>
          <h1
            id="current-rider-name"
            className="break-words text-[52px] font-bold uppercase leading-[0.95] tracking-[-0.02em] sm:text-[68px] xl:text-[84px]"
          >
            {targetRun ? targetRun.rider_name : roundComplete ? round.name : "Waiting for a rider"}
          </h1>
        </section>

        {targetRun && facts(targetRun)}

        {/* Result cards ---------------------------------------------- */}
        {targetRun ? (
          <>
            <section
              aria-label="Record a result"
              className="grid grid-cols-3 border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)]"
            >
              {RUN_RESULTS.map((result, index) => {
                const armed = shownSelected === result;
                const sameAsRecorded = overrideMode && targetRun.result === result;

                return (
                  <button
                    key={result}
                    type="button"
                    disabled={resultsDisabled || sameAsRecorded}
                    aria-pressed={armed}
                    onClick={() => pick(result)}
                    className={`flex h-[124px] flex-col items-start justify-between gap-2 px-3 py-3 text-left text-[var(--ledger-ink)] disabled:cursor-not-allowed sm:h-[168px] sm:px-5 sm:py-4 xl:flex-row xl:items-end ${
                      index < 2 ? "border-r-[3px] border-[var(--ledger-rule)]" : ""
                    } ${armed ? "bg-[var(--ledger-pick)]" : "bg-transparent"} ${
                      (shownSelected && !armed) || resultsDisabled || sameAsRecorded ? "opacity-40" : ""
                    }`}
                  >
                    <span className={`text-[84px] font-bold leading-[0.8] sm:text-[124px] ${RESULT_NUMBER[result]}`}>
                      {RESULT_POINTS[result]}
                      <span className="sr-only"> points</span>
                    </span>
                    <span className="text-[18px] font-bold uppercase sm:text-[26px]">
                      {RESULT_LABELS[result]}
                      {sameAsRecorded ? <span className="sr-only"> (recorded)</span> : null}
                    </span>
                  </button>
                );
              })}
            </section>

            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 xl:grid-cols-[auto_minmax(0,1fr)_180px_240px]">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || editing || targetRun.status !== "on_course"}
                  onClick={() => arm({ kind: "void", run: targetRun })}
                  className="mono h-[52px] whitespace-nowrap border border-[var(--ledger-ink)] bg-transparent px-[18px] text-[13px] uppercase disabled:opacity-35"
                >
                  Skip
                </button>
                <button
                  type="button"
                  disabled={busy || editing || targetRun.status !== "on_course" || carried.has(targetRun.entrant_key)}
                  onClick={() =>
                    arm({
                      kind: "take_out",
                      roundId: round.id,
                      entrantKey: targetRun.entrant_key,
                      name: entrantName(targetRun),
                      out: true,
                    })
                  }
                  className="mono h-[52px] whitespace-nowrap border border-[var(--ledger-red)] bg-transparent px-[18px] text-[13px] uppercase text-[var(--ledger-red)] disabled:opacity-35"
                >
                  Take out
                </button>
              </div>
              <span
                role="status"
                className={`mono order-last col-span-full min-h-5 text-[13px] xl:order-none xl:col-span-1 ${saved ? "text-[var(--ledger-green)]" : "text-[var(--ledger-muted)]"}`}
              >
                {message}
              </span>
              <button
                type="button"
                disabled={busy || (!shownSelected && !editing)}
                onClick={cancelPick}
                className="h-14 border-2 border-[var(--ledger-ink)] bg-transparent text-[19px] font-bold uppercase disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !shownSelected}
                onClick={confirmPick}
                className="h-14 bg-[var(--ledger-ink)] text-[19px] font-bold uppercase text-[var(--ledger-paper)] disabled:opacity-40"
              >
                {busy && shownSelected ? "Saving…" : "Confirm"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] p-6 text-center">
            {roundComplete ? (
              <p className="text-[30px] font-bold uppercase">{round.name} complete</p>
            ) : nextRider ? (
              <>
                <p className="text-[var(--ledger-muted)]">Next waiting: {nextRider.rider_name}.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void perform({ kind: "current", run: nextRider })}
                  className={`${primaryButton} max-w-md`}
                >
                  Put {nextRider.rider_name} on course
                </button>
              </>
            ) : (
              <p className="text-[var(--ledger-muted)]">
                {runs.length === 0
                  ? "No start list has been drawn for this round yet."
                  : "No riders are waiting in this round."}
              </p>
            )}
          </div>
        )}

        {/* Skipped and Out ------------------------------------------- */}
        {(skippedRuns.length > 0 || outRows.length > 0) && (
          <div className="grid items-start gap-3 sm:grid-cols-2">
            {skippedRuns.length > 0 && (
              <section aria-labelledby="skipped-title" className="border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] p-3">
                <h2 id="skipped-title" className="text-[20px] font-bold uppercase">
                  Skipped
                </h2>
                <ul>
                  {skippedRuns.map((run) => (
                    <li
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--ledger-hair)] py-1.5 last:border-b-0"
                    >
                      <span className="min-w-[9rem] flex-1">
                        <span className="block truncate text-[18px] font-semibold">{run.rider_name}</span>
                        <span className="mono block text-[11px] uppercase text-[var(--ledger-muted)]">
                          {[poolName(run.pool_label), manyAttempts ? `Round ${run.attempt_number}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy || carried.has(run.entrant_key)}
                          onClick={() =>
                            arm({
                              kind: "take_out",
                              roundId: round.id,
                              entrantKey: run.entrant_key,
                              name: run.rider_name,
                              out: true,
                            })
                          }
                          className="h-11 border-2 border-[var(--ledger-red)] bg-transparent px-3 text-[15px] font-bold uppercase text-[var(--ledger-red)] disabled:opacity-40"
                        >
                          Take out
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => arm({ kind: "ride_now", run })}
                          className="h-11 bg-[var(--ledger-ink)] px-4 text-[15px] font-bold uppercase text-[var(--ledger-paper)] disabled:opacity-40"
                        >
                          Ride now
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {outRows.length > 0 && (
              <section aria-labelledby="out-title" className="border-[3px] border-[var(--ledger-red)] bg-[var(--ledger-panel)] p-3">
                <h2 id="out-title" className="text-[20px] font-bold uppercase text-[var(--ledger-red)]">
                  Out
                </h2>
                <ul>
                  {outRows.map((row) => (
                    <li
                      key={row.entrant_key}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--ledger-hair)] py-1.5 last:border-b-0"
                    >
                      <span className="min-w-[9rem] flex-1">
                        <span className="block truncate text-[18px] font-semibold">{row.name}</span>
                        <span className="mono block text-[11px] uppercase text-[var(--ledger-muted)]">
                          {poolName(row.pool_label)}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          arm({
                            kind: "take_out",
                            roundId: round.id,
                            entrantKey: row.entrant_key,
                            name: row.name,
                            out: false,
                          })
                        }
                        className="h-11 shrink-0 border-2 border-[var(--ledger-ink)] bg-transparent px-4 text-[15px] font-bold uppercase disabled:opacity-40"
                      >
                        Bring back
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* Log ------------------------------------------------------- */}
        <section aria-labelledby="log-title" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b-[3px] border-[var(--ledger-rule)] pb-1.5">
            <h2 id="log-title" className="text-[20px] font-bold uppercase">
              Log
            </h2>
            <button
              type="button"
              disabled={busy || !lastScored}
              onClick={() => lastScored && arm({ kind: "clear", run: lastScored, returnToRun: true })}
              className="mono h-8 border border-[var(--ledger-ink)] bg-transparent px-3.5 text-[12px] uppercase disabled:opacity-35"
            >
              Undo last
            </button>
          </div>
          {state.recent_results.length === 0 && (
            <p className="mono px-1 py-2 text-[13px] text-[var(--ledger-muted)]">No results yet in this round.</p>
          )}
          {state.recent_results.slice(0, 4).map((run) => (
            <div
              key={run.id}
              className={`mono grid grid-cols-[60px_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 border-b border-[var(--ledger-hair)] px-1 py-1.5 text-[13px] sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,110px)_minmax(0,120px)_76px] xl:grid-cols-[84px_minmax(0,1fr)_120px_140px_90px] ${
                editRunId === run.id ? "bg-[var(--ledger-hl)]" : ""
              }`}
            >
              <span className="text-[var(--ledger-muted)]">{clockTime(run.scored_at)}</span>
              <span className="truncate font-[family-name:var(--font-plex-condensed)] text-[17px] font-semibold">
                {run.rider_name}
              </span>
              <span className="hidden text-[var(--ledger-muted)] sm:inline">
                {[poolName(run.pool_label), manyAttempts ? `R${run.attempt_number}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className={`font-semibold ${run.result ? RESULT_NUMBER[run.result] : ""}`}>
                {run.result ? `${RESULT_LABELS[run.result]} ${RESULT_POINTS[run.result]}` : ""}
              </span>
              <button
                type="button"
                disabled={busy || run.status !== "scored"}
                onClick={() => {
                  setEditRunId(run.id);
                  setSelected(null);
                }}
                className="h-7 border border-[var(--ledger-rule)] bg-transparent px-2 text-[12px] uppercase disabled:opacity-35"
              >
                Change
              </button>
            </div>
          ))}
        </section>
      </>
    );
  }

  /* Right column: pools, call, next rider, all pools --------------------- */
  const side = state?.configured && round && (
    <>
      {pools.length > 0 && (
        <>
          <div className="grid grid-cols-2 border-t-[3px] border-[var(--ledger-rule)] pt-2.5">
            <div className="flex flex-col">
              <span className={label}>
                {["Riding now", roundText(riding?.attempt)].filter(Boolean).join(" · ")}
              </span>
              <span className="text-[46px] font-bold leading-none text-[var(--ledger-bronze)]">
                {riding && currentRun ? `Pool ${riding.pool}` : "—"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className={label}>{["Next", roundText(nextBlock?.attempt)].filter(Boolean).join(" · ")}</span>
              <span className="text-[46px] font-bold leading-none">
                {nextBlock ? `Pool ${nextBlock.pool}` : "None"}
              </span>
            </div>
          </div>

          <RoundChips chips={chips} />

          <button
            type="button"
            disabled={busy || !nextBlock}
            onClick={() =>
              nextBlock &&
              arm({
                kind: "call",
                roundId: round.id,
                pool: nextBlock.pool,
                attempt: manyAttempts ? nextBlock.attempt : null,
              })
            }
            className="min-h-[50px] bg-[var(--ledger-ink)] px-[18px] text-left text-[17px] font-bold uppercase text-[var(--ledger-paper)] active:opacity-90 disabled:opacity-40"
          >
            {nextBlock
              ? `Call next pool → ${[roundText(nextBlock.attempt), `Pool ${nextBlock.pool}`].filter(Boolean).join(" · ")}`
              : "No more pools"}
          </button>

        </>
      )}

      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--ledger-rule)] pb-2">
        <span className={label}>Next rider</span>
        <span className="truncate text-[19px] font-bold">{nextRider?.rider_name ?? "—"}</span>
      </div>

      {poolRows.length > 0 && (
        <>
          <h2 className="border-t-[3px] border-[var(--ledger-rule)] pt-2 text-[20px] font-bold uppercase">
            All pools
          </h2>
          <PoolList pools={poolRows} rounds={manyAttempts} />
        </>
      )}
    </>
  );

  return (
    <div className={`${LEDGER_ROOT} flex min-h-dvh flex-col lg:h-dvh`}>
      {sample && (
        <div
          role="note"
          aria-label="Training mode"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-[#f2b07a] px-4 py-2 text-[var(--ledger-ink)] lg:px-9"
        >
          <p className="min-w-0 flex-1 text-[14px]">
            <span className="mono mr-3 font-semibold uppercase">{TRAINING_LABEL}</span>
            {TRAINING_BANNER[sample]}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => arm({ kind: "reset", scope: sample })}
            className="mono h-9 border-2 border-[var(--ledger-ink)] bg-transparent px-3 text-[12px] font-semibold uppercase disabled:opacity-40"
          >
            Reset training data
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <main className="flex min-w-0 flex-col gap-4 px-4 py-5 lg:overflow-y-auto lg:border-r-[3px] lg:border-[var(--ledger-rule)] lg:px-9 lg:py-6">
          <TopStrip who="Judge" where={whereText} />
          {main}
        </main>

        <aside className="flex min-w-0 flex-col gap-3.5 border-t-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-side)] px-4 py-5 lg:overflow-y-auto lg:border-t-0 lg:px-7 lg:py-6">
          {side}
          {/* Practise from home before event day; back again afterwards. */}
          <p className="mt-auto pt-4">
            <Link
              href={training ? "/judge" : "/judge/demo"}
              className="mono inline-flex min-h-11 items-center text-[12px] uppercase text-[var(--ledger-muted)] underline underline-offset-4"
            >
              {training ? "Leave practice — open the live panel" : "Practise on sample riders"}
            </Link>
          </p>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20">
        <StatusBar
          role="Judge"
          items={[
            round?.name,
            poolName(currentRun?.pool_label ?? null),
            currentRun ? `Rider ${runInPool(currentRun)}` : null,
            manyAttempts && currentRun
              ? `Round ${currentRun.attempt_number} of ${round?.attempts_per_rider}`
              : null,
          ]}
          connection={connection}
          offlineNote="results not saving"
        />
      </div>

      {/* Confirm bar: undo, skip, call, round … ------------------------- */}
      {pending && confirmCopy && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="confirm-question"
          className="fixed inset-x-0 bottom-0 z-[60] border-t-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_32px_rgba(46,29,14,0.25)]"
        >
          <div className="mx-auto max-w-2xl">
            <p id="confirm-question" className="text-[21px] font-semibold leading-snug">
              {confirmCopy.question}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => setPending(null)}
                className="h-14 border-2 border-[var(--ledger-ink)] bg-transparent text-[19px] font-bold uppercase disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void perform(pending)}
                className="h-14 bg-[var(--ledger-ink)] px-2 text-[19px] font-bold uppercase text-[var(--ledger-paper)] disabled:opacity-60"
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
            className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 border-2 px-4 py-3 shadow-lg ${
              toast.tone === "error"
                ? "border-[var(--ledger-red)] bg-[var(--ledger-red)] text-[var(--ledger-paper)]"
                : "border-[var(--ledger-green)] bg-[var(--ledger-green)] text-[var(--ledger-paper)]"
            }`}
          >
            <p className="flex-1 pt-1.5 text-lg leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="mono min-h-10 shrink-0 border border-current px-3 text-[12px] uppercase"
            >
              OK
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
