import { shortLocation, type ScoringRound, type ScoringRun } from "@/lib/scoring/types";
import { attemptTextIfMany, poolName, runSubtitle } from "./format";

/* The next riders in start order (run snapshot only). */
export default function UpNextList({
  runs,
  round,
  limit = 5,
  tone = "light",
  title = "Up next",
  className = "",
}: {
  runs: ScoringRun[];
  round: ScoringRound | null | undefined;
  limit?: number;
  tone?: "light" | "dark";
  title?: string;
  className?: string;
}) {
  const dark = tone === "dark";
  const shown = runs.slice(0, limit);

  return (
    <section className={className}>
      <h2
        className={`font-display text-sm font-semibold uppercase tracking-[0.2em] ${
          dark ? "text-cream/70" : "text-bronze-dark"
        }`}
      >
        {title}
      </h2>
      {shown.length === 0 ? (
        <p className={`mt-2 ${dark ? "text-cream/70" : "text-brown/75"}`}>
          No more riders waiting in this round.
        </p>
      ) : (
        <ol
          className={`mt-2 divide-y rounded-xl border ${
            dark ? "divide-cream/10 border-cream/15" : "divide-bronze/10 border-bronze/20 bg-cream/70"
          }`}
        >
          {shown.map((run, index) => {
            const subtitle = [
              runSubtitle(run),
              shortLocation(run.rider_location),
            ]
              .filter(Boolean)
              .join(" · ");
            const facts = [poolName(run.pool_label), attemptTextIfMany(run, round)]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={run.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 w-6 shrink-0 font-display text-lg font-bold tabular-nums ${
                    dark ? "text-cream/50" : "text-bronze/70"
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-display text-lg font-semibold uppercase leading-tight tracking-wide">
                    {run.rider_name}
                  </p>
                  {subtitle && (
                    <p className={`text-sm ${dark ? "text-cream/70" : "text-brown/75"}`}>
                      {subtitle}
                    </p>
                  )}
                </div>
                {facts && (
                  <span
                    className={`shrink-0 text-right font-display text-xs font-semibold uppercase tracking-[0.12em] ${
                      dark ? "text-cream/60" : "text-brown/60"
                    }`}
                  >
                    {facts}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
