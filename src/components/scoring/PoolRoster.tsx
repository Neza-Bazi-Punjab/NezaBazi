import type { PoolRosterEntry } from "@/lib/scoring/types";

/* Who rides in one pool, in start order: one name per line, a team's four
   riders listed under the team name. Used for the "Pool B — get ready"
   call-up and the pools list. Roster entries carry only the run snapshot. */
export default function PoolRoster({
  entries,
  tone = "light",
  size = "md",
  showHorse = true,
  highlight,
  className = "",
}: {
  entries: PoolRosterEntry[];
  tone?: "light" | "dark";
  size?: "md" | "xl";
  showHorse?: boolean;
  /* Case-insensitive text to highlight (the /live "find your name" box). */
  highlight?: string;
  className?: string;
}) {
  const dark = tone === "dark";
  const large = size === "xl";
  const needle = highlight?.trim().toLowerCase() ?? "";

  if (entries.length === 0) {
    return (
      <p className={`${dark ? "text-cream/70" : "text-brown/75"} ${className}`}>
        No riders drawn into this pool yet.
      </p>
    );
  }

  const matches = (entry: PoolRosterEntry) =>
    needle !== "" &&
    [entry.name, entry.team_name, ...(entry.members ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));

  return (
    <ol className={`space-y-1 ${className}`}>
      {entries.map((entry, index) => {
        const isMatch = matches(entry);

        return (
          <li
            key={entry.entrant_key}
            className={`flex gap-3 rounded-lg px-2 py-1.5 ${
              isMatch ? (dark ? "bg-bronze/40" : "bg-bronze/15 ring-1 ring-bronze/40") : ""
            }`}
          >
            <span
              className={`shrink-0 text-right font-display font-bold tabular-nums ${
                large ? "w-12 text-3xl" : "w-7 text-base"
              } ${dark ? "text-cream/50" : "text-bronze/70"}`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`break-words font-display font-semibold uppercase leading-tight tracking-wide ${
                  large ? "text-4xl" : "text-lg"
                }`}
              >
                {entry.name}
              </p>
              {entry.members && entry.members.length > 0 && (
                <p
                  className={`mt-0.5 ${large ? "text-2xl" : "text-sm"} ${
                    dark ? "text-cream/80" : "text-brown/80"
                  }`}
                >
                  {entry.members.join(" · ")}
                </p>
              )}
              {showHorse && !entry.members?.length && entry.horse_name && (
                <p
                  className={`${large ? "text-xl" : "text-sm"} ${
                    dark ? "text-cream/65" : "text-brown/70"
                  }`}
                >
                  {entry.horse_name}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
