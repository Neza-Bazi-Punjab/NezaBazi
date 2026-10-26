import { shortLocation, type ScoringRound, type ScoringRun } from "@/lib/scoring/types";
import { attemptTextIfMany, poolName, runSubtitle } from "./format";
import "./scoring.css";

/* The rider the judges are watching right now: name large, team / horse,
   where they are from (district and state only) and pool / attempt. Only the
   run snapshot is shown — nothing from the registration. */
export default function OnCourseCard({
  run,
  round,
  tone = "light",
  label = "On course now",
  emptyText = "Waiting for the next rider.",
  className = "",
}: {
  run: ScoringRun | null | undefined;
  round: ScoringRound | null | undefined;
  tone?: "light" | "dark";
  label?: string;
  emptyText?: string;
  className?: string;
}) {
  const dark = tone === "dark";
  const frame = dark
    ? "border-cream/15 bg-white/5 text-cream"
    : "border-bronze/25 bg-cream text-ink shadow-sm";
  const muted = dark ? "text-cream/75" : "text-brown/80";

  if (!run) {
    return (
      <section className={`rounded-2xl border p-5 ${frame} ${className}`}>
        <p
          className={`font-display text-xs font-semibold uppercase tracking-[0.2em] ${
            dark ? "text-cream/70" : "text-bronze-dark"
          }`}
        >
          {label}
        </p>
        <p className={`mt-2 text-lg ${muted}`}>{emptyText}</p>
      </section>
    );
  }

  const subtitle = runSubtitle(run);
  const location = shortLocation(run.rider_location);
  const facts = [poolName(run.pool_label), attemptTextIfMany(run, round)].filter(Boolean);

  return (
    <section className={`rounded-2xl border p-5 ${frame} ${className}`}>
      <p
        className={`flex flex-wrap items-center gap-x-2 font-display text-xs font-semibold uppercase tracking-[0.2em] ${
          dark ? "text-cream/70" : "text-bronze-dark"
        }`}
      >
        <span>{label}</span>
        {facts.map((fact) => (
          <span key={fact}>· {fact}</span>
        ))}
      </p>
      {/* Keyed by run so a new rider rises in (static under reduced motion). */}
      <div key={run.id} className="nbp-rise-in">
        <h2 className="mt-2 break-words font-display text-4xl font-bold uppercase leading-[1.05] tracking-wide sm:text-5xl">
          {run.rider_name}
        </h2>
        {subtitle && <p className={`mt-2 text-lg ${muted}`}>{subtitle}</p>}
        {location && <p className={`mt-0.5 text-base ${muted}`}>{location}</p>}
      </div>
    </section>
  );
}
