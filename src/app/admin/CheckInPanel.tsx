"use client";

/* Check-in desk: look a rider up by the code they present, confirm they
   arrived, and see how much of their team is still missing. Kept in its own
   component because it is used standing at a table on event eve, on whatever
   device is to hand, not from the main registration tables. */
import { useRef, useState } from "react";

type Rider = {
  id: string;
  source: "solo" | "team";
  team_id: string | null;
  team_name: string | null;
  is_leader: boolean | null;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_name: string | null;
  horse_age: number;
  horse_breed: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  confirmation_code: string;
  checked_in_at: string | null;
  created_at: string;
};

type Teammate = {
  id: string;
  full_name: string;
  is_leader: boolean;
  checked_in_at: string | null;
};

type TeamEmergencyContact = {
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

type RiderMatch = {
  id: string;
  source: "solo" | "team";
  entries: Array<"solo" | "team">;
  full_name: string;
  email: string;
  phone: string;
  team_name: string | null;
  is_leader: boolean | null;
  confirmation_code: string;
  checked_in_at: string | null;
};

type LookupResponse = {
  rider?: Rider;
  /* A rider may hold both a solo entry and a place on a team. They share one
     code, so one lookup returns both and one check-in covers both. */
  entries?: Rider[];
  teammates?: Teammate[];
  /* One contact for the whole team, read from `teams` — a team rider's row
     carries no emergency contact of its own. */
  teamEmergency?: TeamEmergencyContact | null;
  matches?: RiderMatch[];
  error?: string;
};

const formatTime = (value: string) => new Date(value).toLocaleString();

const Detail = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) => (
  <div>
    <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
      {label}
    </p>
    <p className="mt-1 break-words text-brown/85">{value ?? "—"}</p>
  </div>
);

export default function CheckInPanel() {
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [rider, setRider] = useState<Rider | null>(null);
  const [entries, setEntries] = useState<Rider[]>([]);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [teamEmergency, setTeamEmergency] =
    useState<TeamEmergencyContact | null>(null);
  const [matches, setMatches] = useState<RiderMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const clearResults = () => {
    setError(null);
    setNotice(null);
    setRider(null);
    setEntries([]);
    setTeammates([]);
    setMatches(null);
  };

  const loadRiderByCode = async (lookupCode: string) => {
    setLoading(true);
    clearResults();

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: lookupCode }),
      });
      const result = (await response.json()) as LookupResponse;

      if (!response.ok || !result.rider) {
        setError(result.error ?? "Could not look up that code.");
        return;
      }

      setRider(result.rider);
      setEntries(result.entries ?? [result.rider]);
      setTeammates(result.teammates ?? []);
      setTeamEmergency(result.teamEmergency ?? null);
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    await loadRiderByCode(code);
  };

  /* Riders who never received their email, or cannot find it, are found by
     name, email or phone instead. Codes are unique, so selecting a match just
     re-runs the normal code lookup. */
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearching(true);
    clearResults();

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = (await response.json()) as LookupResponse;

      if (!response.ok) {
        setError(result.error ?? "Could not search for that rider.");
        return;
      }

      setMatches(result.matches ?? []);
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setSearching(false);
    }
  };

  const setCheckedIn = async (checkedIn: boolean) => {
    if (!rider) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: rider.confirmation_code, checkedIn }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Could not update this rider.");
        return;
      }

      const message = checkedIn
        ? `${rider.full_name} is checked in.`
        : `Check-in for ${rider.full_name} was undone.`;

      setRider(null);
      setTeammates([]);
      setMatches(null);
      setCode("");
      setQuery("");
      setNotice(message);
      codeInput.current?.focus();
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setSaving(false);
    }
  };

  const checkedInCount = teammates.filter(
    (teammate) => teammate.checked_in_at
  ).length;
  const soloEntry = entries.find((entry) => entry.source === "solo") ?? null;
  const hasTeamEntry = entries.some((entry) => entry.source === "team");

  return (
    <div className="space-y-6">
      <form onSubmit={lookup} className="space-y-3">
        <label
          htmlFor="check-in-code"
          className="block font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink"
        >
          Confirmation Code
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="check-in-code"
            ref={codeInput}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="NBP-7K4M2Q"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-full rounded-lg border border-bronze/40 bg-cream px-4 py-3 font-mono text-lg uppercase tracking-[0.15em] text-ink outline-none focus:border-bronze"
          />
          <button
            type="submit"
            disabled={loading || code.trim() === ""}
            className="rounded-lg bg-bronze-deep px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-50"
          >
            {loading ? "Searching…" : "Find Rider"}
          </button>
        </div>
      </form>

      <form
        onSubmit={search}
        className="space-y-3 rounded-lg border border-bronze/20 bg-sand p-4"
      >
        <label
          htmlFor="check-in-search"
          className="block font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink"
        >
          No code? Search by name, email or phone
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="check-in-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rider name, email or phone number"
            autoComplete="off"
            className="w-full rounded-lg border border-bronze/40 bg-cream px-4 py-3 text-ink outline-none focus:border-bronze"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="rounded-lg border border-bronze/40 px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-cream disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 text-red-900">
          {error}
        </p>
      )}

      {notice && (
        <p className="rounded-lg border-l-4 border-green-700 bg-green-50 px-4 py-3 text-green-900">
          {notice}
        </p>
      )}

      {matches && (
        <section className="rounded-lg border border-bronze/20 bg-sand p-4">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
            {matches.length === 0
              ? "No riders matched that search"
              : `${matches.length} ${matches.length === 1 ? "match" : "matches"} — select a rider`}
          </p>

          {matches.length > 0 && (
            <ul className="mt-3 space-y-2">
              {matches.map((match) => (
                <li key={`${match.source}:${match.id}`}>
                  <button
                    type="button"
                    onClick={() => loadRiderByCode(match.confirmation_code)}
                    className="flex w-full flex-col gap-1 rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-left transition-colors hover:border-bronze/50"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold uppercase tracking-[0.1em] text-bronze-dark">
                        {match.full_name}
                      </span>
                      <span className="font-mono text-sm tracking-[0.1em] text-bronze-deep">
                        {match.confirmation_code}
                      </span>
                    </span>
                    <span className="text-sm text-brown/80">
                      {match.entries
                        .map((entry) =>
                          entry === "solo"
                            ? "Solo Rider"
                            : `${match.team_name ?? "Team"}${
                                match.is_leader ? " — Team Leader" : ""
                              }`
                        )
                        .join(" + ")}
                      {" · "}
                      {match.email}
                      {" · "}
                      {match.phone}
                    </span>
                    {match.checked_in_at && (
                      <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-green-800">
                        Already checked in
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {rider && (
        <article className="space-y-6 rounded-lg border border-bronze/20 bg-sand p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark">
                {rider.full_name}
              </h3>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {entries.map((entry) => (
                  <span
                    key={`${entry.source}:${entry.id}`}
                    className="rounded border border-bronze/30 bg-cream px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown"
                  >
                    {entry.source === "solo"
                      ? "Solo Rider"
                      : `${entry.team_name ?? "Team"}${
                          entry.is_leader ? " — Team Leader" : ""
                        }`}
                  </span>
                ))}
              </div>
            </div>
            <p className="font-mono text-lg font-bold tracking-[0.15em] text-bronze-deep">
              {rider.confirmation_code}
            </p>
          </div>

          {rider.checked_in_at ? (
            <p className="rounded-lg border-l-4 border-green-700 bg-green-50 px-4 py-3 text-green-900">
              Already checked in on {formatTime(rider.checked_in_at)}.
            </p>
          ) : (
            <p className="rounded-lg border-l-4 border-bronze bg-cream px-4 py-3 text-brown">
              Not yet checked in.
            </p>
          )}

          {entries.length > 1 && (
            <p className="rounded-lg border-l-4 border-bronze bg-cream px-4 py-3 text-brown">
              {`This rider has ${entries.length} entries and one code. Checking them in covers both.`}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Age" value={rider.age} />
            <Detail label="Location" value={rider.location} />
            <Detail label="Phone" value={rider.phone} />
            <Detail label="Email" value={rider.email} />
            <Detail label="Experience" value={rider.years_experience} />
            <Detail label="Horse Age" value={rider.horse_age} />
            <Detail label="Horse Breed" value={rider.horse_breed} />
            <Detail label="Horse Name" value={rider.horse_name} />
            {soloEntry && (
              <>
                <Detail
                  label="Emergency Contact"
                  value={soloEntry.emergency_contact_name}
                />
                <Detail
                  label="Emergency Phone"
                  value={soloEntry.emergency_contact_phone}
                />
              </>
            )}
            {/* A team rider's emergency contact belongs to their team. Shown
                only when there is no solo entry carrying their own. */}
            {!soloEntry && hasTeamEntry && (
              <>
                <Detail
                  label="Team Emergency Contact"
                  value={teamEmergency?.emergency_contact_name ?? null}
                />
                <Detail
                  label="Team Emergency Phone"
                  value={teamEmergency?.emergency_contact_phone ?? null}
                />
              </>
            )}
          </div>

          {hasTeamEntry && teammates.length > 0 && (
            <div className="rounded-lg border border-bronze/20 bg-cream p-4">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                Team check-in — {checkedInCount} of {teammates.length} arrived
              </p>
              <ul className="mt-3 space-y-2">
                {teammates.map((teammate) => (
                  <li
                    key={teammate.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-brown/85">
                      {teammate.full_name}
                      {teammate.is_leader ? " (Team Leader)" : ""}
                    </span>
                    <span
                      className={
                        teammate.checked_in_at
                          ? "font-display text-xs font-semibold uppercase tracking-[0.12em] text-green-800"
                          : "font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown/60"
                      }
                    >
                      {teammate.checked_in_at ? "Checked in" : "Waiting"}
                    </span>
                  </li>
                ))}
              </ul>
              {checkedInCount < teammates.length && (
                <p className="mt-3 text-sm leading-6 text-brown/80">
                  All {teammates.length} riders must check in before this team
                  enters the brackets.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {rider.checked_in_at ? (
              <button
                type="button"
                onClick={() => setCheckedIn(false)}
                disabled={saving}
                className="rounded-lg border border-bronze/40 px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-cream disabled:opacity-50"
              >
                {saving ? "Working…" : "Undo Check-in"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCheckedIn(true)}
                disabled={saving}
                className="rounded-lg bg-bronze-deep px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-50"
              >
                {saving ? "Working…" : "Confirm Check-in"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearResults();
                setCode("");
                setQuery("");
                codeInput.current?.focus();
              }}
              className="rounded-lg border border-bronze/40 px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-cream"
            >
              Next Rider
            </button>
          </div>
        </article>
      )}
    </div>
  );
}
