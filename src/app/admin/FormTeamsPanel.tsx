"use client";

/* Form teams: the third switch on the Check-in tab.

   Most riders registered solo although they ride with a team. Here the desk
   puts riders who have already checked in onto a team: a new team of 1 to 4,
   or a missing rider added to a team made here earlier. Each rider keeps
   their solo entry, code and check-in; nothing is emailed.

   Teams made here can be renamed, given a new leader or emergency contact,
   have a rider removed, or be deleted. Teams registered online or on paper
   are never changed from here. A team rides only once it has 4 riders, all
   checked in (the same rule as every team). All checks happen again in the
   database (supabase/migrations/20261109120000_desk_teams.sql). */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeskTeam, DeskTeamRider } from "@/app/api/admin/desk-teams/route";
import { DESK_TEAM_SIZE } from "@/lib/desk-teams";
import { switchClass } from "./CheckInStatus";

/* Refreshed this often while on screen, so two desks see each other's teams. */
const REFRESH_MS = 10_000;

const label = "font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink";
const input =
  "w-full rounded-lg border border-bronze/40 bg-cream px-3 py-2.5 text-ink outline-none focus:border-bronze";
const primary =
  "rounded-lg bg-bronze-deep px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-50";
const quiet =
  "rounded-lg border border-bronze/40 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown transition-colors hover:bg-cream disabled:opacity-50";
const danger =
  "rounded-lg border border-red-700/30 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-red-800 transition-colors hover:border-red-700/60 disabled:opacity-50";
const dangerSolid =
  "rounded-lg bg-red-800 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-red-700 disabled:opacity-50";

type ListResponse = { riders?: DeskTeamRider[]; teams?: DeskTeam[]; error?: string };

const matches = (rider: DeskTeamRider, query: string) => {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  const digits = needle.replace(/\D/g, "");

  return (
    rider.full_name.toLowerCase().includes(needle) ||
    rider.confirmation_code.toLowerCase().includes(needle) ||
    rider.location.toLowerCase().includes(needle) ||
    (digits.length >= 3 && rider.phone.replace(/\D/g, "").includes(digits))
  );
};

/* Checked-in solo riders not on a team, to tick onto one. */
function RiderPicker({
  riders,
  selected,
  max,
  onToggle,
  idPrefix,
}: {
  riders: DeskTeamRider[];
  selected: string[];
  max: number;
  onToggle: (id: string) => void;
  idPrefix: string;
}) {
  const [query, setQuery] = useState("");
  const shown = riders.filter((rider) => selected.includes(rider.id) || matches(rider, query));
  const full = selected.length >= max;

  return (
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-search`} className={label}>
        Checked-in riders not on a team
        <span className="ml-2 normal-case tracking-normal text-brown/60">
          {selected.length} of {max} chosen
        </span>
      </label>
      <input
        id={`${idPrefix}-search`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name, code, phone or village"
        autoComplete="off"
        className={input}
      />
      {riders.length === 0 ? (
        <p className="text-sm text-brown/70">
          No checked-in solo riders are free. Check riders in at the desk first.
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-bronze/10 overflow-y-auto rounded-lg border border-bronze/20 bg-sand">
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-brown/70">No match.</li>}
          {shown.map((rider) => {
            const isSelected = selected.includes(rider.id);

            return (
              <li key={rider.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onToggle(rider.id)}
                  disabled={!isSelected && full}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-40 ${
                    isSelected ? "bg-bronze/15" : "hover:bg-cream"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                      isSelected ? "border-bronze-deep bg-bronze-deep text-cream" : "border-bronze/40"
                    }`}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-bronze-dark">
                      {rider.full_name}
                    </span>
                    <span className="block truncate text-xs text-brown/70">
                      {rider.location}
                      {rider.horse_name ? ` · ${rider.horse_name}` : ""} · {rider.phone}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tracking-[0.1em] text-bronze-deep">
                    {rider.confirmation_code}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function FormTeamsPanel() {
  const [riders, setRiders] = useState<DeskTeamRider[] | null>(null);
  const [teams, setTeams] = useState<DeskTeam[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Which action is saving, so only its button says "Working…". */
  const [busy, setBusy] = useState<string | null>(null);
  /* An action waiting for its "Yes": a key naming it. */
  const [confirming, setConfirming] = useState<string | null>(null);

  // New team.
  const [chosen, setChosen] = useState<string[]>([]);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  /* Once the desk types a contact, a new leader no longer overwrites it. */
  const [contactEdited, setContactEdited] = useState(false);

  // Editing an existing team: which team, and what.
  const [adding, setAdding] = useState<{ teamId: string; ids: string[] } | null>(null);
  const [renaming, setRenaming] = useState<{ teamId: string; name: string } | null>(null);
  const [editingContact, setEditingContact] = useState<{
    teamId: string;
    name: string;
    phone: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/desk-teams", { cache: "no-store" });
      const result = (await response.json()) as ListResponse;

      if (!response.ok || !result.riders || !result.teams) {
        setLoadError(result.error ?? "Could not load riders and teams.");
        return;
      }

      setRiders(result.riders);
      setTeams(result.teams);
      setLoadError(null);
    } catch {
      setLoadError("Could not reach the server. Check the connection.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, REFRESH_MS);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const byId = useMemo(() => new Map((riders ?? []).map((rider) => [rider.id, rider])), [riders]);

  /* The leader's own emergency contact fills the team's, until edited. */
  const pickLeader = (id: string) => {
    setLeaderId(id);
    const leader = byId.get(id);

    if (leader && !contactEdited) {
      setContactName(leader.emergency_contact_name ?? "");
      setContactPhone(leader.emergency_contact_phone ?? "");
    }
  };

  const toggleChosen = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id];
    setChosen(next);
    setConfirming(null);

    if (!next.includes(leaderId ?? "")) {
      if (next[0]) {
        pickLeader(next[0]);
      } else {
        setLeaderId(null);
      }
    }
  };

  const resetNewTeam = () => {
    setChosen([]);
    setLeaderId(null);
    setTeamName("");
    setContactName("");
    setContactPhone("");
    setContactEdited(false);
  };

  /* Sends one change; on success shows `message`, runs `after` and reloads. */
  const send = async (key: string, body: Record<string, unknown>, message: string, after?: () => void) => {
    setBusy(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/desk-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Could not save that change.");
        return;
      }

      setNotice(message);
      setConfirming(null);
      after?.();
    } catch {
      setError("Could not reach the server. Nothing was saved. Try again.");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const chosenRiders = chosen.map((id) => byId.get(id)).filter(Boolean) as DeskTeamRider[];
  const leader = leaderId ? byId.get(leaderId) : undefined;
  const newTeamReady =
    chosen.length > 0 &&
    Boolean(leader) &&
    teamName.trim() !== "" &&
    contactName.trim() !== "" &&
    contactPhone.replace(/\D/g, "").length >= 7;

  const createTeam = () =>
    send(
      "create",
      {
        action: "create",
        team_name: teamName,
        solo_ids: chosen,
        leader_solo_id: leaderId,
        emergency_contact_name: contactName,
        emergency_contact_phone: contactPhone,
      },
      `Team ${teamName.trim()} saved with ${chosen.length} ${chosen.length === 1 ? "rider" : "riders"}.${
        chosen.length < DESK_TEAM_SIZE ? ` Add ${DESK_TEAM_SIZE - chosen.length} more below when they arrive.` : ""
      }`,
      resetNewTeam
    );

  if (riders === null) {
    return (
      <p className="text-brown/70">{loadError ?? "Loading riders and teams…"}</p>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-brown/80">
        Put riders who registered solo onto a team. Only riders who have checked in are listed.
        Each keeps their solo entry and their code; nothing is emailed. A team rides once it has{" "}
        {DESK_TEAM_SIZE} riders, all checked in.
      </p>

      {loadError && (
        <p className="rounded-lg border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-amber-900">
          {loadError} Showing the last list.
        </p>
      )}
      {error && (
        <p className="rounded-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 text-red-900">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border-l-4 border-green-700 bg-green-50 px-4 py-3 text-green-900">
          {notice}
        </p>
      )}

      <section aria-labelledby="form-new-team" className="space-y-4 rounded-lg border border-bronze/20 bg-sand p-4 sm:p-6">
        <h3
          id="form-new-team"
          className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark"
        >
          New team
        </h3>

        <RiderPicker
          riders={riders}
          selected={chosen}
          max={DESK_TEAM_SIZE}
          onToggle={toggleChosen}
          idPrefix="new-team"
        />

        {chosenRiders.length > 0 && (
          <div className="space-y-2">
            <p className={label}>Team leader</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team leader">
              {chosenRiders.map((rider) => (
                <button
                  key={rider.id}
                  type="button"
                  role="radio"
                  aria-checked={leaderId === rider.id}
                  onClick={() => pickLeader(rider.id)}
                  className={switchClass(leaderId === rider.id)}
                >
                  {rider.full_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="new-team-name" className={label}>
              Team name
            </label>
            <input
              id="new-team-name"
              value={teamName}
              maxLength={100}
              onChange={(event) => setTeamName(event.target.value)}
              autoComplete="off"
              className={input}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-team-contact" className={label}>
              Emergency contact
            </label>
            <input
              id="new-team-contact"
              value={contactName}
              onChange={(event) => {
                setContactName(event.target.value);
                setContactEdited(true);
              }}
              autoComplete="off"
              className={input}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-team-phone" className={label}>
              Emergency phone
            </label>
            <input
              id="new-team-phone"
              type="tel"
              value={contactPhone}
              onChange={(event) => {
                setContactPhone(event.target.value);
                setContactEdited(true);
              }}
              autoComplete="off"
              className={input}
            />
          </div>
        </div>
        {leader && !contactEdited && (
          <p className="text-xs text-brown/60">
            Emergency contact filled in from {leader.full_name}&apos;s form. Change it if needed.
          </p>
        )}

        {confirming === "create" ? (
          <div className="space-y-3 rounded-lg border border-bronze/30 bg-cream p-3">
            <p className="text-sm text-brown">
              Save <strong>{teamName.trim()}</strong> with {chosenRiders.map((rider) => rider.full_name).join(", ")}
              {leader ? `, led by ${leader.full_name}` : ""}?
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={createTeam} disabled={busy !== null} className={primary}>
                {busy === "create" ? "Working…" : "Yes, save team"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} disabled={busy === "create"} className={quiet}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirming("create")}
              disabled={!newTeamReady || busy !== null}
              className={primary}
            >
              Save team ({chosen.length})
            </button>
            {chosen.length > 0 && (
              <button type="button" onClick={resetNewTeam} disabled={busy !== null} className={quiet}>
                Clear
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="form-desk-teams" className="space-y-4">
        <h3
          id="form-desk-teams"
          className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark"
        >
          Teams formed here ({teams.length})
        </h3>

        {teams.length === 0 && <p className="text-brown/70">No teams formed at the desk yet.</p>}

        {teams.map((team) => {
          const arrived = team.members.filter((member) => member.checked_in_at).length;
          const complete = team.members.length === DESK_TEAM_SIZE && arrived === DESK_TEAM_SIZE;
          const room = DESK_TEAM_SIZE - team.members.length;
          const isAdding = adding?.teamId === team.id;
          const isRenaming = renaming?.teamId === team.id;
          const isEditingContact = editingContact?.teamId === team.id;

          return (
            <article
              key={team.id}
              className={`space-y-4 rounded-lg border p-4 ${
                complete ? "border-green-700/30 bg-green-50/60" : "border-bronze/20 bg-sand"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {isRenaming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label="New team name"
                        value={renaming.name}
                        maxLength={100}
                        onChange={(event) => setRenaming({ teamId: team.id, name: event.target.value })}
                        className={`${input} max-w-xs`}
                      />
                      <button
                        type="button"
                        disabled={busy !== null || renaming.name.trim() === ""}
                        onClick={() =>
                          send(
                            `rename:${team.id}`,
                            { action: "update", team_id: team.id, team_name: renaming.name },
                            `Team renamed to ${renaming.name.trim()}.`,
                            () => setRenaming(null)
                          )
                        }
                        className={primary}
                      >
                        {busy === `rename:${team.id}` ? "Working…" : "Save name"}
                      </button>
                      <button type="button" onClick={() => setRenaming(null)} className={quiet}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="font-display text-base font-bold uppercase tracking-wide text-bronze-dark">
                      {team.team_name}
                    </p>
                  )}
                  <p
                    className={`font-display text-xs font-semibold uppercase tracking-[0.12em] ${
                      complete ? "text-green-800" : "text-ink"
                    }`}
                  >
                    {complete
                      ? `All ${DESK_TEAM_SIZE} checked in — ready to ride`
                      : `${team.members.length} of ${DESK_TEAM_SIZE} riders${
                          team.members.length ? ` · ${arrived} checked in` : ""
                        }`}
                    {team.drawn && " · in the scoring draw"}
                  </p>
                  <p className="mt-1 text-xs text-brown/70">
                    Emergency: {team.emergency_contact_name ?? "—"} · {team.emergency_contact_phone ?? "—"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!team.drawn && room > 0 && !isAdding && (
                    <button
                      type="button"
                      onClick={() => {
                        setAdding({ teamId: team.id, ids: [] });
                        setConfirming(null);
                      }}
                      disabled={busy !== null}
                      className={primary}
                    >
                      Add rider ({room} open)
                    </button>
                  )}
                  {!isRenaming && (
                    <button
                      type="button"
                      onClick={() => setRenaming({ teamId: team.id, name: team.team_name })}
                      disabled={busy !== null}
                      className={quiet}
                    >
                      Rename
                    </button>
                  )}
                  {!isEditingContact && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingContact({
                          teamId: team.id,
                          name: team.emergency_contact_name ?? "",
                          phone: team.emergency_contact_phone ?? "",
                        })
                      }
                      disabled={busy !== null}
                      className={quiet}
                    >
                      Emergency contact
                    </button>
                  )}
                  {!team.drawn && confirming !== `delete:${team.id}` && (
                    <button
                      type="button"
                      onClick={() => setConfirming(`delete:${team.id}`)}
                      disabled={busy !== null}
                      className={danger}
                    >
                      Delete team
                    </button>
                  )}
                </div>
              </div>

              {confirming === `delete:${team.id}` && (
                <div className="space-y-3 rounded-lg border border-red-700/30 bg-red-50 p-3">
                  <p className="text-sm text-red-900">
                    Delete {team.team_name}? Its riders stay registered as solo riders, still checked in.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        send(`delete:${team.id}`, { action: "delete", team_id: team.id }, `${team.team_name} deleted. Its riders are solo riders again.`)
                      }
                      className={dangerSolid}
                    >
                      {busy === `delete:${team.id}` ? "Working…" : "Yes, delete team"}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={quiet}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isEditingContact && (
                <div className="grid gap-3 rounded-lg border border-bronze/30 bg-cream p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <label htmlFor={`contact-${team.id}`} className={label}>
                      Emergency contact
                    </label>
                    <input
                      id={`contact-${team.id}`}
                      value={editingContact.name}
                      onChange={(event) => setEditingContact({ ...editingContact, name: event.target.value })}
                      className={input}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`phone-${team.id}`} className={label}>
                      Emergency phone
                    </label>
                    <input
                      id={`phone-${team.id}`}
                      type="tel"
                      value={editingContact.phone}
                      onChange={(event) => setEditingContact({ ...editingContact, phone: event.target.value })}
                      className={input}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        send(
                          `contact:${team.id}`,
                          {
                            action: "update",
                            team_id: team.id,
                            emergency_contact_name: editingContact.name,
                            emergency_contact_phone: editingContact.phone,
                          },
                          `Emergency contact for ${team.team_name} updated.`,
                          () => setEditingContact(null)
                        )
                      }
                      className={primary}
                    >
                      {busy === `contact:${team.id}` ? "Working…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingContact(null)} className={quiet}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <ul className="divide-y divide-bronze/10 overflow-hidden rounded-lg border border-bronze/20 bg-cream">
                {team.members.map((member) => {
                  const removeKey = `remove:${member.id}`;

                  return (
                    <li key={member.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold uppercase tracking-wide text-bronze-dark">
                          {member.full_name}
                          {member.is_leader && (
                            <span className="ml-2 rounded bg-bronze/15 px-1.5 py-0.5 text-[0.65rem] tracking-[0.12em] text-bronze-deep">
                              Leader
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-brown/70">
                          <span className="font-mono tracking-[0.1em]">{member.confirmation_code}</span>
                          {" · "}
                          {member.checked_in_at ? "Checked in" : "Not checked in"}
                        </p>
                      </div>
                      {confirming === removeKey ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-brown">Take {member.full_name} off this team?</span>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              send(
                                removeKey,
                                { action: "remove", team_id: team.id, team_member_id: member.id },
                                `${member.full_name} is off ${team.team_name}. They are still a solo rider and still checked in.`
                              )
                            }
                            className={dangerSolid}
                          >
                            {busy === removeKey ? "Working…" : "Yes, remove"}
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} className={quiet}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {!member.is_leader && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                send(
                                  `leader:${member.id}`,
                                  { action: "update", team_id: team.id, leader_team_member_id: member.id },
                                  `${member.full_name} now leads ${team.team_name}.`
                                )
                              }
                              className={quiet}
                            >
                              {busy === `leader:${member.id}` ? "Working…" : "Make leader"}
                            </button>
                          )}
                          {!team.drawn && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => setConfirming(removeKey)}
                              className={danger}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {isAdding && (
                <div className="space-y-3 rounded-lg border border-bronze/30 bg-cream p-3">
                  <RiderPicker
                    riders={riders}
                    selected={adding.ids}
                    max={room}
                    idPrefix={`add-${team.id}`}
                    onToggle={(id) =>
                      setAdding({
                        teamId: team.id,
                        ids: adding.ids.includes(id)
                          ? adding.ids.filter((other) => other !== id)
                          : [...adding.ids, id],
                      })
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null || adding.ids.length === 0}
                      onClick={() => {
                        const names = adding.ids.map((id) => byId.get(id)?.full_name ?? "Rider").join(", ");
                        void send(
                          `add:${team.id}`,
                          { action: "add", team_id: team.id, solo_ids: adding.ids },
                          `${names} added to ${team.team_name}.`,
                          () => setAdding(null)
                        );
                      }}
                      className={primary}
                    >
                      {busy === `add:${team.id}` ? "Working…" : `Add to team (${adding.ids.length})`}
                    </button>
                    <button type="button" onClick={() => setAdding(null)} className={quiet}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
