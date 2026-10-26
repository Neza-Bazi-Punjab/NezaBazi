import type { LiveConnection } from "@/lib/scoring/use-live-state";
import "./scoring.css";

/* Small "is this up to date?" pill. The wording carries the meaning; the dot
   is decoration. */

const LABELS: Record<LiveConnection, string> = {
  live: "Live",
  polling: "Updating",
  offline: "Offline",
};

const DESCRIPTIONS: Record<LiveConnection, string> = {
  live: "Live: updates arrive instantly.",
  polling: "Updating every few seconds.",
  offline: "Offline: showing the last update. Retrying.",
};

const TONES = {
  dark: {
    live: "border-emerald-400/60 text-emerald-200",
    polling: "border-amber-300/60 text-amber-100",
    offline: "border-red-400/80 bg-red-950/60 text-red-100",
  },
  light: {
    live: "border-emerald-800/40 text-emerald-900",
    polling: "border-bronze/40 text-bronze-deep",
    offline: "border-red-800/50 bg-red-50 text-red-900",
  },
} as const;

const DOT = {
  live: "bg-emerald-400",
  polling: "bg-amber-400",
  offline: "bg-red-500",
} as const;

const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function ConnectionBadge({
  connection,
  lastUpdated,
  tone = "light",
  showTime = false,
  className = "",
}: {
  connection: LiveConnection;
  lastUpdated?: number | null;
  tone?: "light" | "dark";
  showTime?: boolean;
  className?: string;
}) {
  const time = lastUpdated ? formatTime(lastUpdated) : null;

  return (
    <span
      title={`${DESCRIPTIONS[connection]}${time ? ` Last update ${time}.` : ""}`}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 font-display text-xs font-semibold uppercase tracking-[0.12em] ${TONES[tone][connection]} ${className}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${DOT[connection]} ${
          connection === "live" ? "nbp-pulse" : ""
        }`}
      />
      <span aria-hidden>{LABELS[connection]}</span>
      <span className="sr-only">{DESCRIPTIONS[connection]}</span>
      {showTime && time && (
        <span className="font-sans font-normal normal-case tracking-normal opacity-80">
          <span className="sr-only">Last update </span>
          {time}
        </span>
      )}
    </span>
  );
}
