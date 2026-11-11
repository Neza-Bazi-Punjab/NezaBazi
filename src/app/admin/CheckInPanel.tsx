"use client";

/* Check-in desk: look a rider up by the code they present, check their face
   against their photo, confirm they arrived, and see their team: all four
   riders with photos, each checked in on their own or the whole team at once.
   Any photo here can be added (from files or the camera), replaced or removed
   on the spot: tap it. Kept in its own
   component because it is used standing at a table on event eve, on whatever
   device is to hand, not from the main registration tables. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchRiders } from "@/lib/check-in-search";
import { displayEmail } from "@/lib/paper-registration";
import CheckInStatus, { switchClass } from "./CheckInStatus";
import DalPanthCell from "./DalPanthCell";
import RiderHeadshotCell from "./SoloHeadshotCell";

/* Which row a photo added at the desk goes on (see /api/admin/check-in):
   always the one whose photo is on screen. */
type PhotoTarget = { kind: "solo" | "team"; id: string };

type Rider = {
  id: string;
  source: "solo" | "team";
  team_id: string | null;
  team_name: string | null;
  is_leader: boolean | null;
  full_name: string;
  /* Optional at registration, so null for many riders. */
  father_name: string | null;
  mother_name: string | null;
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
  confirmation_code: string;
  checked_in_at: string | null;
  /* Short-lived signed URL; null when the rider has no photo we can find. */
  headshot_url: string | null;
  photo_target: PhotoTarget | null;
};

type TeamEmergencyContact = {
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

type RiderMatch = {
  id: string;
  /* Extra search text (parents, place, horse, ...). */
  details?: string[];
  /* The same, labelled: father, horse and town show on the match card, and
     any other detail the search matched. */
  facts?: Array<{ label: string; value: string }>;
  source: "solo" | "team";
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

/* Labels always shown on a match card: what tells two riders with the same
   name apart at a glance. */
const KEY_FACTS = ["Father", "Horse", "Town"];

/* The match card's extra line: father, horse and town, then whichever other
   detail (mother, Dal Panth, emergency contact) the search matched, so a
   rider found by it shows why. */
function MatchFacts({
  facts,
  query,
}: {
  facts: Array<{ label: string; value: string }> | undefined;
  query: string;
}) {
  if (!facts || facts.length === 0) {
    return null;
  }

  const typed = query.toLowerCase().replace(/\s+/g, " ").trim();
  const shown = KEY_FACTS.flatMap((label) => facts.filter((fact) => fact.label === label).slice(0, 1));
  const matched =
    typed.length >= 2
      ? facts.filter(
          (fact) =>
            !shown.includes(fact) &&
            fact.value.toLowerCase().replace(/\s+/g, " ").includes(typed)
        )
      : [];

  return (
    <>
      {shown.length > 0 && (
        <span className="text-sm text-brown/80">
          {shown.map((fact, index) => (
            <span key={`${fact.label}:${fact.value}`}>
              {index > 0 && " · "}
              <span className="text-brown/60">{fact.label}:</span> {fact.value}
            </span>
          ))}
        </span>
      )}
      {matched.length > 0 && (
        <span className="text-sm text-bronze-dark">
          Matched{" "}
          {matched.map((fact, index) => (
            <span key={`${fact.label}:${fact.value}`}>
              {index > 0 && " · "}
              <span className="font-semibold">{fact.label}:</span> {fact.value}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

type LookupResponse = {
  rider?: Rider;
  /* A rider may hold both a solo entry and a place on a team. They share one
     code, so one lookup returns both and one check-in covers both. */
  entries?: Rider[];
  teammates?: Teammate[];
  /* One contact for the whole team, read from `teams` — a team rider's row
     carries no emergency contact of its own. */
  teamEmergency?: TeamEmergencyContact | null;
  /* The looked-up rider's own photo, if they uploaded one. */
  headshotUrl?: string | null;
  photoTarget?: PhotoTarget | null;
  /* Staff-only; null when blank or when it could not be read. */
  dalPanth?: string | null;
  matches?: RiderMatch[];
  error?: string;
};

const formatTime = (value: string) => new Date(value).toLocaleString();

/* The rider's qualifying pool after check-in (Automatic mode), as PATCH
   /api/admin/check-in returns it. Null for a team-only rider. */
type DeskPool = {
  started: boolean;
  pool: string | null;
  position: number | null;
  /* Checked in, Automatic mode, qualifying open, yet in no pool. */
  missing?: boolean;
  /* Before qualifying starts: whether Singles are in Automatic mode. */
  auto?: boolean;
};

/* " Pool C · rider 4." / " Pool given when qualifying starts." /
   " Not in a pool yet: send them to the scoring desk." / "". */
const deskPoolText = (pool: DeskPool | null | undefined) => {
  if (!pool) {
    return "";
  }

  if (!pool.started) {
    // In Manual mode no pool is given on check-in, so nothing is promised.
    return pool.auto === false ? "" : " Pool given when qualifying starts.";
  }

  if (pool.pool && pool.position) {
    return ` Pool ${pool.pool} · rider ${pool.position}.`;
  }

  if (pool.missing) {
    return " Not in a pool yet: send them to the scoring desk.";
  }

  return "";
};

/* The code box (and the server search, while the rider list is not loaded)
   waits this long after the last keystroke. */
const SEARCH_DELAY_MS = 100;
/* How often the rider list is refreshed while the page is on screen. */
const ROSTER_REFRESH_MS = 5_000;
/* At most this many results are shown; typing more narrows them. */
const MATCH_LIMIT = 25;
/* A complete code as typed at the desk: NBP-XXXXXX, with or without the
   prefix or its dash. A complete code is looked up without pressing Find. */
const COMPLETE_CODE = /^(NBP-?)?[A-Z0-9]{6}$/i;

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/* The rider's photo, or their initials when there is none (or it fails to
   load), so a card never shows a broken image. */
function Headshot({
  url,
  name,
  className,
}: {
  url: string | null;
  name: string;
  className: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <div
        aria-label={`No photo for ${name}`}
        className={`flex items-center justify-center bg-bronze/15 font-display font-bold text-bronze-dark ${className}`}
      >
        {initials(name)}
      </div>
    );
  }

  return (
    // Signed Supabase Storage URL; next/image would need the bucket host
    // allow-listed in next.config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={() => setFailedUrl(url)}
      referrerPolicy="no-referrer"
      className={`object-cover ${className}`}
    />
  );
}

export default function CheckInPanel() {
  /* The two switches at the top of the tab: the desk, or the overview. */
  /* The switches at the top of the tab: the desk, the overview, or forming
     teams from riders who registered solo. */
  const [view, setView] = useState<"desk" | "status">("desk");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [rider, setRider] = useState<Rider | null>(null);
  const [entries, setEntries] = useState<Rider[]>([]);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [teamEmergency, setTeamEmergency] =
    useState<TeamEmergencyContact | null>(null);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null);
  const [photoTarget, setPhotoTarget] = useState<PhotoTarget | null>(null);
  /* The card's Dal Panth. It saves on its own (DalPanthCell); check-in
     neither waits for it nor sends it. */
  const [dalPanth, setDalPanth] = useState<string | null>(null);
  /* A photo that couldn't be saved, shown under the rider's name. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  /* Which team action is saving: a rider's code, or "team" for all at once. */
  const [teamSaving, setTeamSaving] = useState<string | null>(null);
  /* "Check in whole team" asks once before it acts. */
  const [confirmTeam, setConfirmTeam] = useState<"in" | "out" | null>(null);
  /* Every rider (name, email, phone, team, code, check-in status), filtered
     on this device as you type, so results are instant. Refreshed from the
     server every few seconds and straight after each check-in, so a rider
     checked in at another desk shows as checked in here too. Null until the
     first load; a rider's full card is always loaded fresh when selected. */
  const [roster, setRoster] = useState<RiderMatch[] | null>(null);
  const [rosterFailed, setRosterFailed] = useState(false);
  /* Only while the list cannot be loaded: results from the server search. */
  const [serverMatches, setServerMatches] = useState<RiderMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const codeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoCode = useRef<string | null>(null);
  /* Only the newest list load may land: an older, slower one is dropped. */
  const rosterLoad = useRef(0);

  /* Fetching and applying are split so the effect below only sets state in
     a promise callback, never while it runs. */
  const requestRoster = useCallback(async () => {
    const load = ++rosterLoad.current;

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roster: true }),
      });
      const result = (await response.json()) as { riders?: RiderMatch[] };

      return { load, riders: response.ok && Array.isArray(result.riders) ? result.riders : null };
    } catch {
      return { load, riders: null };
    }
  }, []);

  const applyRoster = useCallback(
    ({ load, riders }: { load: number; riders: RiderMatch[] | null }) => {
      if (load !== rosterLoad.current) {
        return;
      }

      if (riders) {
        setRoster(riders);
        setRosterFailed(false);
      } else {
        setRosterFailed(true);
      }
    },
    []
  );

  const loadRoster = useCallback(
    () => requestRoster().then(applyRoster),
    [requestRoster, applyRoster]
  );

  // Load the list now, then keep it fresh while the page is on screen.
  useEffect(() => {
    void requestRoster().then(applyRoster);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadRoster();
      }
    }, ROSTER_REFRESH_MS);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        void loadRoster();
      }
    };

    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (codeTimer.current) clearTimeout(codeTimer.current);
      searchRequest.current?.abort();
    };
  }, [requestRoster, applyRoster, loadRoster]);

  /* Results: instant from the list, best match first ("begins with", see
     src/lib/check-in-search.ts). Hidden while a rider's card is open. */
  const allMatches = useMemo(() => {
    if (query.trim() === "") {
      return null;
    }

    return roster ? searchRiders(roster, query) : serverMatches;
  }, [query, roster, serverMatches]);
  const matches = rider ? null : allMatches?.slice(0, MATCH_LIMIT) ?? null;
  const hiddenMatches = (allMatches?.length ?? 0) - (matches?.length ?? 0);

  const clearResults = () => {
    setError(null);
    setNotice(null);
    setRider(null);
    setEntries([]);
    setTeammates([]);
    setHeadshotUrl(null);
    setPhotoTarget(null);
    setDalPanth(null);
    setPhotoError(null);
    setConfirmTeam(null);
  };

  const applyCard = (result: LookupResponse & { rider: Rider }) => {
    setRider(result.rider);
    setEntries(result.entries ?? [result.rider]);
    setTeammates(result.teammates ?? []);
    setTeamEmergency(result.teamEmergency ?? null);
    setHeadshotUrl(result.headshotUrl ?? null);
    setPhotoTarget(result.photoTarget ?? null);
    setDalPanth(typeof result.dalPanth === "string" ? result.dalPanth : null);
  };

  /* A photo changed at the desk: show it on the card and on every team tile
     that shares the row, without reloading the card (another server may
     still hold the old photo's address for a while). */
  const photoChanged = (target: PhotoTarget, url: string | null) => {
    const same = (other: PhotoTarget | null) =>
      other !== null && other.kind === target.kind && other.id === target.id;

    if (same(photoTarget)) {
      setHeadshotUrl(url);
    }

    setTeammates((current) =>
      current.map((teammate) =>
        same(teammate.photo_target) ? { ...teammate, headshot_url: url } : teammate
      )
    );
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

      applyCard({ ...result, rider: result.rider });
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();

    if (codeTimer.current) clearTimeout(codeTimer.current);
    lastAutoCode.current = code.trim().toUpperCase();
    await loadRiderByCode(code);
  };

  /* Typing in the code box: a complete code is looked up by itself, once. */
  const changeCode = (value: string) => {
    setCode(value);

    if (codeTimer.current) clearTimeout(codeTimer.current);

    const typed = value.trim().toUpperCase();

    if (!COMPLETE_CODE.test(typed) || typed === lastAutoCode.current) {
      return;
    }

    codeTimer.current = setTimeout(() => {
      lastAutoCode.current = typed;
      void loadRiderByCode(typed);
    }, SEARCH_DELAY_MS);
  };

  /* Fallback while the rider list cannot be loaded: ask the server instead.
     Only the newest search may show its results. */
  const runServerSearch = async (text: string) => {
    searchRequest.current?.abort();
    const request = new AbortController();
    searchRequest.current = request;
    setSearching(true);

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
        signal: request.signal,
      });
      const result = (await response.json()) as LookupResponse;

      if (searchRequest.current !== request) {
        return;
      }

      if (!response.ok) {
        setError(result.error ?? "Could not search for that rider.");
        return;
      }

      setError(null);
      setServerMatches(result.matches ?? []);
    } catch {
      if (searchRequest.current === request) {
        setError("Could not reach the server. Check the connection and retry.");
      }
    } finally {
      if (searchRequest.current === request) {
        setSearching(false);
      }
    }
  };

  /* Typing in the search box: results follow every keystroke, from the first
     letter. Riders who never received their email, or cannot find it, are
     found this way; selecting one runs the normal code lookup. */
  const changeQuery = (value: string) => {
    setQuery(value);

    if (searchTimer.current) clearTimeout(searchTimer.current);

    // A new search means a new rider: put away the card of the last one.
    setRider(null);
    setEntries([]);
    setTeammates([]);
    setDalPanth(null);
    setNotice(null);
    setError(null);

    // The list is here: nothing to wait for.
    if (roster) {
      return;
    }

    // The server search needs at least two characters.
    if (value.trim().length < 2) {
      searchRequest.current?.abort();
      searchRequest.current = null;
      setSearching(false);
      setServerMatches(null);
      return;
    }

    searchTimer.current = setTimeout(() => void runServerSearch(value.trim()), SEARCH_DELAY_MS);
  };

  /* Enter or the Search button: fetch the latest list now. */
  const search = async (event: React.FormEvent) => {
    event.preventDefault();

    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (roster) {
      await loadRoster();
    } else if (query.trim().length >= 2) {
      await runServerSearch(query.trim());
    }
  };

  /* A rider selected in "Who's checked in": back to the desk with their card. */
  const openFromStatus = (riderCode: string) => {
    setView("desk");
    setQuery("");
    setCode("");
    void loadRiderByCode(riderCode);
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
      const result = (await response.json()) as { error?: string; pool?: DeskPool | null };

      if (!response.ok) {
        setError(result.error ?? "Could not update this rider.");
        return;
      }

      const message = checkedIn
        ? `${rider.full_name} is checked in.${deskPoolText(result.pool)}`
        : `Check-in for ${rider.full_name} was undone.`;

      setRider(null);
      setTeammates([]);
      setDalPanth(null);
      setCode("");
      setQuery("");
      lastAutoCode.current = null;
      setServerMatches(null);
      setNotice(message);
      void loadRoster();
      codeInput.current?.focus();
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setSaving(false);
    }
  };

  /* After a team change: reload the open card in place, keeping the message,
     so the desk sees the team fill up without the card closing. */
  const refreshCard = async () => {
    if (!rider) {
      return;
    }

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: rider.confirmation_code }),
      });
      const result = (await response.json()) as LookupResponse;

      if (response.ok && result.rider) {
        applyCard({ ...result, rider: result.rider });
      }
    } catch {
      // The card stays as it was; the next action or refresh will catch up.
    }
  };

  /* One teammate, from the team grid: check in or undo, card stays open. */
  const setTeammateCheckedIn = async (teammate: Teammate, checkedIn: boolean) => {
    setTeamSaving(teammate.confirmation_code);
    setError(null);
    setNotice(null);
    setConfirmTeam(null);

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: teammate.confirmation_code, checkedIn }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? `Could not update ${teammate.full_name}.`);
        return;
      }

      setNotice(
        checkedIn
          ? `${teammate.full_name} is checked in.`
          : `Check-in for ${teammate.full_name} was undone.`
      );
      await refreshCard();
      void loadRoster();
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setTeamSaving(null);
    }
  };

  /* The whole team in one go: everyone not yet in checked in, or (to undo a
     mistake) everyone in checked out. Each rider is still audited on their
     own by the server. */
  const setWholeTeam = async (checkedIn: boolean) => {
    const teamId = entries.find((entry) => entry.source === "team")?.team_id;

    if (!teamId) {
      return;
    }

    setTeamSaving("team");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/check-in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, checkedIn }),
      });
      const result = (await response.json()) as {
        error?: string;
        changed?: number;
        failed?: string[];
      };

      const verb = checkedIn ? "check in" : "undo";

      if (!response.ok) {
        setError(result.error ?? `Could not ${verb} this team.`);
      } else if (result.failed && result.failed.length > 0) {
        setError(
          `${checkedIn ? "Checked in" : "Undid"} ${result.changed ?? 0}, but could not ${verb} ${result.failed.join(", ")}. Try them one by one.`
        );
      } else if (checkedIn) {
        setNotice(
          result.changed === 0
            ? "Everyone on this team was already checked in."
            : `${result.changed} ${result.changed === 1 ? "rider" : "riders"} checked in. The whole team is here.`
        );
      } else {
        setNotice(
          result.changed === 0
            ? "Nobody on this team was checked in."
            : `Check-in undone for ${result.changed} ${result.changed === 1 ? "rider" : "riders"}. The team is no longer complete.`
        );
      }

      setConfirmTeam(null);
      await refreshCard();
      void loadRoster();
    } catch {
      setError("Could not reach the server. Check the connection and retry.");
    } finally {
      setTeamSaving(null);
    }
  };

  const checkedInCount = teammates.filter(
    (teammate) => teammate.checked_in_at
  ).length;
  const soloEntry = entries.find((entry) => entry.source === "solo") ?? null;
  const hasTeamEntry = entries.some((entry) => entry.source === "team");
  const teamName = entries.find((entry) => entry.source === "team")?.team_name ?? "Team";
  const waitingTeammates = teammates.filter((teammate) => !teammate.checked_in_at);
  const arrivedTeammates = teammates.filter((teammate) => teammate.checked_in_at);
  /* Who the open confirmation is about. */
  const confirmList = confirmTeam === "out" ? arrivedTeammates : waitingTeammates;
  const teamBusy = teamSaving !== null || saving;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Check-in view">
        <button
          type="button"
          aria-pressed={view === "desk"}
          onClick={() => setView("desk")}
          className={switchClass(view === "desk")}
        >
          Check-in desk
        </button>
        <button
          type="button"
          aria-pressed={view === "status"}
          onClick={() => setView("status")}
          className={switchClass(view === "status")}
        >
          Who&apos;s checked in
        </button>
      </div>

      {view === "status" ? (
        <CheckInStatus roster={roster} failed={rosterFailed} onSelect={openFromStatus} />
      ) : (
        <>
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
                onChange={(event) => changeCode(event.target.value)}
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
              No code? Search by anything: name, phone, parents, horse, place
              <span className="ml-2 normal-case tracking-normal text-brown/60">
                {roster
                  ? "results appear as you type"
                  : rosterFailed
                    ? searching
                      ? "Searching…"
                      : "searching the server"
                    : "Loading riders…"}
              </span>
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="check-in-search"
                value={query}
                onChange={(event) => changeQuery(event.target.value)}
                placeholder="Name, phone, email, parents, horse, place…"
                autoComplete="off"
                className="w-full rounded-lg border border-bronze/40 bg-cream px-4 py-3 text-ink outline-none focus:border-bronze"
              />
              <button
                type="submit"
                disabled={!roster && query.trim().length < 2}
                className="rounded-lg border border-bronze/40 px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-cream disabled:opacity-50"
              >
                Search
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
            <section
              aria-busy={searching}
              className={`rounded-lg border border-bronze/20 bg-sand p-4 transition-opacity ${
                searching ? "opacity-70" : ""
              }`}
            >
              <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                {matches.length === 0
                  ? "No riders matched that search"
                  : `${matches.length + hiddenMatches} ${
                      matches.length + hiddenMatches === 1 ? "match" : "matches"
                    } — select a rider`}
                {hiddenMatches > 0 && ` (showing the first ${matches.length}; keep typing to narrow)`}
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
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${
                                match.checked_in_at
                                  ? "bg-green-100 text-green-900"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {match.checked_in_at ? "Checked in" : "Not checked in"}
                            </span>
                            <span className="font-display text-sm font-bold uppercase tracking-[0.1em] text-bronze-dark">
                              {match.full_name}
                            </span>
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
                          {displayEmail(match.email)}
                          {" · "}
                          {match.phone}
                        </span>
                        <MatchFacts facts={match.facts} query={query} />
                        {match.checked_in_at && (
                          <span className="text-xs text-green-900/80">
                            Checked in {formatTime(match.checked_in_at)}
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  {photoTarget ? (
                    <div className="shrink-0">
                      <RiderHeadshotCell
                        key={`${photoTarget.kind}:${photoTarget.id}:${headshotUrl ?? ""}`}
                        registrationId={photoTarget.id}
                        kind={photoTarget.kind}
                        riderName={rider.full_name}
                        initial={{ url: headshotUrl }}
                        onError={setPhotoError}
                        onChange={(url) => photoChanged(photoTarget, url)}
                        boxClassName="h-24 w-24 rounded-xl border-2 sm:h-28 sm:w-28"
                        large
                      />
                    </div>
                  ) : (
                    <Headshot
                      url={headshotUrl}
                      name={rider.full_name}
                      className="h-24 w-24 shrink-0 rounded-xl border-2 border-bronze/40 text-2xl sm:h-28 sm:w-28"
                    />
                  )}
                  <div className="min-w-0">
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
                    <p className="mt-2 text-xs text-brown/60">
                      {photoTarget
                        ? headshotUrl
                          ? "Tap the photo to replace or remove it."
                          : "No photo on file. Tap the box to add one."
                        : headshotUrl
                          ? null
                          : "No photo on file."}
                    </p>
                    {photoError && (
                      <p className="mt-1 text-xs text-red-800">{photoError}</p>
                    )}
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
                <Detail label="Father's Name" value={rider.father_name ?? null} />
                <Detail label="Mother's Name" value={rider.mother_name ?? null} />
                <Detail label="Age" value={rider.age} />
                <Detail label="Location" value={rider.location} />
                <Detail label="Phone" value={rider.phone} />
                <Detail label="Email" value={displayEmail(rider.email)} />
                <Detail label="Experience" value={rider.years_experience} />
                <Detail label="Horse Age" value={rider.horse_age} />
                <Detail label="Horse Breed" value={rider.horse_breed} />
                <Detail label="Horse Name" value={rider.horse_name} />
                {/* Saves on its own; keyed on the code so an edit never
                    carries over to the next rider looked up. */}
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    Dal Panth
                  </p>
                  <div className="mt-1">
                    <DalPanthCell
                      key={rider.confirmation_code}
                      variant="card"
                      code={rider.confirmation_code}
                      value={dalPanth}
                      riderName={rider.full_name}
                      onSaved={setDalPanth}
                    />
                  </div>
                </div>
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
                <section
                  aria-label={`${teamName} check-in`}
                  className={`rounded-lg border p-4 ${
                    waitingTeammates.length === 0
                      ? "border-green-700/30 bg-green-50/60"
                      : "border-bronze/20 bg-cream"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-display text-base font-bold uppercase tracking-wide text-bronze-dark">
                        {teamName}
                      </p>
                      <p
                        className={`font-display text-xs font-semibold uppercase tracking-[0.12em] ${
                          waitingTeammates.length === 0 ? "text-green-800" : "text-ink"
                        }`}
                      >
                        {waitingTeammates.length === 0
                          ? `All ${teammates.length} checked in`
                          : `${checkedInCount} of ${teammates.length} checked in`}
                      </p>
                    </div>

                    {!confirmTeam && (waitingTeammates.length > 0 || arrivedTeammates.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {waitingTeammates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setConfirmTeam("in")}
                            disabled={teamBusy}
                            className="rounded-lg bg-bronze-deep px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-50"
                          >
                            Check in whole team ({waitingTeammates.length})
                          </button>
                        )}
                        {arrivedTeammates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setConfirmTeam("out")}
                            disabled={teamBusy}
                            className="rounded-lg border border-bronze/40 px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-sand disabled:opacity-50"
                          >
                            Undo whole team ({arrivedTeammates.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {confirmTeam && confirmList.length > 0 && (
                    <div className="mt-3 rounded-lg border border-bronze/30 bg-sand p-3">
                      <p className="text-sm text-brown">
                        {confirmTeam === "in"
                          ? `Check in ${confirmList.map((teammate) => teammate.full_name).join(", ")}? Only do this when they are all here in person.`
                          : `Undo check-in for ${confirmList.map((teammate) => teammate.full_name).join(", ")}? The team will no longer be complete.`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setWholeTeam(confirmTeam === "in")}
                          disabled={teamBusy}
                          className={`rounded-lg px-5 py-2 font-display text-xs font-semibold uppercase tracking-[0.15em] transition-colors disabled:opacity-50 ${
                            confirmTeam === "in"
                              ? "bg-bronze-deep text-cream hover:bg-bronze"
                              : "bg-red-800 text-cream hover:bg-red-700"
                          }`}
                        >
                          {teamSaving === "team"
                            ? "Working…"
                            : confirmTeam === "in"
                              ? `Yes, check in ${confirmList.length}`
                              : `Yes, undo ${confirmList.length}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmTeam(null)}
                          disabled={teamSaving === "team"}
                          className="rounded-lg border border-bronze/40 px-5 py-2 font-display text-xs font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-cream disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {teammates.map((teammate) => {
                      const isThisRider = teammate.confirmation_code === rider.confirmation_code;

                      return (
                        <li
                          key={teammate.id}
                          className={`flex flex-col rounded-lg border bg-sand p-2.5 ${
                            isThisRider ? "border-bronze ring-2 ring-bronze/40" : "border-bronze/20"
                          }`}
                        >
                          {teammate.photo_target ? (
                            <RiderHeadshotCell
                              key={`${teammate.photo_target.kind}:${teammate.photo_target.id}:${teammate.headshot_url ?? ""}`}
                              registrationId={teammate.photo_target.id}
                              kind={teammate.photo_target.kind}
                              riderName={teammate.full_name}
                              initial={{ url: teammate.headshot_url }}
                              onError={setPhotoError}
                              onChange={(url) => {
                                if (teammate.photo_target) {
                                  photoChanged(teammate.photo_target, url);
                                }
                              }}
                              boxClassName="aspect-square w-full rounded-md"
                              large
                            />
                          ) : (
                            <Headshot
                              url={teammate.headshot_url}
                              name={teammate.full_name}
                              className="aspect-square w-full rounded-md text-3xl"
                            />
                          )}
                          <p className="mt-2 font-display text-sm font-bold uppercase leading-tight tracking-wide text-bronze-dark">
                            {teammate.full_name}
                          </p>
                          <p className="text-xs text-brown/70">
                            {[teammate.is_leader ? "Team Leader" : null, isThisRider ? "This rider" : null]
                              .filter(Boolean)
                              .join(" · ") || "\u00a0"}
                          </p>
                          {/* Pinned to the bottom so the buttons line up when a
                              long name wraps onto two lines. */}
                          <div className="mt-auto flex flex-col pt-2">
                            <span
                              className={`self-start rounded-full px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${
                                teammate.checked_in_at
                                  ? "bg-green-100 text-green-900"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {teammate.checked_in_at ? "Checked in" : "Waiting"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setTeammateCheckedIn(teammate, teammate.checked_in_at === null)
                              }
                              disabled={teamBusy}
                              className={`mt-2.5 rounded-md px-3 py-2 font-display text-[0.7rem] font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
                                teammate.checked_in_at
                                  ? "border border-bronze/40 text-brown hover:bg-cream"
                                  : "bg-bronze-deep text-cream hover:bg-bronze"
                              }`}
                            >
                              {teamSaving === teammate.confirmation_code
                                ? "Working…"
                                : teammate.checked_in_at
                                  ? "Undo"
                                  : "Check in"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {waitingTeammates.length > 0 && (
                    <p className="mt-3 text-sm leading-6 text-brown/80">
                      All {teammates.length} riders must check in before this team enters the
                      brackets. Check them in one by one as they arrive, or all at once.
                    </p>
                  )}
                </section>
              )}

              {/* A team rider is checked in from their own tile in the team
                  grid above, so a second button here would look like it acts
                  on the whole team. Only a solo-only rider gets it. */}
              {!(hasTeamEntry && teammates.length > 0) && (
              <div className="flex flex-col gap-3 sm:flex-row">
                {rider.checked_in_at ? (
                  <button
                    type="button"
                    onClick={() => setCheckedIn(false)}
                    disabled={teamBusy}
                    className="rounded-lg border border-bronze/40 px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-cream disabled:opacity-50"
                  >
                    {saving ? "Working…" : "Undo Check-in"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCheckedIn(true)}
                    disabled={teamBusy}
                    className="rounded-lg bg-bronze-deep px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-50"
                  >
                    {saving ? "Working…" : "Confirm Check-in"}
                  </button>
                )}
              </div>
              )}
            </article>
          )}
        </>
      )}
    </div>
  );
}
