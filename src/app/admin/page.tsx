import type { Metadata } from "next";
import Link from "next/link";
import { DISPLAY_MODE_CHOICES } from "@/components/scoring/format";
import { isPaperPlaceholderEmail } from "@/lib/paper-registration";
import { isSoloSampleOn } from "@/lib/scoring/rehearsal";
import { site } from "@/lib/site";
import { AdminAccessMessage, getAdminAccess } from "./admin-access";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: `Admin dashboard for the ${site.title}.`,
  robots: { index: false, follow: false },
};

const RECENT_ACTIVITY = 6;

type SoloRow = {
  confirmation_code: string;
  checked_in_at: string | null;
  email: string;
  location: string | null;
  created_at: string;
};
type MemberRow = {
  confirmation_code: string;
  checked_in_at: string | null;
  team_id: string;
  location: string | null;
  created_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/* How many places "Riders from" lists before folding the rest into "+N more". */
const PLACES_SHOWN = 6;

/* Today's date in Amritsar, as a day number, whatever the server's clock. */
const todayInAmritsar = () => {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};
const dayNumber = (calendarDate: string) => Date.parse(`${calendarDate} UTC`) / DAY_MS;

/* "in 10 days", "tomorrow", "today", or null once it has passed. */
const countdownTo = (calendarDate: string) => {
  const days = Math.round(dayNumber(calendarDate) - todayInAmritsar());

  if (Number.isNaN(days) || days < 0) {
    return null;
  }

  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
};

/* A rider's place from their registered location ("Village, District, State,
   Country"): the state for riders in India, the country for everyone else,
   so the list reads "Punjab · Haryana · Canada". */
const placeOf = (location: string | null) => {
  const parts = (location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const country = parts[parts.length - 1];

  if (parts.length >= 2 && /^india$/i.test(country)) {
    return parts[parts.length - 2];
  }

  return country;
};
type TeamRow = { id: string; leader_profile_id: string | null; created_at: string };
type AuditRow = {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  target_table: string | null;
  details: Record<string, unknown> | null;
};

/* Times are shown in Amritsar time whatever the server's clock is set to. */
const TIME_ZONE = "Asia/Kolkata";
const timeOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const dateAndTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dayOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
});
/* site.eventDate is a calendar date, so it is formatted as UTC to keep the day. */
const longDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const formatCalendarDate = (value: string) => {
  const parsed = Date.parse(`${value} UTC`);
  return Number.isNaN(parsed) ? value : longDate.format(parsed);
};

/* Audit actions read better with a few hand-written labels; the rest are
   title-cased from the action name, as on the Audit log page. */
const ACTION_LABELS: Record<string, string> = {
  paper_registration: "Paper registration entered",
  set_role: "Change role",
  rescore: "Change result",
  clear_score: "Clear result",
  void_run: "Skip run",
  restore_run: "Restore run",
  move_pool: "Change pool",
  set_live: "Update live display",
  check_in_rider: "Check in rider",
  undo_check_in_rider: "Undo check-in",
};
const formatAction = (action: string) => {
  const label = ACTION_LABELS[action] ?? action.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const describeDetails = (entry: AuditRow) => {
  const details = entry.details ?? {};
  const pick = (key: string) => (typeof details[key] === "string" ? (details[key] as string) : null);

  return (
    pick("subject_name") ??
    pick("round_name") ??
    pick("full_name") ??
    pick("team_name") ??
    (entry.target_table ? entry.target_table.replace(/_/g, " ") : "—")
  );
};

const panel = "rounded-lg border border-bronze/20 bg-sand p-4 sm:p-5";
const panelTitle = "font-display text-lg font-bold uppercase tracking-wide text-ink";
const panelIntro = "mt-0.5 text-sm text-brown/75";
const eyebrow = "font-display text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink";
/* The small "go to" buttons on the Overview: a pill with the label in the
   dashboard's display type and a chevron, filling in on hover. */
function GoLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-bronze/30 bg-cream px-3 py-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-bronze-deep transition-colors hover:border-bronze-deep hover:bg-bronze-deep hover:text-cream ${className}`}
    >
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5"
      >
        <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function StatBlock({
  label,
  value,
  href,
  linkLabel,
}: {
  label: string;
  value: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="px-1 sm:px-5">
      <p className={eyebrow}>{label}</p>
      <p className="mt-2 whitespace-nowrap font-display text-3xl font-bold text-bronze-dark">{value}</p>
      <GoLink href={href} className="mt-2">
        {linkLabel}
      </GoLink>
    </div>
  );
}

function DetailRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-brown/75">{term}</dt>
      <dd className="text-ink sm:whitespace-nowrap">{children}</dd>
    </div>
  );
}

/* /admin: the dashboard's home. Registrations, check-in, what is live, what
   the screens show and the latest activity, at a glance, with a way into each
   section. Every number here is read live from the database. */
export default async function AdminOverviewPage() {
  const access = await getAdminAccess();

  if (access.kind !== "admin") {
    return <AdminAccessMessage title="Admin Dashboard" kind={access.kind} redirect="/admin" />;
  }

  const { supabase } = access;
  const [solo, teams, members, live, audit, rehearsalOn] = await Promise.all([
    supabase
      .from("solo_registrations")
      .select("confirmation_code, checked_in_at, email, location, created_at"),
    supabase.from("teams").select("id, leader_profile_id, created_at"),
    supabase
      .from("team_members")
      .select("confirmation_code, checked_in_at, team_id, location, created_at"),
    supabase
      .from("scoring_live_state")
      .select("current_round_id, called_pool_label, display_mode, message, updated_at")
      .eq("id", true)
      .maybeSingle(),
    supabase
      .from("admin_audit_log")
      .select("id, created_at, actor_name, action, target_table, details")
      .order("created_at", { ascending: false })
      .limit(RECENT_ACTIVITY),
    isSoloSampleOn(),
  ]);

  const soloRows = (solo.data ?? []) as SoloRow[];
  const memberRows = (members.data ?? []) as MemberRow[];
  const teamRows = (teams.data ?? []) as TeamRow[];
  const activity = (audit.error ? [] : audit.data ?? []) as AuditRow[];

  // One rider per confirmation code: a rider in both events counts once.
  const riders = new Map<string, boolean>();
  for (const row of [...soloRows, ...memberRows]) {
    riders.set(
      row.confirmation_code,
      (riders.get(row.confirmation_code) ?? false) || row.checked_in_at !== null
    );
  }
  const ridersIn = [...riders.values()].filter(Boolean).length;

  // Entries keyed in from the printed forms: a solo rider stored under a
  // placeholder email, and a team with no leader account.
  const paperEntries =
    soloRows.filter((row) => isPaperPlaceholderEmail(row.email)).length +
    teamRows.filter((team) => team.leader_profile_id === null).length;
  // Riders, once each (a rider in both events shares one code): where they
  // come from.
  const ridersByCode = new Map<string, { location: string | null; created_at: string }>();
  for (const row of [...soloRows, ...memberRows]) {
    const known = ridersByCode.get(row.confirmation_code);
    if (!known || Date.parse(row.created_at) < Date.parse(known.created_at)) {
      ridersByCode.set(row.confirmation_code, { location: known?.location ?? row.location, created_at: row.created_at });
    }
  }
  const placeCounts = new Map<string, number>();
  for (const rider of ridersByCode.values()) {
    const place = placeOf(rider.location);
    if (place) {
      placeCounts.set(place, (placeCounts.get(place) ?? 0) + 1);
    }
  }
  const places = [...placeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const checkInCountdown = countdownTo(site.checkInDate);
  const eventCountdown = countdownTo(site.eventDate);

  const latestRegistration = [...soloRows, ...teamRows]
    .map((row) => Date.parse(row.created_at))
    .filter((time) => !Number.isNaN(time))
    .sort((first, second) => second - first)[0];

  // Live scoring may not be set up; read whatever is there.
  const liveState = live.error ? null : live.data;
  const activeMode = liveState?.display_mode ?? null;
  const modeLabel =
    DISPLAY_MODE_CHOICES.find((choice) => choice.mode === activeMode)?.label ?? activeMode ?? "—";
  const screensHidden = activeMode === "blank";

  return (
    <section className="bg-cream">
      <div className="px-6 py-6 sm:py-8">
        {/* Heading */}
        <header className="flex flex-col gap-3 border-b border-bronze/20 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-bronze-dark">
              Admin dashboard
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-ink sm:text-3xl">
              {site.title}
            </h1>
            <p className="mt-1 text-sm text-brown/75">
              Event overview, registrations, check-in and live competition status.
            </p>
          </div>

          {/* Countdown, in Amritsar days. */}
          <div className="flex shrink-0 gap-2">
            {[
              { label: "Check-in", when: checkInCountdown },
              { label: "Event", when: eventCountdown },
            ].map(({ label, when }) => (
              <div
                key={label}
                className={`rounded-lg border px-3 py-1.5 text-center ${
                  when === "today"
                    ? "border-bronze-deep bg-bronze-deep text-cream"
                    : "border-bronze/25 bg-sand text-ink"
                }`}
              >
                <p
                  className={`font-display text-[0.65rem] font-semibold uppercase tracking-[0.2em] ${
                    when === "today" ? "text-cream/80" : "text-brown/65"
                  }`}
                >
                  {label}
                </p>
                <p className="font-display text-base font-bold uppercase tracking-wide">
                  {when ?? "Done"}
                </p>
              </div>
            ))}
          </div>
        </header>

        {screensHidden && (
          <p className="mt-4 rounded-lg border-l-4 border-amber-600 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            The screens are set to <strong>Blank</strong>: the public scoreboard and the stream
            graphics show nothing. Change it under{" "}
            <Link href="/admin/scoring" className="font-semibold underline">
              Scoring › Screens
            </Link>
            .
          </p>
        )}

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-bronze/20 py-5 sm:gap-6 sm:divide-bronze/20 xl:grid-cols-4 xl:divide-x">
          <StatBlock
            label="Solo riders"
            value={String(soloRows.length)}
            href="/admin/solo"
            linkLabel="View riders"
          />
          <StatBlock
            label="Teams"
            value={String(teamRows.length)}
            href="/admin/teams"
            linkLabel="View teams"
          />
          <StatBlock
            label="Check-in"
            value={`${ridersIn} / ${riders.size}`}
            href="/admin/check-in"
            linkLabel="View check-in"
          />
          <StatBlock
            label="Paper entries"
            value={String(paperEntries)}
            href="/admin/paper"
            linkLabel="Add paper entry"
          />
        </div>

        {/* Live display and recent activity */}
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-labelledby="overview-live" className={panel}>
            <h2 id="overview-live" className={panelTitle}>
              Live display
            </h2>
            <p className={panelIntro}>
              What the public scoreboard and the stream graphics are set to show.
            </p>

            <dl className="mt-3 grid divide-y divide-bronze/10 rounded-lg border border-bronze/15 bg-cream px-4 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 xl:grid-cols-1 xl:divide-y">
              <DetailRow term="Display mode">{liveState ? modeLabel : "—"}</DetailRow>
              <DetailRow term="Rehearsal feed">
                {rehearsalOn ? "Running (sample solo)" : "Stopped"}
              </DetailRow>
              <DetailRow term="Screen output">
                {liveState ? (
                  screensHidden ? (
                    <span className="text-amber-800">Hidden (Blank)</span>
                  ) : (
                    "Active"
                  )
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow term="Last updated">
                {liveState?.updated_at ? dateAndTime.format(new Date(liveState.updated_at)) : "—"}
              </DetailRow>
              {liveState?.message && (
                <div className="sm:col-span-2 xl:col-span-1">
                  <DetailRow term="Message">
                    <span className="whitespace-normal">{liveState.message}</span>
                  </DetailRow>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs text-brown/65">
              Change what the screens show from the Screens card on the{" "}
              <Link href="/admin/scoring" className="underline hover:text-bronze">
                Scoring page
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="overview-activity" className={`${panel} flex flex-col`}>
            <h2 id="overview-activity" className={panelTitle}>
              Recent activity
            </h2>
            <p className={panelIntro}>Latest actions from administrators, judges and commentators.</p>

            {activity.length === 0 ? (
              <p className="mt-3 rounded-lg border border-bronze/15 bg-cream p-4 text-sm text-brown/75">
                Nothing logged yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-bronze/15 bg-cream">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="bg-sand">
                    <tr>
                      {["Time", "User", "Action", "Details"].map((heading) => (
                        <th
                          key={heading}
                          className="px-3 py-2 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bronze/10">
                    {activity.map((entry) => {
                      const when = new Date(entry.created_at);
                      const today = dayOnly.format(when) === dayOnly.format(new Date());

                      return (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-ink">
                            {timeOnly.format(when)}
                            {!today && (
                              <span className="ml-1.5 text-xs text-brown/60">{dayOnly.format(when)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-ink">{entry.actor_name || "—"}</td>
                          <td className="px-3 py-2 text-ink">{formatAction(entry.action)}</td>
                          <td className="px-3 py-2 text-ink">{describeDetails(entry)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-auto pt-3 text-right">
              <GoLink href="/admin/audit">View full audit log</GoLink>
            </div>
          </section>
        </div>

        {/* Registration details and where riders come from */}
        <section aria-labelledby="overview-registrations" className={`mt-5 ${panel}`}>
          <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-bronze/20">
            <div>
              <h2 id="overview-registrations" className={panelTitle}>
                Registration details
              </h2>
              <dl className="mt-2 divide-y divide-bronze/15">
                <DetailRow term="Check-in date">{formatCalendarDate(site.checkInDate)}</DetailRow>
                <DetailRow term="Event date">{formatCalendarDate(site.eventDate)}</DetailRow>
                <DetailRow term="Latest registration">
                  {latestRegistration ? dateAndTime.format(latestRegistration) : "—"}
                </DetailRow>
              </dl>
            </div>

            {/* Where riders come from: the state for riders in India, the
                country for everyone else. */}
            <div className="lg:pl-6">
              <div className="rounded-lg border border-bronze/15 bg-cream p-3">
                <p className={eyebrow}>Riders from</p>
                {places.length === 0 ? (
                  <p className="mt-2 text-sm text-brown/70">No locations yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {places.slice(0, PLACES_SHOWN).map(([place, count]) => (
                      <li key={place} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-ink">{place}</span>
                        <span className="shrink-0 font-display font-bold text-bronze-dark">{count}</span>
                      </li>
                    ))}
                    {places.length > PLACES_SHOWN && (
                      <li className="text-xs text-brown/60">
                        +{places.length - PLACES_SHOWN} more{" "}
                        {places.length - PLACES_SHOWN === 1 ? "place" : "places"}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
