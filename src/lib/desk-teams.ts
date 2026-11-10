// Teams formed at the check-in desk (Form teams tab) from riders who
// registered solo and have checked in. See
// supabase/migrations/20261109120000_desk_teams.sql: the database function
// admin_desk_team checks everything again and does the work in one
// transaction; this file only turns a request body into its payload, so a
// malformed request is refused before it reaches the database.
//
// Pure and dependency-free, so `node --test` loads it directly.

export const DESK_TEAM_SIZE = 4;
export const TEAM_NAME_MAX = 100;
export const CONTACT_NAME_MAX = 200;

export type DeskTeamAction = "create" | "add" | "remove" | "update" | "delete";

export type DeskTeamRequest =
  | {
      action: "create";
      payload: {
        team_name: string;
        solo_ids: string[];
        leader_solo_id: string;
        emergency_contact_name: string;
        emergency_contact_phone: string;
      };
    }
  | { action: "add"; payload: { team_id: string; solo_ids: string[] } }
  | { action: "remove"; payload: { team_id: string; team_member_id: string } }
  | {
      action: "update";
      payload: {
        team_id: string;
        team_name?: string;
        leader_team_member_id?: string;
        emergency_contact_name?: string;
        emergency_contact_phone?: string;
      };
    }
  | { action: "delete"; payload: { team_id: string } };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const uuid = (value: unknown) =>
  typeof value === "string" && uuidPattern.test(value) ? value.toLowerCase() : null;

const text = (value: unknown, max: number) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
};

export const phoneDigits = (value: string) => value.replace(/\D/g, "");

const phone = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const digits = phoneDigits(trimmed).length;
  return digits >= 7 && digits <= 15 && trimmed.length <= 40 ? trimmed : null;
};

/* 1 to 4 distinct rider ids, or null. */
const soloIds = (value: unknown, max: number) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    return null;
  }

  const ids = value.map(uuid);

  if (ids.some((id) => id === null)) {
    return null;
  }

  const distinct = [...new Set(ids as string[])];
  return distinct.length === ids.length ? distinct : null;
};

export type ParseResult = { ok: true; request: DeskTeamRequest } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

export const parseDeskTeamRequest = (body: unknown): ParseResult => {
  if (!isRecord(body)) {
    return fail("Invalid request.");
  }

  const action = body.action;

  if (action === "create") {
    const teamName = text(body.team_name, TEAM_NAME_MAX);
    const ids = soloIds(body.solo_ids, DESK_TEAM_SIZE);
    const leader = uuid(body.leader_solo_id);
    const contactName = text(body.emergency_contact_name, CONTACT_NAME_MAX);
    const contactPhone = phone(body.emergency_contact_phone);

    if (!teamName) return fail(`Enter a team name (up to ${TEAM_NAME_MAX} characters).`);
    if (!ids) return fail(`Choose 1 to ${DESK_TEAM_SIZE} riders.`);
    if (!leader || !ids.includes(leader)) return fail("Choose the team leader from the riders on the team.");
    if (!contactName) return fail("Enter the team's emergency contact name.");
    if (!contactPhone) return fail("Enter the team's emergency contact phone number.");

    return {
      ok: true,
      request: {
        action,
        payload: {
          team_name: teamName,
          // Leader first, so the team's roster reads leader-first.
          solo_ids: [leader, ...ids.filter((id) => id !== leader)],
          leader_solo_id: leader,
          emergency_contact_name: contactName,
          emergency_contact_phone: contactPhone,
        },
      },
    };
  }

  const teamId = uuid(body.team_id);

  if (action !== "add" && action !== "remove" && action !== "update" && action !== "delete") {
    return fail("Unknown team action.");
  }

  if (!teamId) {
    return fail("That team could not be found. Refresh the list.");
  }

  if (action === "add") {
    const ids = soloIds(body.solo_ids, DESK_TEAM_SIZE);
    return ids
      ? { ok: true, request: { action, payload: { team_id: teamId, solo_ids: ids } } }
      : fail(`Choose 1 to ${DESK_TEAM_SIZE} riders.`);
  }

  if (action === "remove") {
    const memberId = uuid(body.team_member_id);
    return memberId
      ? { ok: true, request: { action, payload: { team_id: teamId, team_member_id: memberId } } }
      : fail("That rider is not on this team. Refresh the list.");
  }

  if (action === "delete") {
    return { ok: true, request: { action, payload: { team_id: teamId } } };
  }

  const payload: Extract<DeskTeamRequest, { action: "update" }>["payload"] = { team_id: teamId };

  if (body.team_name !== undefined) {
    const teamName = text(body.team_name, TEAM_NAME_MAX);
    if (!teamName) return fail(`Enter a team name (up to ${TEAM_NAME_MAX} characters).`);
    payload.team_name = teamName;
  }

  if (body.leader_team_member_id !== undefined) {
    const leader = uuid(body.leader_team_member_id);
    if (!leader) return fail("Choose the new leader from this team.");
    payload.leader_team_member_id = leader;
  }

  if (body.emergency_contact_name !== undefined || body.emergency_contact_phone !== undefined) {
    const contactName = text(body.emergency_contact_name, CONTACT_NAME_MAX);
    const contactPhone = phone(body.emergency_contact_phone);
    if (!contactName) return fail("Enter the team's emergency contact name.");
    if (!contactPhone) return fail("Enter the team's emergency contact phone number.");
    payload.emergency_contact_name = contactName;
    payload.emergency_contact_phone = contactPhone;
  }

  if (Object.keys(payload).length === 1) {
    return fail("Nothing to change.");
  }

  return { ok: true, request: { action, payload } };
};
