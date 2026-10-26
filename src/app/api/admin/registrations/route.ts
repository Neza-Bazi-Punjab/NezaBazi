import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  verifyAdminRequest,
} from "@/lib/admin/server";
import { isValidEmail } from "@/lib/email-address";
import { PAPER_EMAIL_DOMAIN, isPaperPlaceholderEmail } from "@/lib/paper-registration";

export const dynamic = "force-dynamic";

type RegistrationOperation =
  | "edit_solo"
  | "delete_solo"
  | "edit_team"
  | "delete_team";

const registrationOperations: readonly RegistrationOperation[] = [
  "edit_solo",
  "delete_solo",
  "edit_team",
  "delete_team",
];

/* Shared rider fields, all required except the parents' names. Both
   horse_name columns are nullable and neither carries a required-check, so
   this route and the dashboard are what enforce it. */
type EditableRegistration = {
  id?: string;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_name: string;
  horse_age: number;
  horse_breed: string;
  /* Optional: collected to help the announcer, never to gate an entry, and
     every rider who registered before the fields existed has neither. Empty
     clears the stored name; an absent key leaves it as it is. */
  father_name?: string | null;
  mother_name?: string | null;
};

/* A solo entrant carries their own emergency contact. A team's is one per
   team, on `teams`, so it is not part of the rider shape. */
type EditableSoloRegistration = EditableRegistration & {
  emergency_contact_name: string;
  emergency_contact_phone: string;
};

const PARENT_NAME_MAX_LENGTH = 200;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBoundedString = (value: unknown, maxLength: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

/* Absent, null, empty or a string within the cap. */
const isOptionalBoundedString = (value: unknown, maxLength: number) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.length <= maxLength);

const isIntegerInRange = (value: unknown, minimum: number, maximum: number) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum;

const isEditableRegistration = (
  value: unknown,
  requireId: boolean
): value is EditableRegistration => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (!requireId || (typeof value.id === "string" && uuidPattern.test(value.id))) &&
    isBoundedString(value.full_name, 200) &&
    isOptionalBoundedString(value.father_name, PARENT_NAME_MAX_LENGTH) &&
    isOptionalBoundedString(value.mother_name, PARENT_NAME_MAX_LENGTH) &&
    isIntegerInRange(value.age, 1, 120) &&
    isBoundedString(value.location, 200) &&
    isBoundedString(value.phone, 30) &&
    isBoundedString(value.email, 254) &&
    typeof value.email === "string" &&
    isValidEmail(value.email) &&
    isIntegerInRange(value.years_experience, 0, 100) &&
    isBoundedString(value.horse_name, 200) &&
    isIntegerInRange(value.horse_age, 0, 60) &&
    isBoundedString(value.horse_breed, 200)
  );
};

const isEditableSoloRegistration = (
  value: unknown
): value is EditableSoloRegistration =>
  isRecord(value) &&
  isBoundedString(value.emergency_contact_name, 200) &&
  isBoundedString(value.emergency_contact_phone, 30) &&
  isEditableRegistration(value, false);

/* The parents' names the caller actually sent, trimmed, with a blank turned
   into null. A key the caller left out stays out: the database function
   keeps the stored value when its key is absent. */
const pickParentNames = (value: EditableRegistration) => {
  const names: { father_name?: string | null; mother_name?: string | null } = {};

  if (value.father_name !== undefined) {
    names.father_name = value.father_name?.trim() || null;
  }

  if (value.mother_name !== undefined) {
    names.mother_name = value.mother_name?.trim() || null;
  }

  return names;
};

/* Rebuilt from the validated fields rather than forwarded, so a key the
   database function might read is never one the route did not check. */
const pickRiderFields = (value: EditableRegistration) => ({
  full_name: value.full_name,
  age: value.age,
  location: value.location,
  phone: value.phone,
  email: value.email,
  years_experience: value.years_experience,
  horse_name: value.horse_name,
  horse_age: value.horse_age,
  horse_breed: value.horse_breed,
  ...pickParentNames(value),
});

/* The payload the database function receives, or null when the request is
   not a valid instance of the operation. */
const buildPayload = (
  operation: RegistrationOperation,
  payload: unknown
): Record<string, unknown> | null => {
  if (operation === "delete_solo" || operation === "delete_team") {
    return payload === undefined || payload === null ? {} : null;
  }

  if (operation === "edit_solo") {
    if (!isEditableSoloRegistration(payload)) {
      return null;
    }

    return {
      ...pickRiderFields(payload),
      emergency_contact_name: payload.emergency_contact_name,
      emergency_contact_phone: payload.emergency_contact_phone,
    };
  }

  if (!isRecord(payload) || !Array.isArray(payload.members)) {
    return null;
  }

  const members: EditableRegistration[] = [];

  for (const member of payload.members) {
    if (!isEditableRegistration(member, true)) {
      return null;
    }

    members.push(member);
  }

  if (
    !isBoundedString(payload.team_name, 200) ||
    // One emergency contact per team, required like the rest of the form.
    !isBoundedString(payload.emergency_contact_name, 200) ||
    !isBoundedString(payload.emergency_contact_phone, 30) ||
    members.length === 0 ||
    members.length > 4
  ) {
    return null;
  }

  return {
    team_name: payload.team_name,
    emergency_contact_name: payload.emergency_contact_name,
    emergency_contact_phone: payload.emergency_contact_phone,
    members: members.map((member) => ({ id: member.id, ...pickRiderFields(member) })),
  };
};

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/* Placeholder addresses on the paper domain are generated by
   admin_create_paper_registration only. An edit may send one back unchanged
   (the rider still has no email) but may not introduce a new one, which would
   be an address nobody can receive mail at or confirm. */
const findReservedEmail = async (
  serviceSupabase: ServiceClient,
  operation: RegistrationOperation,
  targetId: string,
  payload: Record<string, unknown>
): Promise<string | null> => {
  const reservedMessage = `Addresses on ${PAPER_EMAIL_DOMAIN} are reserved for paper entries without an email. Enter the rider's real address, or leave the stored one unchanged.`;

  if (operation === "edit_solo") {
    const email = typeof payload.email === "string" ? payload.email : "";

    if (!isPaperPlaceholderEmail(email)) {
      return null;
    }

    const { data } = await serviceSupabase
      .from("solo_registrations")
      .select("email")
      .eq("id", targetId)
      .maybeSingle();
    const stored = typeof data?.email === "string" ? data.email : "";

    return stored.trim().toLowerCase() === email.trim().toLowerCase() ? null : reservedMessage;
  }

  if (operation === "edit_team" && Array.isArray(payload.members)) {
    const placeholders = new Map<string, string>();

    for (const member of payload.members) {
      if (isRecord(member) && typeof member.id === "string" && typeof member.email === "string") {
        if (isPaperPlaceholderEmail(member.email)) {
          placeholders.set(member.id, member.email.trim().toLowerCase());
        }
      }
    }

    if (placeholders.size === 0) {
      return null;
    }

    const { data } = await serviceSupabase
      .from("team_members")
      .select("id, email")
      .eq("team_id", targetId)
      .in("id", [...placeholders.keys()]);
    const stored = new Map(
      (data ?? []).map((row) => [String(row.id), String(row.email ?? "").trim().toLowerCase()])
    );

    for (const [id, email] of placeholders) {
      if (stored.get(id) !== email) {
        return reservedMessage;
      }
    }
  }

  return null;
};

/* The database function raises P0002 / 22023 with messages written for an
   administrator; those pass through. Everything else is mapped to a sentence
   here rather than forwarding Postgres text. */
const describeMutationError = (
  operation: RegistrationOperation,
  error: { code?: string; message?: string; details?: string | null }
) => {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const isDelete = operation === "delete_solo" || operation === "delete_team";

  if (error.code === "P0002") {
    return { status: 404, message: error.message || "Registration not found." };
  }

  if (error.code === "22023") {
    return { status: 400, message: error.message || "That change is not allowed." };
  }

  // scoring_runs keeps a rider's results: ON DELETE SET NULL would leave a run
  // with no identity, so its checks refuse the delete (see the note in
  // 20261025120000_live_scoring.sql).
  if (isDelete && /scoring_runs/.test(text) && ["23514", "23505", "23503"].includes(error.code ?? "")) {
    return {
      status: 409,
      message:
        operation === "delete_solo"
          ? "This rider is in a start list; remove them from the round first."
          : "This team is in a start list; remove it from the round first.",
    };
  }

  if (error.code === "23505") {
    return {
      status: 409,
      message: "Another registration already uses this email address or phone number.",
    };
  }

  if (error.code === "23514") {
    const constraint = /constraint "([^"]+)"/.exec(text)?.[1];
    return {
      status: 400,
      message: constraint
        ? `One of the values is not allowed (${constraint}). Check the fields and try again.`
        : "One of the values is not allowed. Check the fields and try again.",
    };
  }

  console.error("Admin registration mutation failed", error);
  return { status: 500, message: "Unable to save this change. Try again." };
};

export async function PATCH(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body: Record<string, unknown> = isRecord(rawBody) ? rawBody : {};
  const operation = registrationOperations.find(
    (candidate) => candidate === body.operation
  );
  const targetId = typeof body.targetId === "string" ? body.targetId : null;
  const payload = operation ? buildPayload(operation, body.payload) : null;

  if (!operation || !targetId || !uuidPattern.test(targetId) || !payload) {
    return NextResponse.json(
      { error: "Please provide a valid admin registration update." },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceRoleClient();
  const reservedEmail = await findReservedEmail(serviceSupabase, operation, targetId, payload);

  if (reservedEmail) {
    return NextResponse.json({ error: reservedEmail }, { status: 400 });
  }

  const { error } = await serviceSupabase.rpc("admin_mutate_registration", {
    p_operation: operation,
    p_target_id: targetId,
    p_payload: payload,
    p_actor_id: adminCheck.actor.id,
    p_actor_name: adminCheck.actor.name,
    p_actor_email: adminCheck.actor.email,
    p_batch_id: null,
  });

  if (error) {
    const { status, message } = describeMutationError(operation, error);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  return PATCH(request);
}
