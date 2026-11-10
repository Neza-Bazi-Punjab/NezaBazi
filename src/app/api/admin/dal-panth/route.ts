// PATCH /api/admin/dal-panth — set or clear a rider's Dal Panth.
// Administrators only.
//
// Body: { code, dal_panth } (DalPanthRequest in src/lib/dal-panth.ts). The
// administrator is verified from the session and becomes the audit actor;
// nothing in the body can name one. The value is normalised here and again by
// the service-role-only database function admin_set_dal_panth, which sets it
// on every entry the rider holds under that code and writes the audit record
// in one transaction (nothing when the value is unchanged).
//
// Before the migration (supabase/migrations/20261110100000_rider_dal_panth.sql)
// is applied this answers 503 with DAL_PANTH_NOT_SET_UP and changes nothing.
// Never cached.
import { NextResponse } from "next/server";
import { createServiceRoleClient, verifyAdminRequest } from "@/lib/admin/server";
import { DAL_PANTH_NOT_SET_UP, normalizeDalPanth, type DalPanthSaved } from "@/lib/dal-panth";
import { readJsonBody } from "@/lib/scoring/http";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

/* A code is NBP-XXXXXX; anything far longer is not one. */
const CODE_MAX_LENGTH = 32;

/* The function (PGRST202, 42883) or the column (42703) is not there yet. */
const NOT_SET_UP_CODES = new Set(["PGRST202", "42883", "42703"]);

const NO_STORE = { "Cache-Control": "private, no-store" };

const BAD_REQUEST = "Please provide a rider's code and a Dal Panth.";
const SAVE_FAILED = "Could not save the Dal Panth. Nothing was changed. Try again.";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const noStore = (response: NextResponse) => {
  response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return response;
};

/* { code, dal_panth }: the code a non-blank string of at most 32 characters,
   the Dal Panth a string or null (and present). */
const parseRequest = (raw: unknown): { code: string; dalPanth: string | null } | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.code !== "string") {
    return null;
  }

  const code = record.code.trim();

  if (code === "" || code.length > CODE_MAX_LENGTH) {
    return null;
  }

  if (!("dal_panth" in record) || (record.dal_panth !== null && typeof record.dal_panth !== "string")) {
    return null;
  }

  return { code, dalPanth: record.dal_panth };
};

/* The function's result, field by field; never passed through raw. */
const toSaved = (data: unknown): DalPanthSaved | null => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const value = record.dal_panth;

  if (
    typeof record.confirmation_code !== "string" ||
    typeof record.full_name !== "string" ||
    typeof record.changed !== "boolean" ||
    (value !== null && typeof value !== "string")
  ) {
    return null;
  }

  return {
    ok: true,
    confirmation_code: record.confirmation_code,
    full_name: record.full_name,
    dal_panth: value,
    changed: record.changed,
  };
};

export async function PATCH(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return noStore(adminCheck.response);
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);

  if (!body.ok) {
    return noStore(body.response);
  }

  const parsed = parseRequest(body.body);

  if (!parsed) {
    return json({ error: BAD_REQUEST }, 400);
  }

  const normalized = normalizeDalPanth(parsed.dalPanth);

  if (!normalized.ok) {
    return json({ error: normalized.error }, 400);
  }

  let data: unknown;
  let error: { code?: string; message?: string } | null;

  try {
    const result = await createServiceRoleClient().rpc("admin_set_dal_panth", {
      p_code: parsed.code,
      p_dal_panth: normalized.value,
      p_actor_id: adminCheck.actor.id,
      p_actor_name: adminCheck.actor.name,
      p_actor_email: adminCheck.actor.email,
    });
    data = result.data;
    error = result.error;
  } catch (caught) {
    console.error("Dal Panth save failed", caught);
    return json({ error: SAVE_FAILED }, 500);
  }

  if (error) {
    const code = error.code ?? "";

    if (code === "P0002") {
      return json({ error: error.message || "Rider not found." }, 404);
    }

    if (code === "22023") {
      return json({ error: error.message || BAD_REQUEST }, 400);
    }

    if (NOT_SET_UP_CODES.has(code)) {
      return json({ error: DAL_PANTH_NOT_SET_UP }, 503);
    }

    console.error("Dal Panth save failed", error);
    return json({ error: SAVE_FAILED }, 500);
  }

  const saved = toSaved(data);

  if (!saved) {
    // The function returned without an error, so its transaction committed;
    // only its reply is not the expected shape.
    console.error("Dal Panth save returned an unexpected result", data);
    return json({ error: "The Dal Panth may have been saved, but the reply was not understood. Refresh to check." }, 500);
  }

  return json(saved);
}
