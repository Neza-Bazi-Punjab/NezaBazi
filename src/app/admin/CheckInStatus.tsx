"use client";

/* "Who's checked in": the overview half of the Check-in tab. Built from the
   same rider list the desk's instant search uses (kept fresh by CheckInPanel:
   every few seconds and after each check-in), so every desk sees the same
   picture. Teams come first, incomplete ones on top, because a team is drawn
   into a round only when all four riders have checked in. Selecting a rider
   opens their card on the desk. */
import { useMemo, useState } from "react";
import { searchRiders } from "@/lib/check-in-search";

export type RosterRider = {
  id: string;
  entries: Array<"solo" | "team">;
  full_name: string;
  email: string;
  phone: string;
  team_name: string | null;
  team_id: string | null;
  is_leader: boolean | null;
  confirmation_code: string;
  checked_in_at: string | null;
};

/* The draw takes a team only with all four riders checked in. */
const TEAM_SIZE = 4;

type SoloFilter = "all" | "in" | "out";

const formatTime = (value: string) => new Date(value).toLocaleString();

const switchClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
    active
      ? "bg-bronze-deep text-cream"
      : "border border-bronze/20 text-bronze-dark hover:border-bronze/40"
  }`;

function Stat({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="rounded-lg border border-bronze/20 bg-sand p-4">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold text-bronze-dark">
        {value}
        <span className="text-lg text-brown/60"> of {total}</span>
      </p>
    </div>
  );
}

function StatusTag({ checkedInAt }: { checkedInAt: string | null }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${
        checkedInAt ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
      }`}
    >
      {checkedInAt ? "Checked in" : "Not checked in"}
    </span>
  );
}

export default function CheckInStatus({
  roster,
  failed,
  onSelect,
}: {
  roster: RosterRider[] | null;
  failed: boolean;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [soloFilter, setSoloFilter] = useState<SoloFilter>("all");

  const riders = useMemo(
    () => (roster === null ? [] : query.trim() === "" ? roster : searchRiders(roster, query)),
    [roster, query]
  );

  /* Counts are always over everyone; the search only narrows the lists. */
  const totals = useMemo(() => {
    const all = roster ?? [];
    const solo = all.filter((rider) => rider.entries.includes("solo"));
    const teamIds = new Set(all.filter((rider) => rider.team_id).map((rider) => rider.team_id));
    const readyTeams = [...teamIds].filter((teamId) => {
      const members = all.filter((rider) => rider.team_id === teamId);
      return members.length === TEAM_SIZE && members.every((rider) => rider.checked_in_at);
    });

    return {
      riders: all.length,
      ridersIn: all.filter((rider) => rider.checked_in_at).length,
      solo: solo.length,
      soloIn: solo.filter((rider) => rider.checked_in_at).length,
      teams: teamIds.size,
      teamsReady: readyTeams.length,
    };
  }, [roster]);

  /* Teams with a rider matching the search, incomplete first, then by name. */
  const teams = useMemo(() => {
    const all = roster ?? [];
    const shownTeamIds = new Set(riders.filter((rider) => rider.team_id).map((rider) => rider.team_id));

    return [...shownTeamIds]
      .map((teamId) => {
        const members = all
          .filter((rider) => rider.team_id === teamId)
          .sort(
            (first, second) =>
              Number(second.is_leader) - Number(first.is_leader) ||
              first.full_name.localeCompare(second.full_name)
          );
        const arrived = members.filter((rider) => rider.checked_in_at).length;

        return {
          teamId: teamId as string,
          name: members[0]?.team_name ?? "Team",
          members,
          arrived,
          ready: members.length === TEAM_SIZE && arrived === TEAM_SIZE,
        };
      })
      .sort(
        (first, second) =>
          Number(first.ready) - Number(second.ready) || first.name.localeCompare(second.name)
      );
  }, [roster, riders]);

  const soloRiders = riders.filter(
    (rider) =>
      rider.entries.includes("solo") &&
      (soloFilter === "all" ||
        (soloFilter === "in" ? rider.checked_in_at !== null : rider.checked_in_at === null))
  );

  if (roster === null) {
    return (
      <p className="text-brown/80">
        {failed ? "Could not load the rider list. Retrying…" : "Loading riders…"}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Riders checked in" value={totals.ridersIn} total={totals.riders} />
        <Stat label="Solo riders" value={totals.soloIn} total={totals.solo} />
        <Stat label="Teams ready (4/4)" value={totals.teamsReady} total={totals.teams} />
      </div>

      <div>
        <label
          htmlFor="check-in-status-search"
          className="block font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink"
        >
          Find in these lists
        </label>
        <input
          id="check-in-status-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rider or team name, email, code or phone"
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-bronze/40 bg-cream px-4 py-3 text-ink outline-none focus:border-bronze"
        />
      </div>

      <section aria-labelledby="check-in-teams" className="space-y-3">
        <h3
          id="check-in-teams"
          className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark"
        >
          Teams
        </h3>
        <p className="text-sm text-brown/75">
          A team rides only when all four riders have checked in. Incomplete teams are listed
          first.
        </p>

        {teams.length === 0 ? (
          <p className="text-brown/70">{query ? "No teams match." : "No teams registered."}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {teams.map((team) => {
              const waiting = team.members.filter((rider) => !rider.checked_in_at);

              return (
                <li
                  key={team.teamId}
                  className={`rounded-lg border p-4 ${
                    team.ready ? "border-green-700/30 bg-green-50/60" : "border-bronze/20 bg-sand"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-base font-bold uppercase tracking-wide text-bronze-dark">
                      {team.name}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${
                        team.ready ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {team.ready ? "4/4 ready" : `${team.arrived}/${TEAM_SIZE}`}
                    </span>
                  </div>

                  {!team.ready && (
                    <p className="mt-1 text-sm text-brown/80">
                      {team.members.length < TEAM_SIZE
                        ? `Only ${team.members.length} of ${TEAM_SIZE} riders registered. `
                        : ""}
                      {waiting.length > 0 &&
                        `Waiting for ${waiting.map((rider) => rider.full_name).join(", ")}.`}
                    </p>
                  )}

                  <ul className="mt-3 space-y-1.5">
                    {team.members.map((rider) => (
                      <li key={rider.confirmation_code}>
                        <button
                          type="button"
                          onClick={() => onSelect(rider.confirmation_code)}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-cream"
                        >
                          <span className="min-w-0 truncate text-ink">
                            {rider.full_name}
                            {rider.is_leader && (
                              <span className="ml-2 text-xs text-brown/70">Leader</span>
                            )}
                          </span>
                          <StatusTag checkedInAt={rider.checked_in_at} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="check-in-solo" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3
            id="check-in-solo"
            className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark"
          >
            Solo riders
          </h3>
          <div className="flex gap-2" role="group" aria-label="Show solo riders">
            {(
              [
                ["all", "All"],
                ["in", "Checked in"],
                ["out", "Not checked in"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={soloFilter === value}
                onClick={() => setSoloFilter(value)}
                className={switchClass(soloFilter === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {soloRiders.length === 0 ? (
          <p className="text-brown/70">No solo riders to show.</p>
        ) : (
          <ul className="divide-y divide-bronze/10 overflow-hidden rounded-lg border border-bronze/20 bg-sand">
            {soloRiders.map((rider) => (
              <li key={rider.confirmation_code}>
                <button
                  type="button"
                  onClick={() => onSelect(rider.confirmation_code)}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-cream sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusTag checkedInAt={rider.checked_in_at} />
                    <span className="font-display text-sm font-bold uppercase tracking-[0.1em] text-bronze-dark">
                      {rider.full_name}
                    </span>
                    {rider.entries.includes("team") && rider.team_name && (
                      <span className="text-xs text-brown/70">also on {rider.team_name}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-sm text-brown/75">
                    {rider.checked_in_at && <span>{formatTime(rider.checked_in_at)}</span>}
                    <span className="font-mono tracking-[0.1em] text-bronze-deep">
                      {rider.confirmation_code}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export { switchClass };
