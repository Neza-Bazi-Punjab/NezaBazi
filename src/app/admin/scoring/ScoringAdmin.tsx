"use client";

/* /admin/scoring: everything an administrator does to run the competition
   that is not a judge's tap at the track — create and edit rounds, draw the
   start list into pools, add late entrants, move riders between positions and
   pools, call a pool, set the live round, override who goes through, record
   the podium and print the pool sheet for the notice board.

   Every action goes through an /api/admin/scoring route (or, for "Set live"
   and "Call Pool", the judges' routes an administrator may also use) and every
   write returns the fresh payload, so the panel never guesses. Every action
   that removes or replaces something asks first and says what will happen. */
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DISPLAY_MODE_CHOICES } from "@/components/scoring/format";
import type {
  AdminScoringState,
  AdvanceOverrideRow,
} from "@/lib/scoring/admin-types";
import {
  RESULT_LABELS,
  balancedPoolSizes,
  poolLabelForIndex,
  type DisplayMode,
  type EventType,
  type LeaderboardRow,
  type RoundStatus,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import { plural } from "@/lib/scoring/format";
import { matchRank } from "@/lib/check-in-search";
import {
  qualifyingPreview,
  teamsPreview,
  startButtonLabel,
  startConfirmDetail,
  toNextStep,
  type NextRoundPlan,
  type EngineEvent,
  type NextStep,
} from "@/lib/scoring/next-round";
import {
  firstOpenAttempt,
  parseMovePosition,
  startedPoolLabels,
} from "@/lib/scoring/pool-builder";
import { startListMatcher } from "@/lib/scoring/start-list-search";
import PoolBuilder from "./PoolBuilder";
import PoolSheet from "./PoolSheet";
import {
  groupStartList,
  poolIndex,
  smallestPool,
  type EntrantSummary,
} from "./start-list";

/* Shared classes — the admin dashboard's visual language. */
const primaryButton =
  "rounded-lg bg-bronze-deep px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60";
const dangerButton =
  "rounded-lg border border-red-700/40 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-red-800 transition-colors hover:bg-red-50 disabled:opacity-60";
const inputClass =
  "mt-1 w-full rounded-lg border border-bronze/20 bg-cream px-3 py-2 text-brown focus:border-bronze focus:outline-none disabled:opacity-60";
const labelClass =
  "font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink";
const cardClass = "rounded-lg border border-bronze/20 bg-sand p-4 sm:p-5";

/* The addresses that follow the shared demo (?sample=demo): the four vMix
   feeds, the public scoreboard and the stream overlays. */
const DEMO_FEED_ADDRESSES = [
  "/api/live/vmix/current?sample=demo",
  "/api/live/vmix/leaderboard?sample=demo",
  "/api/live/vmix/entrants?sample=demo",
  "/api/live/vmix/rounds?sample=demo",
  "/live?sample=demo",
  "/overlay/scorebug?sample=demo",
  "/overlay/lower-third?sample=demo",
  "/overlay/leaderboard?sample=demo",
  "/overlay/pool-call?sample=demo",
  "/overlay/ticker?sample=demo",
] as const;
const headingClass =
  "font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark";
const subheadingClass =
  "font-display text-lg font-bold uppercase tracking-wide text-bronze-dark";

const EVENT_LABELS: Record<EventType, string> = {
  single: "Single",
  section: "Section",
};

const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  upcoming: "Upcoming",
  live: "Live",
  complete: "Complete",
};

const RUN_STATUS_LABELS: Record<ScoringRun["status"], string> = {
  pending: "Waiting",
  on_course: "On course",
  scored: "Scored",
  void: "Skipped",
};

/* API ------------------------------------------------------------------------- */

type ApiResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

const callApi = async (
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<ApiResult> => {
  try {
    const response = await fetch(url, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let parsed: unknown = null;

    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    const record =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    if (!response.ok) {
      return {
        ok: false,
        error:
          typeof record.error === "string"
            ? record.error
            : "Something went wrong. Please try again.",
      };
    }

    return { ok: true, body: record };
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check the connection and retry.",
    };
  }
};

const isAdminState = (value: unknown): value is AdminScoringState =>
  value !== null &&
  typeof value === "object" &&
  "configured" in value &&
  "rounds" in value &&
  Array.isArray((value as { rounds: unknown }).rounds);

/* The demo switch as GET / POST /api/admin/scoring/demo-switch return it. */
type DemoSwitchState = { demo_closed: boolean; changed_at: string | null };

const toDemoSwitch = (value: unknown): DemoSwitchState | null =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as { demo_closed?: unknown }).demo_closed === "boolean"
    ? {
        demo_closed: (value as { demo_closed: boolean }).demo_closed,
        changed_at:
          typeof (value as { changed_at?: unknown }).changed_at === "string"
            ? (value as { changed_at: string }).changed_at
            : null,
      }
    : null;

/* Confirmation bar --------------------------------------------------------------- */

type Confirmation = {
  title: string;
  detail: string;
  confirmLabel: string;
  danger: boolean;
  run: () => Promise<void>;
};

function ConfirmBar({
  confirmation,
  busy,
  onCancel,
}: {
  confirmation: Confirmation;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="scoring-confirm-title"
      aria-describedby="scoring-confirm-detail"
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-bronze bg-cream px-4 py-4 shadow-[0_-8px_24px_rgba(46,29,14,0.18)] sm:px-6 print:hidden"
    >
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p id="scoring-confirm-title" className="font-display text-base font-bold uppercase tracking-wide text-ink">
            {confirmation.title}
          </p>
          <p id="scoring-confirm-detail" className="mt-1 max-w-3xl text-sm leading-6 text-brown/85">
            {confirmation.detail}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void confirmation.run()}
            disabled={busy}
            className={
              confirmation.danger
                ? "rounded-lg bg-red-800 px-5 py-3 font-display text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                : `${primaryButton} px-5 py-3`
            }
          >
            {busy ? "Working…" : confirmation.confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`${secondaryButton} px-5 py-3`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* Round form ----------------------------------------------------------------------- */

type RoundFormValues = {
  name: string;
  event_type: EventType;
  round_number: string;
  attempts_per_rider: string;
  target_points: string;
  pool_size: string;
  sort_order: string;
  status: RoundStatus;
};

const toFormValues = (round: ScoringRound): RoundFormValues => ({
  name: round.name,
  event_type: round.event_type,
  round_number: String(round.round_number),
  attempts_per_rider: String(round.attempts_per_rider),
  target_points: round.target_points === null ? "" : String(round.target_points),
  pool_size: round.pool_size === null ? "" : String(round.pool_size),
  sort_order: String(round.sort_order),
  status: round.status,
});

const parseWhole = (value: string) => {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

const parseOptionalWhole = (value: string) =>
  value.trim() === "" ? null : parseWhole(value);

function RoundForm({
  title,
  initial,
  isCreate,
  structureLocked,
  busy,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: RoundFormValues;
  isCreate: boolean;
  structureLocked: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const update = <K extends keyof RoundFormValues>(key: K, value: RoundFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const payload: Record<string, unknown> = {
      name: values.name.trim(),
      round_number: parseWhole(values.round_number),
      target_points: parseOptionalWhole(values.target_points),
      sort_order: parseWhole(values.sort_order),
    };

    if (!structureLocked) {
      payload.event_type = values.event_type;
      payload.attempts_per_rider = parseWhole(values.attempts_per_rider);
      payload.pool_size = parseOptionalWhole(values.pool_size);
    }

    if (!isCreate) {
      payload.status = values.status;
    }

    const numbers = Object.values(payload).filter(
      (value): value is number => typeof value === "number"
    );

    if (payload.name === "" || numbers.some((value) => Number.isNaN(value))) {
      setFormError("Fill in a name and whole numbers for the numeric fields.");
      return;
    }

    setFormError(null);
    onSubmit(payload);
  };

  return (
    <form onSubmit={submit} className={`${cardClass} space-y-4`}>
      <h3 className={subheadingClass}>{title}</h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className={labelClass}>Name</span>
          <input
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            maxLength={80}
            placeholder="Qualification"
            className={inputClass}
            required
          />
        </label>

        <label className="block">
          <span className={labelClass}>Event</span>
          <select
            value={values.event_type}
            onChange={(event) =>
              update("event_type", event.target.value === "section" ? "section" : "single")
            }
            disabled={structureLocked}
            className={inputClass}
          >
            <option value="single">Single Tent Pegging</option>
            <option value="section">Section Tent Pegging</option>
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Round number</span>
          <input
            inputMode="numeric"
            value={values.round_number}
            onChange={(event) => update("round_number", event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Attempts per rider</span>
          <select
            value={values.attempts_per_rider}
            onChange={(event) => update("attempts_per_rider", event.target.value)}
            disabled={structureLocked}
            className={inputClass}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Target points</span>
          <input
            inputMode="numeric"
            value={values.target_points}
            onChange={(event) => update("target_points", event.target.value)}
            placeholder="Section only"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Pool size</span>
          <input
            inputMode="numeric"
            value={values.pool_size}
            onChange={(event) => update("pool_size", event.target.value)}
            placeholder="Blank = no pools"
            disabled={structureLocked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Sort order</span>
          <input
            inputMode="numeric"
            value={values.sort_order}
            onChange={(event) => update("sort_order", event.target.value)}
            className={inputClass}
          />
        </label>

        {!isCreate && (
          <label className="block">
            <span className={labelClass}>Status</span>
            <select
              value={values.status}
              onChange={(event) =>
                update(
                  "status",
                  event.target.value === "live"
                    ? "live"
                    : event.target.value === "complete"
                      ? "complete"
                      : "upcoming"
                )
              }
              className={inputClass}
            >
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="complete">Complete</option>
            </select>
          </label>
        )}
      </div>

      <p className="text-sm leading-6 text-brown/80">
        Single qualification: round 0, three attempts. Aarhi knockouts: one attempt.
        Section targets: 8 points in round 1, 12 in round 2, 16 (Full House) from round
        3. Rounds are listed and ridden in sort order.
        {structureLocked &&
          " Event, attempts and pool size are fixed while this round has a start list — clear it to change them."}
      </p>

      {formError && <p className="text-sm text-red-700">{formError}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : isCreate ? "Create Round" : "Save Round"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* Small pieces ------------------------------------------------------------------- */

/* A round drawn from the previous round keeps that round's start order once
   the engine's database update for its event is in place (Singles:
   20261110130000, Teams: 20261110150000). Before that, and for a draw of
   every checked-in entrant, the draw is shuffled. `orderKept` says whether
   the update is in place, so the words never promise what the database will
   not do. */
const drawOrderText = (mode: "all_checked_in" | "advanced", orderKept: boolean) =>
  mode === "advanced" && orderKept ? "in the previous round's start order" : "in a random order";

/* "Move to position": type where the run should ride (within its pool and
   attempt pass) and press Enter or Go. One request, however far it moves. */
function MoveToPosition({
  run,
  first,
  last,
  disabled,
  onMove,
}: {
  run: ScoringRun;
  first: number;
  last: number;
  disabled: boolean;
  onMove: (newOrder: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseMovePosition(draft, first, last, run.run_order);

    if (!parsed.ok) {
      setProblem(parsed.error);
      return;
    }

    setProblem(null);
    setDraft("");
    onMove(parsed.value);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-1">
        <input
          type="number"
          inputMode="numeric"
          min={first}
          max={last}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          disabled={disabled}
          placeholder={`${first}–${last}`}
          aria-label={`Move ${run.rider_name} to position (${first} to ${last})`}
          className="w-20 rounded-lg border border-bronze/20 bg-cream px-2 py-1 text-sm tabular-nums text-brown focus:border-bronze focus:outline-none disabled:opacity-60"
        />
        <button type="submit" disabled={disabled || draft.trim() === ""} className={secondaryButton}>
          Go
        </button>
      </div>
      {problem && <span className="text-xs text-red-800">{problem}</span>}
    </form>
  );
}

function RunStatusChip({ run }: { run: ScoringRun }) {
  const tone =
    run.status === "on_course"
      ? "bg-bronze-deep text-cream"
      : run.status === "scored"
        ? "bg-green-100 text-green-900"
        : run.status === "void"
          ? "bg-brown/10 text-brown/60 line-through"
          : "border border-bronze/30 text-brown";

  const label =
    run.status === "scored" && run.result
      ? `${RESULT_LABELS[run.result]} ${run.points ?? 0}`
      : RUN_STATUS_LABELS[run.status];

  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.1em] ${tone}`}
    >
      {label}
    </span>
  );
}

const advancedLabel = (row: LeaderboardRow) =>
  row.advanced === true ? "Through" : row.advanced === false ? "Out" : "Undecided";

/* Main ------------------------------------------------------------------------------ */

/* Next step (Automatic mode) ---------------------------------------------------- */

/* Automatic / Manual for Single tent pegging. Automatic: Start qualifying
   when check-in is done, then one button for each next round, Undo while the
   new round is unridden. Manual: the card shrinks to the mode switch and the
   page works exactly as it does without the engine. */
function NextStepCard({
  event,
  onEvent,
  step,
  busy,
  onStartQualifying,
  onStartTeams,
  onStart,
  onUndo,
  onSwitch,
  children,
}: {
  /* Singles or Teams: each has its own Automatic / Manual switch. */
  event: EngineEvent;
  onEvent: (event: EngineEvent) => void;
  step: NextStep | null | undefined;
  busy: boolean;
  onStartQualifying: (checkedIn: number) => void;
  onStartTeams: (teams: number) => void;
  onStart: (plan: NextRoundPlan) => void;
  onUndo: (undo: NonNullable<NextStep["undo"]>) => void;
  onSwitch: (autoOn: boolean) => void;
  /* The whole Rounds section: shown in every mode. */
  children: ReactNode;
}) {
  const eventTabs = (
    <div role="tablist" aria-label="Event" className="flex gap-1 border-b border-bronze/20 print:hidden">
      {([
        ["single", "Singles"],
        ["section", "Teams"],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={event === value}
          onClick={() => onEvent(value)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
            event === value
              ? "border-bronze-deep text-ink"
              : "border-transparent text-bronze-dark hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Still loading, or the read failed: the round tools are never held back
  // by it. Set Live, the start list and the pool sheet must always be there.
  if (step === undefined) {
    return <>{children}</>;
  }

  // The engine's database update is not in place: the page is the manual
  // Scoring page, with one quiet line saying so.
  if (step === null) {
    return (
      <section aria-labelledby="next-step-heading" className="space-y-5 rounded-lg border border-bronze/20 p-4 sm:p-5">
        {eventTabs}
        <div className="space-y-2 print:hidden">
          <h2 id="next-step-heading" className={subheadingClass}>
            Rounds · Manual
          </h2>
          <p className="text-sm leading-6 text-brown/85">
            Automatic mode is not available for {event === "section" ? "Teams" : "Singles"} yet. Rounds
            work by hand below.
          </p>
        </div>
        {children}
      </section>
    );
  }

  const teams = event === "section";

  const { engine, plan, undo } = step;
  const modeSwitch = (
    <div role="group" aria-label={teams ? "Teams scoring mode" : "Singles scoring mode"} className="inline-flex shrink-0 self-start overflow-hidden rounded-lg border border-bronze/30 sm:self-auto">
      {([
        [true, "Automatic"],
        [false, "Manual"],
      ] as const).map(([value, label]) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            if (engine.auto_on !== value) {
              onSwitch(value);
            }
          }}
          disabled={busy}
          aria-pressed={engine.auto_on === value}
          className={`whitespace-nowrap px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60 ${
            engine.auto_on === value ? "bg-bronze-deep text-cream" : "text-bronze-dark hover:bg-bronze/10"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Manual tab: one panel holding the switch and the whole Rounds section.
  // Not print:hidden, so the pool sheet inside it still prints.
  if (!engine.auto_on) {
    return (
      <section aria-labelledby="next-step-heading" className="space-y-6 rounded-lg border border-bronze/20 p-4 sm:p-5">
        {eventTabs}
        <div className="flex flex-col gap-3 border-b border-bronze/15 pb-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="min-w-0">
            <h2 id="next-step-heading" className={subheadingClass}>
              {teams ? "Teams" : "Singles"} · Manual mode
            </h2>
            <p className="mt-1 text-sm leading-6 text-brown/85">
              {teams
                ? "Create, draw, move teams, overrides and the podium, all by hand. A team completing check-in does not join a round on its own."
                : "Create, draw, move riders, overrides and the podium, all by hand. Check-ins do not join pools on their own."}
            </p>
          </div>
          {modeSwitch}
        </div>
        {children}
      </section>
    );
  }

  const blocked =
    plan.state === "no_show" ||
    plan.state === "nobody_through" ||
    plan.state === "later_round" ||
    plan.state === "manual_setup";

  // Automatic: the Next step card, then every round tool under it. Set Live,
  // the start list, Take out / Skip, overrides, the podium and the pool sheet
  // are needed in Automatic mode too ("everything the engine does is an
  // ordinary round"), so they are never hidden.
  return (
    <>
    <section aria-labelledby="next-step-heading" className={`${cardClass} space-y-4 print:hidden`}>
      {eventTabs}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="next-step-heading" className={`${subheadingClass} min-w-0`}>
          Next step{plan.round_name ? ` · after ${plan.round_name}` : ""}
        </h2>
        {modeSwitch}
      </div>

      <p
        className={
          blocked
            ? "rounded-lg border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
            : "text-sm leading-6 text-brown/85"
        }
      >
        {plan.message}
      </p>

      {!teams && plan.state === "no_rounds" && step.checked_in_count === null && (
        <p className="rounded-lg border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 [overflow-wrap:anywhere]">
          Start qualifying needs one more database update: apply
          supabase/migrations/20261110140000_scoring_auto_qualifying.sql in the Supabase SQL
          editor, then reload.
        </p>
      )}

      {teams && plan.state === "no_rounds" && (
        <>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
            {teamsPreview(step.checked_in_count ?? 0)}
          </p>
          <button
            type="button"
            onClick={() => onStartTeams(step.checked_in_count ?? 0)}
            disabled={busy || !step.checked_in_count}
            className={`${primaryButton} w-full sm:w-auto`}
          >
            Start teams
          </button>
        </>
      )}

      {!teams && plan.state === "no_rounds" && step.checked_in_count !== null && (
        <>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
            {qualifyingPreview(step.checked_in_count)}
          </p>
          <button
            type="button"
            onClick={() => onStartQualifying(step.checked_in_count ?? 0)}
            disabled={busy || step.checked_in_count === 0}
            className={`${primaryButton} w-full sm:w-auto`}
          >
            Start qualifying
          </button>
        </>
      )}

      {plan.state === "ready" && (
        <>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
            {plan.through_count} of {plan.entrant_count} through → {plan.next_name}
          </p>
          <details className="text-sm text-brown/85">
            <summary className="cursor-pointer font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark">
              Who goes through, in start order
            </summary>
            <ol className="mt-2 list-decimal space-y-0.5 pl-6">
              {plan.through.map((entrant) => (
                <li key={entrant.entrant_key}>
                  {entrant.name}
                  {entrant.total !== null ? ` · ${plural(entrant.total, "point")}` : ""}
                </li>
              ))}
            </ol>
          </details>
          <button
            type="button"
            onClick={() => onStart(plan)}
            disabled={busy}
            className={`${primaryButton} w-full sm:w-auto`}
          >
            {startButtonLabel(plan)}
          </button>
        </>
      )}

      {plan.state === "riding" && plan.stage === "qualifier" && (
        <p className="text-sm leading-6 text-brown/80">
          Riders who check in now join the last pool on their own, with all three attempts.
        </p>
      )}

      {plan.state === "riding" && plan.round_name === "Teams Round 1" && (
        <p className="text-sm leading-6 text-brown/80">
          A team whose 4th rider checks in now joins the end of Round 1 on its own.
        </p>
      )}

      {undo && (
        <div className="flex flex-col gap-2 border-t border-bronze/15 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-brown/85">
            Nobody has ridden {undo.round_name} yet, so it can still be undone.
          </p>
          <button type="button" onClick={() => onUndo(undo)} disabled={busy} className={dangerButton}>
            Undo {undo.round_name}
          </button>
        </div>
      )}
    </section>
    {children}
    </>
  );
}

export default function ScoringAdmin({
  initialState,
}: {
  initialState: AdminScoringState | null;
}) {
  const [data, setData] = useState<AdminScoringState | null>(initialState);
  const [loading, setLoading] = useState(initialState === null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [roundForm, setRoundForm] = useState<"create" | "edit" | null>(null);
  /* The round whose pool builder is open (one at a time). */
  const [builderRoundId, setBuilderRoundId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<"all_checked_in" | "advanced">("all_checked_in");
  const [lateQuery, setLateQuery] = useState("");
  /* The start list's search box: rider, team, horse or pool. */
  const [startListQuery, setStartListQuery] = useState("");
  const [includeNotCheckedIn, setIncludeNotCheckedIn] = useState(false);
  const [openRunTables, setOpenRunTables] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [podiumDrafts, setPodiumDrafts] = useState<Record<string, [string, string, string]>>({});
  const [showSheet, setShowSheet] = useState(false);
  const [printRequest, setPrintRequest] = useState(0);
  /* The Screens card's message box; null while it shows the live message. */
  const [messageDraft, setMessageDraft] = useState<string | null>(null);
  /* The "Close the demo" switch: undefined while loading, null when it is not
     set up yet (the demo then counts as open). */
  const [demoSwitch, setDemoSwitch] = useState<DemoSwitchState | null | undefined>(undefined);

  /* The auto engine's next step: undefined while loading, null when the
     migration is not applied yet. */
  const [engineEvent, setEngineEvent] = useState<EngineEvent>("single");
  const [nextSteps, setNextSteps] = useState<Record<EngineEvent, NextStep | null | undefined>>({
    single: undefined,
    section: undefined,
  });

  // Read both again whenever the scoring payload changes (load, Refresh, any write).
  useEffect(() => {
    let cancelled = false;

    for (const event of ["single", "section"] as const) {
      void callApi(`/api/admin/scoring/next-round?event=${event}`, "GET").then((result) => {
        if (!cancelled) {
          setNextSteps((current) => ({
            ...current,
            // A failed read (a lost connection, an expired session) keeps
            // what the card last knew; only an answer changes it.
            [event]: result.ok ? toNextStep(result.body.step) : current[event],
          }));
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [data]);

  // The demo switch is not part of the scoring payload: read it once on load.
  useEffect(() => {
    let cancelled = false;

    void callApi("/api/admin/scoring/demo-switch", "GET").then((result) => {
      if (!cancelled) {
        setDemoSwitch(result.ok ? toDemoSwitch(result.body.demo) : null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const result = await callApi("/api/admin/scoring/rounds", "GET");

    if (result.ok && isAdminState(result.body)) {
      setData(result.body);
    } else if (!result.ok) {
      setError(result.error);
    }

    setLoading(false);
  }, []);

  // The server could not build the first payload: load it from the route.
  useEffect(() => {
    if (initialState !== null) {
      return;
    }

    let cancelled = false;

    void callApi("/api/admin/scoring/rounds", "GET").then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok && isAdminState(result.body)) {
        setData(result.body);
      } else if (!result.ok) {
        setError(result.error);
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [initialState]);

  // window.print() runs after the render that mounted the print copy.
  useEffect(() => {
    if (printRequest > 0) {
      window.print();
    }
  }, [printRequest]);

  /* Runs one request, shows its outcome and adopts the payload it returns. */
  const perform = useCallback(
    async (
      url: string,
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      body: unknown,
      success: (response: Record<string, unknown>) => string
    ) => {
      setBusy(true);
      setError(null);
      setNotice(null);

      const result = await callApi(url, method, body);

      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        setConfirmation(null);
        return false;
      }

      if (isAdminState(result.body.admin)) {
        setData(result.body.admin);
      } else {
        await refresh();
      }

      setNotice(success(result.body));
      setBusy(false);
      setConfirmation(null);
      return true;
    },
    [refresh]
  );

  const rounds = useMemo(() => data?.rounds ?? [], [data]);
  const liveRoundId = data?.live?.current_round_id ?? null;
  const activeRoundId =
    selectedRoundId && rounds.some((round) => round.id === selectedRoundId)
      ? selectedRoundId
      : liveRoundId && rounds.some((round) => round.id === liveRoundId)
        ? liveRoundId
        : rounds[0]?.id ?? null;
  const round = rounds.find((candidate) => candidate.id === activeRoundId) ?? null;
  const liveRound = rounds.find((candidate) => candidate.id === liveRoundId) ?? null;
  /* The rider on course right now, if they are in the round on screen. */
  const liveRunId = data?.live?.current_run_id ?? null;
  const runs = useMemo(
    () => (round && data ? data.runs_by_round[round.id] ?? [] : []),
    [data, round]
  );
  const leaderboard = useMemo(
    () => (round && data ? data.leaderboards_by_round[round.id] ?? [] : []),
    [data, round]
  );
  const groups = useMemo(() => groupStartList(runs), [runs]);
  /* The standings table, pool by pool in pool order and, inside a pool, in
     riding order: the same layout as the start list and the paper sheet, so a
     wrong score is found by pool. A round with no pools keeps the ranking. */
  const standings = useMemo(() => {
    if (!leaderboard.some((row) => row.pool_label)) {
      return leaderboard;
    }

    const firstRide = new Map<string, number>();

    for (const run of runs) {
      const known = firstRide.get(run.entrant_key);

      if (known === undefined || run.run_order < known) {
        firstRide.set(run.entrant_key, run.run_order);
      }
    }

    const poolOf = (label: string | null) => (label ? poolIndex(label) : -1);

    return [...leaderboard].sort(
      (first, second) =>
        poolOf(first.pool_label) - poolOf(second.pool_label) ||
        (firstRide.get(first.entrant_key) ?? 0) - (firstRide.get(second.entrant_key) ?? 0) ||
        first.rank - second.rank
    );
  }, [leaderboard, runs]);
  const scoredCount = runs.filter((run) => run.status === "scored").length;
  const poolLabels = groups
    .map((group) => group.label)
    .filter((label): label is string => label !== null);
  /* The start list narrowed by the search box: entrants (rider or team,
     matched on any of their riders and horses) and running-order runs. */
  const shownGroups = useMemo(() => {
    const labels = groups
      .map((group) => group.label)
      .filter((label): label is string => label !== null);
    const matches = startListMatcher(startListQuery, labels);

    return groups
      .map((group) => ({
        ...group,
        shownEntrants: group.entrants.filter((entrant) =>
          matches({
            texts: [
              entrant.name,
              entrant.detail,
              ...entrant.members.flatMap((member) => [member.name, member.horse]),
            ],
            pool: entrant.pool_label,
          })
        ),
        shownRuns: group.runs.filter((run) =>
          matches({ texts: [run.rider_name, run.team_name, run.horse_name], pool: run.pool_label })
        ),
      }))
      .filter((group) => group.shownEntrants.length > 0 || group.shownRuns.length > 0);
  }, [groups, startListQuery]);
  const searchingStartList = startListQuery.trim() !== "";
  const nextNewPool =
    round?.pool_size !== null && round?.pool_size !== undefined
      ? poolLabelForIndex(
          poolLabels.length > 0 ? Math.max(...poolLabels.map(poolIndex)) + 1 : 0
        )
      : null;
  const overridesByKey = useMemo(() => {
    const map = new Map<string, AdvanceOverrideRow>();

    for (const override of data?.overrides ?? []) {
      if (override.round_id === activeRoundId) {
        map.set(override.entrant_key, override);
      }
    }

    return map;
  }, [data, activeRoundId]);

  /* Draw preview: how many entrants qualify and the pools that result.
     `source` says who they are, with the count ("1 solo rider checked in"),
     or why nobody can be drawn when `count` is null. */
  const drawPreview = useMemo(() => {
    if (!round || !data) {
      return null;
    }

    let count: number | null;
    let source: string;

    if (drawMode === "all_checked_in") {
      count =
        round.event_type === "single"
          ? data.candidates.solo.filter((rider) => rider.checked_in).length
          : data.candidates.teams.filter(
              (team) => team.member_count === 4 && team.checked_in_count === 4
            ).length;
      source =
        round.event_type === "single"
          ? `${plural(count, "solo rider")} checked in`
          : `${plural(count, "team")} with all four riders checked in`;
    } else {
      const previous = [...rounds]
        .filter(
          (candidate) =>
            candidate.event_type === round.event_type &&
            candidate.sort_order < round.sort_order
        )
        .sort((first, second) => second.sort_order - first.sort_order)[0];

      if (!previous) {
        return { count: null, sizes: [], runs: 0, source: "no earlier round of this event" };
      }

      count = (data.leaderboards_by_round[previous.id] ?? []).filter(
        (row) => row.advanced === true
      ).length;
      source = `${count} marked through in ${previous.name}`;
    }

    const sizes =
      count > 0
        ? round.pool_size
          ? balancedPoolSizes(count, round.pool_size)
          : [count]
        : [];
    const ridersPerEntrant = round.event_type === "section" ? 4 : 1;

    return {
      count,
      sizes,
      runs: count * round.attempts_per_rider * ridersPerEntrant,
      source,
    };
  }, [data, drawMode, round, rounds]);

  /* Late entrants: candidates not already in the round. */
  const lateCandidates = useMemo(() => {
    if (!round || !data) {
      return [];
    }

    const inRound = new Set(runs.map((run) => run.entrant_key));
    const query = lateQuery.trim().toLowerCase();

    if (round.event_type === "single") {
      // Matched as the check-in desk does: name, phone, code, parents,
      // horse or town, best match first.
      return data.candidates.solo
        .filter((rider) => !inRound.has(`solo:${rider.id}`))
        .filter((rider) => includeNotCheckedIn || rider.checked_in)
        .flatMap((rider) => {
          const rank = query === "" ? 0 : matchRank({ ...rider, team_name: null }, query);
          return rank === null ? [] : [{ rider, rank }];
        })
        .sort((first, second) => first.rank - second.rank)
        .slice(0, 25)
        .map(({ rider }) => ({
          id: rider.id,
          kind: "solo" as const,
          name: rider.full_name,
          about:
            [
              rider.horse_name,
              rider.father_name ? `Father: ${rider.father_name}` : null,
              rider.location,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          checkedIn: rider.checked_in,
          status: rider.checked_in ? "Checked in" : "Not checked in",
        }));
    }

    return data.candidates.teams
      .filter((team) => !inRound.has(`team:${team.id}`))
      .filter(
        (team) =>
          includeNotCheckedIn ||
          (team.member_count === 4 && team.checked_in_count === team.member_count)
      )
      .filter((team) => query === "" || team.team_name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((team) => ({
        id: team.id,
        kind: "team" as const,
        name: team.team_name,
        about: null as string | null,
        checkedIn: team.member_count === 4 && team.checked_in_count === team.member_count,
        status: `${team.checked_in_count} of ${team.member_count} checked in`,
      }));
  }, [data, includeNotCheckedIn, lateQuery, round, runs]);

  const latePool = smallestPool(groups, round?.pool_size !== null && round?.pool_size !== undefined);

  /* Actions --------------------------------------------------------------------- */

  const ask = (next: Confirmation) => {
    setError(null);
    setConfirmation(next);
  };

  /* The auto engine ------------------------------------------------------------- */

  const startQualifying = (checkedIn: number) =>
    ask({
      title: "Start qualifying?",
      detail: `${qualifyingPreview(checkedIn)}, shuffled once into even pools. Riders who check in after this join the last pool on their own. You can undo it until the first rider has ridden.`,
      confirmLabel: "Start qualifying",
      danger: false,
      run: async () => {
        await perform(
          "/api/admin/scoring/next-round",
          "POST",
          { action: "start_qualifying" },
          (response) => {
            const result = response.result as { round_id?: unknown; riders?: unknown; pools?: unknown } | null;

            if (result && typeof result.round_id === "string") {
              setSelectedRoundId(result.round_id);
            }

            return `Qualifying is drawn: ${plural(
              typeof result?.riders === "number" ? result.riders : 0,
              "rider"
            )} in ${plural(typeof result?.pools === "number" ? result.pools : 0, "pool")}. Set it live when the riding starts.`;
          }
        );
      },
    });

  const startTeams = (teams: number) =>
    ask({
      title: "Start teams?",
      detail: `${teamsPreview(teams)}. Teams are shuffled once; that order is kept for every later round. A team whose 4th rider checks in during Round 1 joins its end on its own. You can undo it until the first team has ridden.`,
      confirmLabel: "Start teams",
      danger: false,
      run: async () => {
        await perform(
          "/api/admin/scoring/next-round",
          "POST",
          { action: "start_teams" },
          (response) => {
            const result = response.result as { round_id?: unknown; teams?: unknown } | null;

            if (result && typeof result.round_id === "string") {
              setSelectedRoundId(result.round_id);
            }

            return `Teams Round 1 is drawn: ${plural(
              typeof result?.teams === "number" ? result.teams : 0,
              "team"
            )} in one queue. Set it live when the riding starts.`;
          }
        );
      },
    });

  const startNextRound = (plan: NextRoundPlan) => {
    if (!plan.round_id) {
      return;
    }

    const fromRoundId = plan.round_id;

    ask({
      title: `${startButtonLabel(plan)}?`,
      detail: startConfirmDetail(plan),
      confirmLabel: startButtonLabel(plan),
      danger: false,
      run: async () => {
        await perform(
          "/api/admin/scoring/next-round",
          "POST",
          { action: "start", round_id: fromRoundId },
          (response) => {
            const result = response.result as { round_id?: unknown; round_name?: unknown; runs_created?: unknown } | null;

            if (result && typeof result.round_id === "string") {
              setSelectedRoundId(result.round_id);
            }

            return `${typeof result?.round_name === "string" ? result.round_name : "The next round"} is ready: ${plural(
              typeof result?.runs_created === "number" ? result.runs_created : 0,
              "run"
            )} in start order. Set it live when the riding starts.`;
          }
        );
      },
    });
  };

  const undoNextRound = (undo: NonNullable<NextStep["undo"]>) =>
    ask({
      title: `Undo ${undo.round_name}?`,
      detail: `This deletes ${undo.round_name} and its start list, and removes any “Auto:” decisions the engine wrote on the round before. Nobody in it has ridden yet. Fix what you need, then start it again.`,
      confirmLabel: `Undo ${undo.round_name}`,
      danger: true,
      run: async () => {
        await perform(
          "/api/admin/scoring/next-round",
          "POST",
          { action: "undo", round_id: undo.round_id },
          () => `${undo.round_name} undone.`
        );
      },
    });

  /* Whether a draw from the previous round keeps its order for this event:
     true once the engine's database update for it is in place. */
  const orderKeptFor = (eventType: EventType) =>
    (eventType === "section" ? nextSteps.section : nextSteps.single) != null;

  const switchEngine = (autoOn: boolean) => {
    const teams = engineEvent === "section";
    const who = teams ? "Teams" : "Singles";

    ask({
      title: `Switch ${who} to ${autoOn ? "Automatic" : "Manual"}?`,
      detail: autoOn
        ? teams
          ? "A team whose last rider checks in will join Teams Round 1 on its own, and the Next step card will offer to start each round. The round tools stay below."
          : "Riders who check in will join the qualifying pools on their own, and the Next step card will offer to start each round. The round tools stay below."
        : teams
          ? "Teams completing check-in will no longer join a round on their own. Rounds are made and drawn by hand."
          : "Check-ins will no longer join pools on their own. Rounds are made and drawn by hand.",
      confirmLabel: `Switch to ${autoOn ? "Automatic" : "Manual"}`,
      danger: false,
      run: async () => {
        await perform(
          "/api/admin/scoring/next-round",
          "POST",
          { action: "switch", auto_on: autoOn, event_type: engineEvent },
          // No message: the highlighted tab already shows the mode.
          () => ""
        );
      },
    });
  };

  const submitRoundForm = (payload: Record<string, unknown>) => {
    if (roundForm === "create") {
      void perform("/api/admin/scoring/rounds", "POST", payload, (response) => {
        const created = response.round as ScoringRound | undefined;

        if (created?.id) {
          setSelectedRoundId(created.id);
        }

        setRoundForm(null);
        return `Round “${created?.name ?? "new round"}” created.`;
      });
      return;
    }

    if (round) {
      void perform(`/api/admin/scoring/rounds/${round.id}`, "PATCH", payload, () => {
        setRoundForm(null);
        return "Round saved.";
      });
    }
  };

  const setLive = (target: ScoringRound) =>
    ask({
      title: `Make “${target.name}” the live round?`,
      detail:
        "The judges' panel, the public scoreboard and the stream overlays all switch to this round. No rider is on course until a pool is called or the judges choose one.",
      confirmLabel: "Set Live",
      danger: false,
      run: async () => {
        await perform(
          "/api/judge/live",
          "POST",
          { current_round_id: target.id },
          () => `“${target.name}” is now the live round.`
        );
      },
    });

  /* Screens: what /live and the stream overlays show. Through the judges'
     live route, which administrators may use. */
  const setDisplayMode = (mode: DisplayMode) => {
    const choice = DISPLAY_MODE_CHOICES.find((candidate) => candidate.mode === mode);

    void perform(
      "/api/judge/live",
      "POST",
      { display_mode: mode },
      () => `Screens now show: ${choice?.label ?? mode}.`
    );
  };

  const setLiveMessage = (message: string | null) => {
    void perform("/api/judge/live", "POST", { message }, () =>
      message ? "Message is on the screens." : "Message cleared."
    ).then((ok) => {
      if (ok) {
        setMessageDraft(null);
      }
    });
  };

  const clearLiveRound = () =>
    ask({
      title: "Clear the live round?",
      detail:
        "Nothing is live afterwards: the judges' panel asks for a round, and the public scoreboard and overlays show no rider until a round is set live again. Results and start lists are not touched.",
      confirmLabel: "Clear Live Round",
      danger: true,
      run: async () => {
        await perform(
          "/api/judge/live",
          "POST",
          { current_round_id: null, current_run_id: null },
          () => "No round is live now."
        );
      },
    });

  /* "Close demo" / "Open demo": closed, the demo pages say so, practice is
     refused and ?sample=demo shows the frozen sample rows. For event day. */
  const setDemoClosed = (closed: boolean) =>
    ask({
      title: closed ? "Close the demo for the event?" : "Open the demo again?",
      detail: closed
        ? "Everyone on /judge/demo and /commentary/demo sees \"Demo closed for the event\" with a button to the live panel, practice taps are refused, and addresses with ?sample=demo show the frozen sample rows (still marked SAMPLE). Real scores do not change."
        : "Judges, commentators and administrators can practise on the shared demo again, and addresses with ?sample=demo follow it again. Real scores do not change.",
      confirmLabel: closed ? "Close demo" : "Open demo",
      danger: false,
      run: async () => {
        await perform("/api/admin/scoring/demo-switch", "POST", { closed }, (body) => {
          const next = toDemoSwitch(body.demo);

          if (next) {
            setDemoSwitch(next);
          }

          return closed ? "The demo is closed for the event." : "The demo is open again.";
        });
      },
    });

  /* The graphics rehearsal feed: the moving vMix sample, ?sample=solo. Only
     sample addresses follow it; no screen, panel or real feed changes. */
  const setSoloSample = (enabled: boolean) =>
    ask({
      title: enabled ? "Start the rehearsal feed?" : "Stop the rehearsal feed?",
      detail: enabled
        ? "Feed addresses with ?sample=solo start playing a scripted qualification with invented riders, a step every 8 seconds. Real scores, the public scoreboard, the overlays and the judges' and commentators' panels do not change."
        : "Feed addresses with ?sample=solo stop moving and show the fixed rehearsal data instead. Nothing else changes.",
      confirmLabel: enabled ? "Start" : "Stop",
      danger: false,
      run: async () => {
        await perform("/api/admin/scoring/rehearsal", "POST", { sample: "solo", enabled }, () =>
          enabled ? "The rehearsal feed is running." : "The rehearsal feed is stopped."
        );
      },
    });

  /* "Put on course": this run becomes the rider on course on every screen —
     the judges' panel, the commentary panel, /live and the overlays — through
     the judges' live route (administrators may use it). One click in the live
     round; a run in another round asks first, because the whole event
     switches to that round. */
  const putOnCourse = (target: ScoringRound, run: ScoringRun) => {
    const go = () =>
      perform(
        "/api/judge/live",
        "POST",
        { current_round_id: target.id, current_run_id: run.id },
        () => `${run.rider_name} is on course (run ${run.run_order}).`
      );

    if (target.id === liveRoundId) {
      void go();
      return;
    }

    ask({
      title: `Put ${run.rider_name} on course in “${target.name}”?`,
      detail: liveRound
        ? `“${target.name}” is not the live round (“${liveRound.name}” is). The judges' panel, the commentary panel, the public scoreboard and the overlays all switch to “${target.name}”, with ${run.rider_name} (run ${run.run_order}) on course. Results are not touched.`
        : `No round is live. “${target.name}” becomes the live round on every screen, with ${run.rider_name} (run ${run.run_order}) on course.`,
      confirmLabel: "Put on course",
      danger: false,
      run: async () => {
        await go();
      },
    });
  };

  const callPool = (target: ScoringRound, label: string) =>
    ask({
      title: `Call Pool ${label} to the start?`,
      detail: `Every screen — scoreboard, overlays, commentary — switches to Pool ${label}'s roster with “get ready”, and the live rider becomes Pool ${label}'s first rider still to ride. The first result recorded returns the screens to the scoreboard.`,
      confirmLabel: `Call Pool ${label}`,
      danger: false,
      run: async () => {
        await perform(
          "/api/judge/call-pool",
          "POST",
          { round_id: target.id, pool_label: label },
          () => `Pool ${label} called.`
        );
      },
    });

  const setStatus = (target: ScoringRound, status: RoundStatus) =>
    ask({
      title:
        status === "complete"
          ? `Mark “${target.name}” complete?`
          : `Reopen “${target.name}”?`,
      detail:
        status === "complete"
          ? "The round is shown as finished on the public scoreboard. Results stay as they are and can still be corrected."
          : "The round is shown as live again on the public scoreboard.",
      confirmLabel: status === "complete" ? "Mark Complete" : "Reopen",
      danger: false,
      run: async () => {
        await perform(
          `/api/admin/scoring/rounds/${target.id}`,
          "PATCH",
          { status },
          () => `“${target.name}” is now ${ROUND_STATUS_LABELS[status].toLowerCase()}.`
        );
      },
    });

  const deleteRound = (target: ScoringRound) => {
    const targetRuns = data?.runs_by_round[target.id] ?? [];
    const targetScored = targetRuns.filter((run) => run.status === "scored").length;

    ask({
      title: `Delete “${target.name}”?`,
      detail:
        targetScored > 0
          ? `This permanently deletes the round, its ${plural(targetRuns.length, "run")} and ${plural(targetScored, "recorded result")}. It cannot be undone.`
          : `This deletes the round and its ${plural(targetRuns.length, "run")}. No results have been recorded.`,
      confirmLabel: targetScored > 0 ? "Delete With Results" : "Delete Round",
      danger: true,
      run: async () => {
        const ok = await perform(
          `/api/admin/scoring/rounds/${target.id}${targetScored > 0 ? "?force=1" : ""}`,
          "DELETE",
          undefined,
          () => `“${target.name}” deleted.`
        );

        if (ok) {
          setSelectedRoundId(null);
        }
      },
    });
  };

  const drawStartList = (target: ScoringRound) => {
    if (!drawPreview || drawPreview.count === null || drawPreview.count === 0) {
      setError("Nobody qualifies for this draw yet.");
      return;
    }

    const noun = target.event_type === "section" ? "team" : "rider";
    const poolText =
      target.pool_size && drawPreview.sizes.length > 0
        ? `${plural(drawPreview.sizes.length, "pool")} (${drawPreview.sizes
            .map((size, index) => `${poolLabelForIndex(index)}: ${size}`)
            .join(", ")})`
        : "one start list with no pools";

    ask({
      title: `Draw ${plural(drawPreview.count, noun)} into ${poolText}?`,
      detail: `${plural(drawPreview.runs, "run")} ${drawOrderText(drawMode, orderKeptFor(target.event_type))}.${
        runs.length > 0
          ? ` This replaces the current start list of ${plural(runs.length, "run")}.`
          : ""
      } The count comes from the latest data and may differ slightly if riders check in meanwhile.`,
      confirmLabel: runs.length > 0 ? "Redraw" : "Draw",
      danger: runs.length > 0,
      run: async () => {
        await perform(
          `/api/admin/scoring/rounds/${target.id}/start-list`,
          "POST",
          { mode: drawMode },
          (response) =>
            `Start list drawn: ${plural(typeof response.runs_created === "number" ? response.runs_created : 0, "run")}.`
        );
      },
    });
  };

  const clearStartList = (target: ScoringRound) =>
    ask({
      title: `Clear the start list of “${target.name}”?`,
      detail:
        scoredCount > 0
          ? `This deletes ${plural(runs.length, "run")}, including ${plural(scoredCount, "recorded result")}. It cannot be undone.`
          : `This deletes ${plural(runs.length, "run")}. No results have been recorded.`,
      confirmLabel: scoredCount > 0 ? "Clear With Results" : "Clear Start List",
      danger: true,
      run: async () => {
        await perform(
          `/api/admin/scoring/rounds/${target.id}/start-list${scoredCount > 0 ? "?force=1" : ""}`,
          "DELETE",
          undefined,
          (response) =>
            `Start list cleared: ${plural(typeof response.runs_deleted === "number" ? response.runs_deleted : 0, "run")} removed.`
        );
      },
    });

  const saveBuiltStartList = (target: ScoringRound, pools: string[][], labels: string[]) => {
    const noun = target.event_type === "section" ? "team" : "rider";
    const started = startedPoolLabels(runs);
    const openAttempt = firstOpenAttempt(runs);
    const count = pools.reduce((total, pool) => total + pool.length, 0);
    const layout =
      labels.length > 0
        ? `${plural(pools.length, "pool")} (${pools
            .map((pool, index) => `${labels[index]}: ${pool.length}`)
            .join(", ")})`
        : "one start list with no pools";

    ask({
      title: `Save ${plural(count, noun)} in ${layout}?`,
      detail: started.size > 0
        ? `Started riding, kept exactly as is with their results: Pool ${[...started].sort().join(", ")}. The other pools are written in the order you tapped${
            openAttempt > 1 ? `, riding from Round ${openAttempt}` : ""
          }.`
        : `Riders ride in the order you tapped, ${plural(target.attempts_per_rider, "attempt")} each.${
            runs.length > 0 ? ` This replaces the current start list of ${plural(runs.length, "run")}.` : ""
          }`,
      confirmLabel: "Save Start List",
      danger: runs.length > 0 && started.size === 0,
      run: async () => {
        const ok = await perform(
          `/api/admin/scoring/rounds/${target.id}/start-list`,
          "PUT",
          { pools },
          (response) =>
            `Start list saved: ${plural(typeof response.runs_created === "number" ? response.runs_created : 0, "run")}.`
        );

        if (ok) {
          setBuilderRoundId(null);
        }
      },
    });
  };

  const removeEntrant = (target: ScoringRound, entrant: EntrantSummary) =>
    ask({
      title: `Remove ${entrant.name} from “${target.name}”?`,
      detail: `This deletes their ${plural(entrant.runs.length, "run")}, and everyone after them moves up. Their registration is not touched.`,
      confirmLabel: "Remove",
      danger: true,
      run: async () => {
        await perform(
          `/api/admin/scoring/rounds/${target.id}/entrants/${encodeURIComponent(entrant.entrant_key)}`,
          "DELETE",
          undefined,
          () => `${entrant.name} removed.`
        );
      },
    });

  const movePool = (target: ScoringRound, entrant: EntrantSummary, label: string) =>
    ask({
      title: `Move ${entrant.name} to Pool ${label}?`,
      detail: `${entrant.name} leaves Pool ${entrant.pool_label ?? "—"} and rides last in Pool ${label}${
        poolLabels.includes(label) ? "" : " (a new pool)"
      }. The start list is renumbered.`,
      confirmLabel: `Move to Pool ${label}`,
      danger: false,
      run: async () => {
        await perform(
          "/api/admin/scoring/pool",
          "POST",
          { round_id: target.id, entrant_key: entrant.entrant_key, pool_label: label },
          () => `${entrant.name} moved to Pool ${label}.`
        );
      },
    });

  const moveRun = (run: ScoringRun, newOrder: number) =>
    void perform(
      `/api/admin/scoring/runs/${run.id}/move`,
      "POST",
      { run_order: newOrder },
      () => `${run.rider_name} moved to position ${newOrder}.`
    );

  const addLateEntrant = (
    target: ScoringRound,
    candidate: { id: string; kind: "solo" | "team"; name: string; checkedIn: boolean }
  ) =>
    ask({
      title: `Add ${candidate.name} to “${target.name}”?`,
      detail: `${candidate.name} ${latePool ? `joins Pool ${latePool} (the smallest pool) and ` : ""}rides last${
        latePool ? " in it" : ""
      }, ${plural(target.attempts_per_rider, "attempt")}.${
        candidate.checkedIn
          ? ""
          : " They have not checked in — adding them overrides check-in, and the audit log records that."
      }`,
      confirmLabel: "Add Entrant",
      danger: false,
      run: async () => {
        await perform(
          `/api/admin/scoring/rounds/${target.id}/entrants`,
          "POST",
          candidate.kind === "solo"
            ? { solo_registration_id: candidate.id }
            : { team_id: candidate.id },
          () => `${candidate.name} added.`
        );
      },
    });

  const setOverride = (target: ScoringRound, row: LeaderboardRow, advanced: boolean | null) => {
    const note = (noteDrafts[row.entrant_key] ?? overridesByKey.get(row.entrant_key)?.note ?? "").trim();

    ask({
      title:
        advanced === null
          ? `Remove the override for ${row.name}?`
          : `Mark ${row.name} as ${advanced ? "through" : "out"}?`,
      detail:
        advanced === null
          ? "The round's own rule decides again whether they go through."
          : `This overrides the round's rule for ${row.name}${note ? ` (note: “${note}”)` : ""}. The public standings and the next round's draw follow it.`,
      confirmLabel: advanced === null ? "Remove Override" : advanced ? "Mark Through" : "Mark Out",
      danger: advanced !== true,
      run: async () => {
        await perform(
          "/api/admin/scoring/advance",
          "POST",
          {
            round_id: target.id,
            entrant_key: row.entrant_key,
            advanced,
            note: note === "" ? null : note,
          },
          () => (advanced === null ? `Override removed for ${row.name}.` : `Override saved for ${row.name}.`)
        );
      },
    });
  };

  const podiumFor = (target: ScoringRound): [string, string, string] => {
    const draft = podiumDrafts[target.id];

    if (draft) {
      return draft;
    }

    const byPlace = (place: 1 | 2 | 3) =>
      target.podium?.find((entry) => entry.place === place)?.entrant_key ?? "";

    return [byPlace(1), byPlace(2), byPlace(3)];
  };

  const savePodium = (target: ScoringRound) => {
    const picks = podiumFor(target);
    const entries = picks
      .map((key, index) => ({ place: index + 1, entrant_key: key, name: "" }))
      .filter((entry) => entry.entrant_key !== "");

    if (new Set(entries.map((entry) => entry.entrant_key)).size !== entries.length) {
      setError("Each entrant can only hold one podium place.");
      return;
    }

    const names = entries
      .map(
        (entry) =>
          `${entry.place}. ${leaderboard.find((row) => row.entrant_key === entry.entrant_key)?.name ?? "?"}`
      )
      .join(", ");

    ask({
      title: entries.length > 0 ? `Record the podium for “${target.name}”?` : `Clear the podium of “${target.name}”?`,
      detail:
        entries.length > 0
          ? `${names}. Shown on the public scoreboard as the final result.`
          : "The podium is removed from the public scoreboard.",
      confirmLabel: entries.length > 0 ? "Save Podium" : "Clear Podium",
      danger: entries.length === 0,
      run: async () => {
        const ok = await perform(
          `/api/admin/scoring/rounds/${target.id}`,
          "PATCH",
          { podium: entries.length > 0 ? entries : null },
          () => (entries.length > 0 ? "Podium saved." : "Podium cleared.")
        );

        if (ok) {
          setPodiumDrafts((current) => {
            const next = { ...current };
            delete next[target.id];
            return next;
          });
        }
      },
    });
  };

  /* Render ----------------------------------------------------------------------- */

  if (loading && !data) {
    return <p className="text-brown/80">Loading rounds…</p>;
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 text-red-900">
            {error}
          </p>
        )}
        <button type="button" onClick={() => void refresh()} className={primaryButton}>
          Try Again
        </button>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className={`${cardClass} space-y-3`}>
        <h2 className={headingClass}>Live scoring is not set up yet</h2>
        <p className="max-w-2xl leading-7 text-brown/85">
          The scoring tables do not exist in the database yet. Apply
          supabase/migrations/20261025110000_staff_roles.sql and then
          20261025120000_live_scoring.sql in the Supabase SQL editor, then reload this page.
        </p>
        <Link href="/admin" className={`${secondaryButton} inline-block`}>
          Back to Admin
        </Link>
      </div>
    );
  }

  const roundHasStartList = runs.length > 0;

  return (
    <div className={`space-y-8 ${confirmation ? "pb-40" : ""}`}>
      {/* Header: back link, live summary, refresh */}
      <div className="flex flex-col gap-4 border-b border-bronze/20 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin" className={secondaryButton}>
            ← Admin
          </Link>
          <Link href="/judge" className={secondaryButton}>
            Judges&apos; Panel
          </Link>
          <Link href="/live" className={secondaryButton}>
            Public Scoreboard
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-brown/80">
            {liveRound ? (
              <>
                Live: {liveRound.name}
                {data.live?.called_pool_label ? ` · Pool ${data.live.called_pool_label} called` : ""}
                {data.live ? ` · Screens: ${data.live.display_mode.replace("_", " ")}` : ""}
              </>
            ) : (
              "No live round"
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              void refresh();
            }}
            disabled={busy}
            className={secondaryButton}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 text-red-900">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-lg border-l-4 border-green-700 bg-green-50 px-4 py-3 text-green-900">
          {notice}
        </p>
      )}

      {/* Next step: the auto engine, Singles or Teams */}
      <NextStepCard
        event={engineEvent}
        onEvent={setEngineEvent}
        step={nextSteps[engineEvent]}
        busy={busy}
        onStartQualifying={startQualifying}
        onStartTeams={startTeams}
        onStart={startNextRound}
        onUndo={undoNextRound}
        onSwitch={switchEngine}
      >
        {/* Every round tool, in Manual and Automatic alike */}
      <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Rounds list */}
        <aside className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className={headingClass}>Rounds</h2>
            <button
              type="button"
              onClick={() => setRoundForm("create")}
              disabled={busy}
              className={primaryButton}
            >
              New Round
            </button>
          </div>

          {rounds.length === 0 ? (
            <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
              No rounds yet. Create the Single qualification round first.
            </p>
          ) : (
            <ul className="space-y-2">
              {rounds.map((candidate) => {
                const candidateRuns = data.runs_by_round[candidate.id] ?? [];
                const entrants = new Set(candidateRuns.map((run) => run.entrant_key)).size;
                const selected = candidate.id === activeRoundId;

                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoundId(candidate.id);
                        setRoundForm(null);
                        setShowSheet(false);
                      }}
                      aria-current={selected ? "true" : undefined}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        selected
                          ? "border-bronze bg-cream shadow-sm"
                          : "border-bronze/20 bg-sand hover:border-bronze/40"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold uppercase tracking-[0.08em] text-bronze-dark">
                          {candidate.name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                            candidate.id === liveRoundId
                              ? "bg-bronze text-cream"
                              : candidate.status === "complete"
                                ? "bg-green-100 text-green-900"
                                : "border border-bronze/30 text-brown"
                          }`}
                        >
                          {candidate.id === liveRoundId ? "Live now" : ROUND_STATUS_LABELS[candidate.status]}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-brown/80">
                        {EVENT_LABELS[candidate.event_type]} · round {candidate.round_number} ·{" "}
                        {plural(candidate.attempts_per_rider, "attempt")} ·{" "}
                        {plural(entrants, candidate.event_type === "section" ? "team" : "rider")}
                        {candidate.pool_size ? ` · pools of ~${candidate.pool_size}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Selected round */}
        <div className="min-w-0 space-y-6">
          {roundForm === "create" && (
            <RoundForm
              key="create"
              title="New Round"
              isCreate
              structureLocked={false}
              busy={busy}
              initial={{
                name: "",
                event_type: "single",
                round_number: String(
                  rounds.filter((candidate) => candidate.event_type === "single").length === 0
                    ? 0
                    : Math.max(
                        ...rounds
                          .filter((candidate) => candidate.event_type === "single")
                          .map((candidate) => candidate.round_number)
                      ) + 1
                ),
                attempts_per_rider: "1",
                target_points: "",
                pool_size: "10",
                sort_order: String(
                  rounds.length === 0
                    ? 1
                    : Math.max(...rounds.map((candidate) => candidate.sort_order)) + 1
                ),
                status: "upcoming",
              }}
              onCancel={() => setRoundForm(null)}
              onSubmit={submitRoundForm}
            />
          )}

          {!round ? (
            rounds.length > 0 && <p className="text-brown/80">Choose a round.</p>
          ) : (
            <>
              {/* Round header and actions */}
              <section className={`${cardClass} space-y-4`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className={headingClass}>{round.name}</h2>
                    <p className="mt-1 text-sm text-brown/80">
                      {EVENT_LABELS[round.event_type]} Tent Pegging · round {round.round_number} ·{" "}
                      {plural(round.attempts_per_rider, "attempt")} per rider
                      {round.target_points ? ` · target ${plural(round.target_points, "point")}` : ""}
                      {round.pool_size ? ` · pools of about ${round.pool_size}` : " · no pools"} · sort{" "}
                      {round.sort_order} · {ROUND_STATUS_LABELS[round.status]}
                    </p>
                    <p className="mt-1 text-sm text-brown/80">
                      {plural(
                        groups.reduce((total, group) => total + group.entrants.length, 0),
                        round.event_type === "section" ? "team" : "rider"
                      )}{" "}
                      · {plural(runs.length, "run")} · {scoredCount} scored
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {round.id === liveRoundId ? (
                      <span className="rounded-lg bg-bronze px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream">
                        Live now
                      </span>
                    ) : (
                      <button type="button" onClick={() => setLive(round)} disabled={busy} className={primaryButton}>
                        Set Live
                      </button>
                    )}
                    {round.status === "complete" ? (
                      <button type="button" onClick={() => setStatus(round, "live")} disabled={busy} className={secondaryButton}>
                        Reopen
                      </button>
                    ) : (
                      <button type="button" onClick={() => setStatus(round, "complete")} disabled={busy} className={secondaryButton}>
                        Mark Complete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRoundForm(roundForm === "edit" ? null : "edit")}
                      disabled={busy}
                      className={secondaryButton}
                    >
                      {roundForm === "edit" ? "Close Edit" : "Edit"}
                    </button>
                    <button type="button" onClick={() => deleteRound(round)} disabled={busy} className={dangerButton}>
                      Delete
                    </button>
                  </div>
                </div>
              </section>

              {roundForm === "edit" && (
                <RoundForm
                  key={`edit-${round.id}-${round.updated_at}`}
                  title={`Edit ${round.name}`}
                  isCreate={false}
                  structureLocked={roundHasStartList}
                  busy={busy}
                  initial={toFormValues(round)}
                  onCancel={() => setRoundForm(null)}
                  onSubmit={submitRoundForm}
                />
              )}

              {/* Draw */}
              <section className={`${cardClass} space-y-4`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className={subheadingClass}>Draw Start List</h3>
                  {roundHasStartList && (
                    <button type="button" onClick={() => clearStartList(round)} disabled={busy} className={dangerButton}>
                      Clear Start List
                    </button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <label className="block">
                    <span className={labelClass}>Who rides</span>
                    <select
                      value={drawMode}
                      onChange={(event) =>
                        setDrawMode(event.target.value === "advanced" ? "advanced" : "all_checked_in")
                      }
                      className={inputClass}
                    >
                      <option value="all_checked_in">
                        {round.event_type === "single"
                          ? "Every checked-in solo rider"
                          : "Every team with all four riders checked in"}
                      </option>
                      <option value="advanced">Those marked through in the previous round</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => drawStartList(round)}
                    disabled={busy || scoredCount > 0 || !drawPreview || !drawPreview.count}
                    className={`${primaryButton} py-3`}
                  >
                    {roundHasStartList ? "Redraw…" : "Draw…"}
                  </button>
                </div>

                {drawPreview && (
                  <p className="text-sm leading-6 text-brown/85">
                    {drawPreview.count === null
                      ? `Nobody to draw: ${drawPreview.source}.`
                      : drawPreview.count === 0
                        ? `Nobody qualifies yet (${drawPreview.source}).`
                        : `${drawPreview.source} → ${
                            round.pool_size
                              ? `${plural(drawPreview.sizes.length, "pool")}: ${drawPreview.sizes
                                  .map((size, index) => `${poolLabelForIndex(index)} ${size}`)
                                  .join(" · ")}`
                              : "one start list, no pools"
                          } · ${plural(drawPreview.runs, "run")}, ${drawOrderText(drawMode, orderKeptFor(round.event_type))}.`}
                    {scoredCount > 0 && " Results are recorded in this round — clear them before redrawing."}
                  </p>
                )}

                <div className="flex flex-col gap-2 border-t border-bronze/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-brown/80">
                    Or choose the order yourself: tap {round.event_type === "section" ? "teams" : "riders"} in
                    riding order, any pool sizes, and save the whole list at once.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBuilderRoundId(builderRoundId === round.id ? null : round.id)}
                    disabled={busy}
                    aria-expanded={builderRoundId === round.id}
                    className={`${secondaryButton} shrink-0`}
                  >
                    {builderRoundId === round.id ? "Close Pool Builder" : "Build Pools By Hand"}
                  </button>
                </div>
              </section>

              {builderRoundId === round.id && (
                <PoolBuilder
                  key={round.id}
                  round={round}
                  runs={runs}
                  candidates={data.candidates}
                  busy={busy}
                  scoredCount={scoredCount}
                  onSave={(pools, labels) => saveBuiltStartList(round, pools, labels)}
                  onClose={() => setBuilderRoundId(null)}
                />
              )}

              {/* Start list grouped by pool */}
              <section className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className={headingClass}>Start List</h3>
                  {roundHasStartList && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSheet((current) => !current)}
                        className={secondaryButton}
                      >
                        {showSheet ? "Hide Pool Sheet" : "Pool Sheet"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSheet(true);
                          setPrintRequest((current) => current + 1);
                        }}
                        className={secondaryButton}
                      >
                        Print Pool Sheet
                      </button>
                    </div>
                  )}
                </div>

                {roundHasStartList && (
                  <div className={`${cardClass} space-y-2`}>
                    <label className="block" htmlFor="start-list-search">
                      <span className={labelClass}>Find a rider</span>
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        id="start-list-search"
                        type="search"
                        autoComplete="off"
                        value={startListQuery}
                        onChange={(event) => setStartListQuery(event.target.value)}
                        placeholder="Rider, team, horse or pool (e.g. “Sandhu”, “Toofan”, “Pool B”)"
                        className={`${inputClass} flex-1`}
                      />
                      {searchingStartList && (
                        <button
                          type="button"
                          onClick={() => setStartListQuery("")}
                          className={secondaryButton}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-brown/80">
                      {searchingStartList
                        ? `${shownGroups.reduce((total, group) => total + group.shownEntrants.length, 0)} ${
                            round.event_type === "section" ? "teams" : "riders"
                          } match. `
                        : ""}
                      “Put on course” makes that rider the one on course on every screen: the
                      judges&apos; panel, commentary, the public scoreboard and the overlays.
                    </p>
                  </div>
                )}

                {roundHasStartList && searchingStartList && shownGroups.length === 0 && (
                  <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
                    Nobody in this start list matches “{startListQuery.trim()}”.
                  </p>
                )}

                {!roundHasStartList ? (
                  <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
                    No start list yet. Draw one above, or add entrants one by one below.
                  </p>
                ) : (
                  shownGroups.map((group) => {
                    const groupKey = group.label ?? "all";
                    const pendingInPool = group.runs.filter(
                      (run) => run.status === "pending" || run.status === "on_course"
                    ).length;
                    const called =
                      round.id === liveRoundId && group.label !== null && data.live?.called_pool_label === group.label;
                    const tableOpen = openRunTables[`${round.id}:${groupKey}`] ?? false;

                    return (
                      <article key={groupKey} className={`${cardClass} space-y-4`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className={subheadingClass}>
                              {group.label ? `Pool ${group.label}` : "All entrants"}
                              {called && (
                                <span className="ml-2 rounded-full bg-bronze px-2 py-0.5 align-middle font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-cream">
                                  Called
                                </span>
                              )}
                            </h4>
                            <p className="text-sm text-brown/80">
                              {plural(group.entrants.length, round.event_type === "section" ? "team" : "rider")} ·{" "}
                              {plural(group.runs.length, "run")} · {pendingInPool} still to ride
                            </p>
                          </div>
                          {group.label && (
                            <button
                              type="button"
                              onClick={() => callPool(round, group.label as string)}
                              disabled={busy || pendingInPool === 0}
                              className={primaryButton}
                            >
                              Call Pool {group.label}
                            </button>
                          )}
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-bronze/20 bg-cream">
                          <table className="w-full min-w-[640px] border-collapse text-left text-sm text-brown">
                            <thead className="border-b border-bronze/20 bg-parchment">
                              <tr className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">{round.event_type === "section" ? "Team" : "Rider"}</th>
                                <th className="px-3 py-2">{round.event_type === "section" ? "Riders" : "Horse"}</th>
                                <th className="px-3 py-2">Runs</th>
                                <th className="px-3 py-2">On course</th>
                                <th className="px-3 py-2">Pool</th>
                                <th className="px-3 py-2">Remove</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.shownEntrants.map((entrant) => {
                                const locked = entrant.scored > 0;
                                const position = group.entrants.indexOf(entrant) + 1;
                                const onCourseNow =
                                  liveRunId !== null
                                    ? entrant.runs.find((run) => run.id === liveRunId) ?? null
                                    : null;
                                const nextRun =
                                  entrant.runs.find(
                                    (run) => run.status === "pending" || run.status === "on_course"
                                  ) ?? null;
                                const poolOptions = [
                                  ...poolLabels.filter((label) => label !== entrant.pool_label),
                                  ...(nextNewPool && !poolLabels.includes(nextNewPool) ? [nextNewPool] : []),
                                ];

                                return (
                                  <tr key={entrant.entrant_key} className="border-b border-bronze/10 last:border-0 align-top">
                                    <td className="px-3 py-2 tabular-nums text-brown/70">{position}</td>
                                    <td className="px-3 py-2 font-semibold text-ink">{entrant.name}</td>
                                    <td className="px-3 py-2">
                                      {entrant.is_team
                                        ? entrant.members.map((member) => member.name).join(" · ")
                                        : entrant.detail ?? "—"}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2">
                                      {entrant.scored}/{entrant.runs.length} scored
                                      {entrant.voided > 0 ? ` · ${entrant.voided} skipped` : ""}
                                    </td>
                                    <td className="px-3 py-2">
                                      {onCourseNow ? (
                                        <span className="inline-block rounded-full bg-bronze px-2.5 py-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-cream">
                                          On course now
                                          {entrant.is_team ? ` · ${onCourseNow.rider_name}` : ""}
                                        </span>
                                      ) : nextRun ? (
                                        <button
                                          type="button"
                                          onClick={() => putOnCourse(round, nextRun)}
                                          disabled={busy}
                                          aria-label={`Put ${nextRun.rider_name} on course (run ${nextRun.run_order})`}
                                          title={`Run ${nextRun.run_order}${
                                            round.attempts_per_rider > 1 ? `, attempt ${nextRun.attempt_number}` : ""
                                          }${entrant.is_team ? ` — ${nextRun.rider_name}` : ""}`}
                                          className={`${primaryButton} whitespace-nowrap`}
                                        >
                                          Put on course
                                        </button>
                                      ) : (
                                        <span className="text-brown/60">All ridden</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {round.pool_size && poolOptions.length > 0 ? (
                                        <select
                                          aria-label={`Move ${entrant.name} to another pool`}
                                          value=""
                                          disabled={busy || locked}
                                          onChange={(event) => {
                                            if (event.target.value) {
                                              movePool(round, entrant, event.target.value);
                                            }
                                          }}
                                          className="rounded-lg border border-bronze/20 bg-cream px-2 py-1 text-sm text-brown disabled:opacity-60"
                                        >
                                          <option value="">Pool {entrant.pool_label}</option>
                                          {poolOptions.map((label) => (
                                            <option key={label} value={label}>
                                              Move to {label}
                                              {poolLabels.includes(label) ? "" : " (new)"}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="text-brown/60">{entrant.pool_label ?? "—"}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        type="button"
                                        onClick={() => removeEntrant(round, entrant)}
                                        disabled={busy || locked}
                                        title={locked ? "Clear their results before removing them." : undefined}
                                        className={dangerButton}
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <button
                          type="button"
                          aria-expanded={tableOpen}
                          onClick={() =>
                            setOpenRunTables((current) => ({
                              ...current,
                              [`${round.id}:${groupKey}`]: !tableOpen,
                            }))
                          }
                          className={secondaryButton}
                        >
                          {tableOpen ? "Hide Running Order" : "Show Running Order"}
                        </button>

                        {tableOpen && (
                          <div className="overflow-x-auto rounded-lg border border-bronze/20 bg-cream">
                            <table className="w-full min-w-[640px] border-collapse text-left text-sm text-brown">
                              <thead className="border-b border-bronze/20 bg-parchment">
                                <tr className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                                  <th className="px-3 py-2">Order</th>
                                  <th className="px-3 py-2">Attempt</th>
                                  <th className="px-3 py-2">Rider</th>
                                  <th className="px-3 py-2">Status</th>
                                  <th className="px-3 py-2">On course</th>
                                  <th className="px-3 py-2">Move</th>
                                  <th className="px-3 py-2">To position</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.shownRuns.map((run) => {
                                  const block = group.runs.filter(
                                    (other) => other.attempt_number === run.attempt_number
                                  );
                                  const first = Math.min(...block.map((other) => other.run_order));
                                  const last = Math.max(...block.map((other) => other.run_order));
                                  const fixed = run.status === "scored";

                                  return (
                                    <tr key={run.id} className="border-b border-bronze/10 last:border-0">
                                      <td className="px-3 py-2 tabular-nums">{run.run_order}</td>
                                      <td className="px-3 py-2 tabular-nums">
                                        {run.attempt_number} of {round.attempts_per_rider}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className="font-semibold text-ink">{run.rider_name}</span>
                                        {run.team_name ? <span className="text-brown/70"> · {run.team_name}</span> : null}
                                      </td>
                                      <td className="px-3 py-2">
                                        <RunStatusChip run={run} />
                                      </td>
                                      <td className="px-3 py-2">
                                        {run.id === liveRunId ? (
                                          <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark">
                                            Now
                                          </span>
                                        ) : run.status === "pending" || run.status === "on_course" ? (
                                          <button
                                            type="button"
                                            onClick={() => putOnCourse(round, run)}
                                            disabled={busy}
                                            aria-label={`Put ${run.rider_name} on course (run ${run.run_order})`}
                                            className={`${secondaryButton} whitespace-nowrap`}
                                          >
                                            Put on course
                                          </button>
                                        ) : (
                                          <span className="text-brown/50">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            aria-label={`Move ${run.rider_name} earlier`}
                                            onClick={() => moveRun(run, run.run_order - 1)}
                                            disabled={busy || fixed || run.run_order <= first}
                                            className={secondaryButton}
                                          >
                                            ↑
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Move ${run.rider_name} later`}
                                            onClick={() => moveRun(run, run.run_order + 1)}
                                            disabled={busy || fixed || run.run_order >= last}
                                            className={secondaryButton}
                                          >
                                            ↓
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        {first < last ? (
                                          <MoveToPosition
                                            run={run}
                                            first={first}
                                            last={last}
                                            disabled={busy || fixed}
                                            onMove={(newOrder) => moveRun(run, newOrder)}
                                          />
                                        ) : (
                                          <span className="text-brown/50">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}

                {showSheet && roundHasStartList && <PoolSheet round={round} groups={groups} />}
              </section>

              {/* Late entrant */}
              <section className={`${cardClass} space-y-4`}>
                <h3 className={subheadingClass}>Add Late Entrant</h3>
                <p className="text-sm leading-6 text-brown/80">
                  {round.event_type === "section" ? "Teams" : "Riders"} not yet in this round.{" "}
                  {latePool
                    ? `A new entrant joins Pool ${latePool} (the smallest) and rides last in it.`
                    : "A new entrant rides last."}
                </p>
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <label className="block flex-1">
                    <span className={labelClass}>Search</span>
                    <input
                      type="search"
                      value={lateQuery}
                      onChange={(event) => setLateQuery(event.target.value)}
                      placeholder={
                        round.event_type === "section"
                          ? "Team name"
                          : "Name, phone, code, parents, horse, place…"
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border border-bronze/30 bg-cream px-3 py-2 text-sm text-brown md:max-w-sm">
                    <input
                      type="checkbox"
                      checked={includeNotCheckedIn}
                      onChange={(event) => setIncludeNotCheckedIn(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-semibold text-ink">Include entrants who have not checked in</span>
                      <span className="block text-xs text-brown/75">
                        Administrator override — normally only checked-in riders ride.
                      </span>
                    </span>
                  </label>
                </div>

                {lateCandidates.length === 0 ? (
                  <p className="text-sm text-brown/75">
                    No {includeNotCheckedIn ? "" : "checked-in "}
                    {round.event_type === "section" ? "teams" : "riders"} left to add
                    {lateQuery.trim() ? " for that search" : ""}.
                  </p>
                ) : (
                  <ul className="divide-y divide-bronze/10 rounded-lg border border-bronze/20 bg-cream">
                    {lateCandidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span>
                          <span className="font-semibold text-ink">{candidate.name}</span>
                          <span
                            className={`ml-2 font-display text-[0.7rem] font-semibold uppercase tracking-[0.1em] ${
                              candidate.checkedIn ? "text-green-800" : "text-red-800"
                            }`}
                          >
                            {candidate.status}
                          </span>
                          {candidate.about && (
                            <span className="block text-sm text-brown/75">{candidate.about}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => addLateEntrant(round, candidate)}
                          disabled={busy}
                          className={secondaryButton}
                        >
                          Add{latePool ? ` to Pool ${latePool}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Standings and overrides */}
              <section className={`${cardClass} space-y-4`}>
                <h3 className={subheadingClass}>Standings &amp; Advance Overrides</h3>
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-brown/75">No standings until the start list is drawn.</p>
                ) : (
                  /* A list, not a table: it fits any width with no sideways
                     scroll. One rider per row, in three parts (who, standing,
                     override) that sit side by side where there is room and
                     wrap under each other where there is not. It wraps by the
                     room the card has, not by screen size: the card is narrow
                     on a small laptop, beside the rounds list. */
                  <div className="overflow-hidden rounded-lg border border-bronze/20 bg-cream">
                    {standings.map((row, index) => {
                      const override = overridesByKey.get(row.entrant_key);
                      const newPool =
                        row.pool_label !== null &&
                        (index === 0 || standings[index - 1].pool_label !== row.pool_label);

                      return (
                        <Fragment key={row.entrant_key}>
                          {newPool && (
                            <h4 className="border-b border-bronze/20 bg-parchment px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                              Pool {row.pool_label}
                            </h4>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-bronze/10 px-3 py-3 text-sm text-brown last:border-0">
                            <div className="min-w-0 grow basis-52">
                              <p className="break-words font-semibold text-ink">{row.name}</p>
                              <p className="text-xs text-brown/75">
                                Rank {row.rank}
                                {row.pool_label ? ` (${row.pool_rank} in pool)` : ""} ·{" "}
                                <span className="font-semibold text-ink">
                                  {row.points} {row.points === 1 ? "pt" : "pts"}
                                </span>{" "}
                                · {row.best_result ? RESULT_LABELS[row.best_result] : "No result"} ·{" "}
                                <span className="whitespace-nowrap tabular-nums">
                                  Runs {row.runs_scored}/{row.runs_total}
                                </span>
                              </p>
                            </div>
                            <div className="min-w-0 grow basis-28">
                              <span
                                className={
                                  row.advanced === true
                                    ? "font-semibold text-green-800"
                                    : row.advanced === false
                                      ? "text-red-800"
                                      : "text-brown/60"
                                }
                              >
                                {advancedLabel(row)}
                              </span>
                              {row.advanced_overridden && (
                                <span className="ml-1 rounded bg-bronze/15 px-1.5 py-0.5 font-display text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-bronze-deep">
                                  Override
                                </span>
                              )}
                              {override?.note && (
                                <span className="mt-1 block break-words text-xs text-brown/75">{override.note}</span>
                              )}
                            </div>
                            <div className="flex min-w-0 grow-[2] basis-64 flex-wrap items-center gap-2">
                              <input
                                value={noteDrafts[row.entrant_key] ?? override?.note ?? ""}
                                onChange={(event) =>
                                  setNoteDrafts((current) => ({
                                    ...current,
                                    [row.entrant_key]: event.target.value,
                                  }))
                                }
                                maxLength={300}
                                placeholder="Reason (optional)"
                                aria-label={`Override note for ${row.name}`}
                                className="min-w-0 grow basis-32 rounded-lg border border-bronze/20 bg-cream px-2 py-2 text-sm text-brown focus:border-bronze focus:outline-none"
                              />
                              <div className="flex flex-wrap gap-1">
                                <button type="button" onClick={() => setOverride(round, row, true)} disabled={busy} className={secondaryButton}>
                                  Through
                                </button>
                                <button type="button" onClick={() => setOverride(round, row, false)} disabled={busy} className={secondaryButton}>
                                  Out
                                </button>
                                {row.advanced_overridden && (
                                  <button type="button" onClick={() => setOverride(round, row, null)} disabled={busy} className={dangerButton}>
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Podium */}
              <section className={`${cardClass} space-y-4`}>
                <h3 className={subheadingClass}>Podium</h3>
                <p className="text-sm leading-6 text-brown/80">
                  For the final: record 1st, 2nd and 3rd once the chief judge has decided. Shown on the
                  public scoreboard.
                </p>
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-brown/75">The podium can be recorded once the round has entrants.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    {([0, 1, 2] as const).map((index) => {
                      const picks = podiumFor(round);

                      return (
                        <label key={index} className="block">
                          <span className={labelClass}>{["1st", "2nd", "3rd"][index]} place</span>
                          <select
                            value={picks[index]}
                            onChange={(event) => {
                              const next: [string, string, string] = [...picks];
                              next[index] = event.target.value;
                              setPodiumDrafts((current) => ({ ...current, [round.id]: next }));
                            }}
                            className={inputClass}
                          >
                            <option value="">—</option>
                            {leaderboard.map((row) => (
                              <option key={row.entrant_key} value={row.entrant_key}>
                                {row.rank}. {row.name} ({row.points} pts)
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                )}
                {leaderboard.length > 0 && (
                  <button type="button" onClick={() => savePodium(round)} disabled={busy} className={primaryButton}>
                    Save Podium
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      </NextStepCard>


      {/* Screens: display mode, message, clear the live round */}
      <section aria-labelledby="screens-heading" className={`${cardClass} space-y-4 print:hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="screens-heading" className={subheadingClass}>
            Screens
          </h2>
          <p className="text-sm text-brown/75">
            What the public scoreboard and the stream overlays show right now.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {DISPLAY_MODE_CHOICES.map((choice) => {
            const active = data.live?.display_mode === choice.mode;

            return (
              <button
                key={choice.mode}
                type="button"
                aria-pressed={active}
                disabled={busy || active}
                onClick={() => setDisplayMode(choice.mode)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default ${
                  active
                    ? "border-bronze bg-bronze-deep text-cream"
                    : "border-bronze/20 bg-cream text-ink hover:border-bronze/40"
                }`}
              >
                <span className="block font-display text-xs font-semibold uppercase tracking-[0.12em]">
                  {choice.label}
                </span>
                <span className={`mt-1 block text-xs leading-5 ${active ? "text-cream/85" : "text-brown/75"}`}>
                  {active ? "On screen now" : choice.hint}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className={labelClass}>Message (up to 200 characters)</span>
            <input
              type="text"
              maxLength={200}
              value={messageDraft ?? data.live?.message ?? ""}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder="e.g. Short break — Pool C rides at 2:30"
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (messageDraft ?? data.live?.message ?? "").trim() === ""}
              onClick={() => setLiveMessage((messageDraft ?? data.live?.message ?? "").trim())}
              className={primaryButton}
            >
              Set Message
            </button>
            <button
              type="button"
              disabled={busy || !data.live?.message}
              onClick={() => setLiveMessage(null)}
              className={secondaryButton}
            >
              Clear Message
            </button>
            <button
              type="button"
              disabled={busy || !liveRound}
              onClick={clearLiveRound}
              className={dangerButton}
            >
              Clear Live Round
            </button>
          </div>
        </div>
      </section>

      {/* Rider list for the graphics team */}
      <section aria-labelledby="export-heading" className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden`}>
        <div>
          <h2 id="export-heading" className={subheadingClass}>
            Rider List for Graphics
          </h2>
          <p className="mt-1 text-sm leading-6 text-brown/80">
            For the graphics team: every registered rider with horse, location, check-in and
            pool. It contains no phone numbers, email addresses, ages or other contact details.
          </p>
        </div>
        <a
          href="/api/admin/scoring/export?format=csv"
          download
          className={`${primaryButton} shrink-0 text-center`}
        >
          Download rider list (CSV)
        </a>
      </section>

      {/* Rehearsal feeds for the graphics team: the scripted loop behind a
          switch, and the shared demo, always on */}
      <section aria-labelledby="rehearsal-heading" className={`${cardClass} space-y-4 print:hidden`}>
        <h2 id="rehearsal-heading" className={subheadingClass}>
          Graphics Rehearsal Feed
        </h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-brown">
              Scripted loop (
              <code className="rounded bg-bronze/10 px-1 font-mono text-xs">?sample=solo</code>)
            </h3>
            <p className="mt-1 text-sm leading-6 text-brown/80">
              For the graphics team to test their titles: while it runs, feed addresses ending in{" "}
              <code className="rounded bg-bronze/10 px-1 font-mono text-xs">?sample=solo</code> play
              a scripted qualification with invented riders, on a loop. Real scores and every
              screen stay as they are, so it is safe to leave running.
            </p>
            <p className="mt-2 text-sm text-brown">
              {data?.rehearsal ? (
                <>
                  <span className="font-semibold">
                    {data.rehearsal.solo_sample_enabled ? "Running" : "Stopped"}
                  </span>
                  {data.rehearsal.updated_by_name && (
                    <span className="text-brown/70">
                      {" "}
                      · {data.rehearsal.solo_sample_enabled ? "started" : "stopped"} by{" "}
                      {data.rehearsal.updated_by_name},{" "}
                      {new Date(data.rehearsal.updated_at).toLocaleString()}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-brown/70">
                  Not set up yet: apply the rehearsal feed migration
                  (20261028120000_scoring_rehearsal_feed.sql).
                </span>
              )}
            </p>
          </div>
          {data?.rehearsal && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setSoloSample(!data.rehearsal?.solo_sample_enabled)}
              className={`${data.rehearsal.solo_sample_enabled ? secondaryButton : primaryButton} shrink-0`}
            >
              {data.rehearsal.solo_sample_enabled ? "Stop" : "Start"}
            </button>
          )}
        </div>

        <div className="border-t border-bronze/20 pt-4">
          <h3 className="text-sm font-semibold text-brown">
            Follows the demo (
            <code className="rounded bg-bronze/10 px-1 font-mono text-xs">?sample=demo</code>)
          </h3>
          <p className="mt-1 text-sm leading-6 text-brown/80">
            Everything the judges do on{" "}
            <code className="rounded bg-bronze/10 px-1 font-mono text-xs">/judge/demo</code> shows
            here within two seconds. Invented riders only; real scores are never touched. Close the
            demo on event day: the practice pages then say so, and these addresses show the frozen
            sample rows, still marked SAMPLE.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-brown">
              {demoSwitch === undefined ? (
                <span className="text-brown/70">Checking the demo…</span>
              ) : demoSwitch === null ? (
                <span className="text-brown/70">
                  Open. The Close demo switch is not set up yet: apply
                  20261107120000_scoring_training_sessions.sql.
                </span>
              ) : (
                <>
                  <span className="font-semibold">
                    {demoSwitch.demo_closed ? "Closed for the event" : "Open"}
                  </span>
                  {demoSwitch.changed_at && (
                    <span className="text-brown/70">
                      {" "}
                      · {demoSwitch.demo_closed ? "closed" : "opened"}{" "}
                      {new Date(demoSwitch.changed_at).toLocaleString()}
                    </span>
                  )}
                </>
              )}
            </p>
            {demoSwitch && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDemoClosed(!demoSwitch.demo_closed)}
                className={`${demoSwitch.demo_closed ? primaryButton : secondaryButton} shrink-0`}
              >
                {demoSwitch.demo_closed ? "Open demo" : "Close demo"}
              </button>
            )}
          </div>
          {/* Straight into either practice panel. Both were only reachable
              from a link at the foot of the live panel, so the commentary
              demo in particular was hard to find; the judges' and the
              commentators' practice open from here, in a new tab so this
              page keeps its place. */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/judge/demo"
              target="_blank"
              rel="noopener"
              className={`${secondaryButton} text-center`}
            >
              Open the judges&rsquo; practice panel
            </Link>
            <Link
              href="/commentary/demo"
              target="_blank"
              rel="noopener"
              className={`${secondaryButton} text-center`}
            >
              Open the commentary practice panel
            </Link>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-brown">
            {DEMO_FEED_ADDRESSES.map((address) => (
              <li key={address}>
                <code className="break-all rounded bg-bronze/10 px-1 font-mono text-xs">{address}</code>
              </li>
            ))}
          </ul>
        </div>
      </section>


      {confirmation && (
        <ConfirmBar confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} />
      )}
    </div>
  );
}
