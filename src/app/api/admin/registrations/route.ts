import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  verifyAdminRequest,
} from "@/lib/admin/server";

type RegistrationOperation =
  | "edit_solo"
  | "delete_solo"
  | "edit_team"
  | "delete_team";

type MutationRequest = {
  operation?: RegistrationOperation;
  targetId?: string;
  payload?: unknown;
};

type EditableRegistration = {
  id?: string;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_age: number;
  horse_breed: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBoundedString = (value: unknown, maxLength: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

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
    isIntegerInRange(value.age, 1, 120) &&
    isBoundedString(value.location, 200) &&
    isBoundedString(value.phone, 30) &&
    isBoundedString(value.email, 254) &&
    emailPattern.test(value.email as string) &&
    isIntegerInRange(value.years_experience, 0, 100) &&
    isIntegerInRange(value.horse_age, 0, 60) &&
    isBoundedString(value.horse_breed, 200)
  );
};

const isValidPayload = (operation: RegistrationOperation, payload: unknown) => {
  if (operation === "delete_solo" || operation === "delete_team") {
    return payload === undefined || payload === null;
  }

  if (operation === "edit_solo") {
    return isEditableRegistration(payload, false);
  }

  if (!isRecord(payload)) {
    return false;
  }

  return (
    isBoundedString(payload.team_name, 200) &&
    Array.isArray(payload.members) &&
    payload.members.length > 0 &&
    payload.members.length <= 4 &&
    payload.members.every((member) => isEditableRegistration(member, true))
  );
};

export async function PATCH(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let body: MutationRequest;

  try {
    body = (await request.json()) as MutationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { operation, targetId, payload } = body;

  if (
    !operation ||
    !["edit_solo", "delete_solo", "edit_team", "delete_team"].includes(operation) ||
    !targetId ||
    !uuidPattern.test(targetId) ||
    !isValidPayload(operation, payload)
  ) {
    return NextResponse.json(
      { error: "Please provide a valid admin registration update." },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceRoleClient();
  const { error } = await serviceSupabase.rpc("admin_mutate_registration", {
    p_operation: operation,
    p_target_id: targetId,
    p_payload: payload ?? {},
    p_actor_id: adminCheck.actor.id,
    p_actor_name: adminCheck.actor.name,
    p_actor_email: adminCheck.actor.email,
    p_batch_id: null,
  });

  if (error) {
    const status = error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  return PATCH(request);
}
