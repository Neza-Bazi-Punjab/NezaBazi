import {
  RESULT_LABELS,
  RESULT_POINTS,
  type RunResult,
  type RunStatus,
} from "@/lib/scoring/types";
import { RUN_STATUS_LABELS } from "./format";

/* A run's outcome as a chip: "Carried 4", "Struck 2", "Miss 0", or the run's
   status when it has no result yet. Colour-coded, but never colour alone: the
   word, the points and the mark shape (filled, half, empty) differ too, so it
   reads in bright sun, on a monochrome stream and for colour-blind viewers. */

type Tone = "light" | "dark";
type Size = "sm" | "md" | "lg";

const RESULT_CLASSES: Record<Tone, Record<RunResult, string>> = {
  dark: {
    carry: "bg-emerald-400 text-ink border-emerald-300",
    strike: "bg-amber-300 text-ink border-amber-200",
    miss: "bg-transparent text-cream border-cream/70",
  },
  light: {
    carry: "bg-emerald-800 text-cream border-emerald-800",
    strike: "bg-bronze text-cream border-bronze",
    miss: "bg-transparent text-brown border-brown/60",
  },
};

const STATUS_CLASSES: Record<Tone, Record<RunStatus, string>> = {
  dark: {
    pending: "bg-transparent text-cream/75 border-cream/30",
    on_course: "bg-bronze text-cream border-bronze",
    scored: "bg-transparent text-cream border-cream/40",
    void: "bg-transparent text-cream/60 border-dashed border-cream/40",
  },
  light: {
    pending: "bg-transparent text-brown/75 border-brown/25",
    on_course: "bg-ink text-cream border-ink",
    scored: "bg-transparent text-brown border-brown/40",
    void: "bg-transparent text-brown/60 border-dashed border-brown/40",
  },
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-2.5 py-1 text-sm",
  lg: "gap-2 px-4 py-2 text-xl",
};

const MARK_SIZE: Record<Size, string> = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

/* Filled for a carry, half for a strike, empty for a miss. */
export function ResultMark({ result, className = "" }: { result: RunResult; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden>
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {result === "carry" && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {result === "strike" && <path d="M6 1a5 5 0 0 0 0 10Z" fill="currentColor" />}
    </svg>
  );
}

export default function ResultBadge({
  result,
  status,
  tone = "light",
  size = "md",
  showPoints = true,
  className = "",
}: {
  result: RunResult | null | undefined;
  status?: RunStatus;
  tone?: Tone;
  size?: Size;
  showPoints?: boolean;
  className?: string;
}) {
  const base = `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-display font-semibold uppercase tracking-[0.08em] ${SIZE_CLASSES[size]} ${className}`;

  if (result) {
    return (
      <span className={`${base} ${RESULT_CLASSES[tone][result]}`}>
        <ResultMark result={result} className={MARK_SIZE[size]} />
        <span>{RESULT_LABELS[result]}</span>
        {showPoints && (
          <span className="tabular-nums">
            {RESULT_POINTS[result]}
            <span className="sr-only"> points</span>
          </span>
        )}
      </span>
    );
  }

  const shownStatus: RunStatus = status ?? "pending";

  return (
    <span className={`${base} ${STATUS_CLASSES[tone][shownStatus]}`}>
      {RUN_STATUS_LABELS[shownStatus]}
    </span>
  );
}
