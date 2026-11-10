// Admin paper entry: creates a solo or team registration from a paper form on
// the rider's behalf.
//
// The administrator is verified from the session and becomes the audit actor;
// nothing in the body can name one. The body is parsed with type guards,
// validated with the same bounds as the online paths, and handed to the
// service-role-only database function admin_create_paper_registration, which
// validates it again, refuses a rider who is already registered, inserts the
// entry and writes its audit record in one transaction.
import { NextResponse, after } from "next/server";
import { createServiceRoleClient, verifyAdminRequest } from "@/lib/admin/server";
import { buildRegistrationCodeEmail } from "@/lib/email/registration-code";
import { sendEmail } from "@/lib/email/resend";
import {
  displayEmail,
  isPaperPlaceholderEmail,
  parsePaperRegistrationRequest,
  parsePaperRegistrationResult,
  validatePaperSolo,
  validatePaperTeam,
} from "@/lib/paper-registration";
import { readJsonBody } from "@/lib/scoring/http";
import { DAL_PANTH_NOT_SET_UP, normalizeDalPanth } from "@/lib/dal-panth";

export const dynamic = "force-dynamic";

/* A team form is four riders of fourteen short fields; 64 KB is generous. */
const MAX_PAPER_BODY_BYTES = 64 * 1024;

/* The function raises 22023 for every refusal; a duplicate rider carries this
   hint so it can be told apart from a malformed field. */
const DUPLICATE_HINT = "duplicate_registration";

/* PostgREST's "function not in the schema cache" and Postgres's own
   "function does not exist": the migration has not been applied yet. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/* The Dal Panth migration has not been applied yet: its function, or the
   column, is missing. */
const DAL_PANTH_MISSING_CODES = new Set(["PGRST202", "42883", "42703"]);

const DAL_PANTH_NOT_SAVED =
  "The registration was saved, but the Dal Panth was not. Add it from the Solo Riders or Teams list.";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const body = await readJsonBody(request, MAX_PAPER_BODY_BYTES);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parsePaperRegistrationRequest(body.body);

  if (!parsed) {
    return NextResponse.json(
      { error: "Please provide a valid paper registration." },
      { status: 400 }
    );
  }

  const validation =
    parsed.type === "solo" ? validatePaperSolo(parsed.input) : validatePaperTeam(parsed.input);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.firstError, fieldErrors: validation.errors },
      { status: 400 }
    );
  }

  // Dal Panth is a top-level key of its own, outside `registration`: it is
  // never part of p_payload (that payload is whitelisted by the database and
  // mirrors the printed form). Checked here, before anything is saved; it is
  // written only after the registration has succeeded, below.
  const rawBody: unknown = body.body;
  const dalPanth = normalizeDalPanth(isObject(rawBody) ? rawBody.dal_panth : undefined);

  if (!dalPanth.ok) {
    return NextResponse.json({ error: dalPanth.error }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("admin_create_paper_registration", {
    p_type: parsed.type,
    p_payload: validation.payload,
    p_actor_id: adminCheck.actor.id,
    p_actor_name: adminCheck.actor.name,
    p_actor_email: adminCheck.actor.email,
  });

  if (error) {
    if (error.code === "22023") {
      return NextResponse.json(
        { error: error.message },
        { status: error.hint === DUPLICATE_HINT ? 409 : 400 }
      );
    }

    if (error.code === "P0002") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (MISSING_FUNCTION_CODES.has(error.code)) {
      return NextResponse.json(
        {
          error:
            "Paper entry is not set up yet: the paper registration migration has not been applied.",
        },
        { status: 503 }
      );
    }

    console.error("Paper registration failed", error);
    return NextResponse.json(
      { error: "Could not save the registration. Nothing was saved — try again." },
      { status: 500 }
    );
  }

  const created = parsePaperRegistrationResult(data);

  if (!created) {
    console.error("Paper registration returned an unexpected result", data);
    return NextResponse.json(
      {
        error:
          "The registration was saved, but its confirmation codes could not be read. Search for the rider on the dashboard before entering the form again.",
      },
      { status: 500 }
    );
  }

  // The registration is saved. Its Dal Panth, if one was given, goes on each
  // new rider through the same function the lists use, one at a time. This
  // can never undo or fail the registration: a failure is reported beside the
  // codes so the desk can add it from the lists instead.
  let dalPanthSaved: boolean | null = null;
  let dalPanthError: string | null = null;

  if (dalPanth.value !== null) {
    dalPanthSaved = true;

    for (const rider of created.riders) {
      try {
        const { error: dalPanthFailure } = await serviceSupabase.rpc("admin_set_dal_panth", {
          p_code: rider.confirmation_code,
          p_dal_panth: dalPanth.value,
          p_actor_id: adminCheck.actor.id,
          p_actor_name: adminCheck.actor.name,
          p_actor_email: adminCheck.actor.email,
        });

        if (dalPanthFailure) {
          dalPanthSaved = false;

          if (DAL_PANTH_MISSING_CODES.has(dalPanthFailure.code)) {
            dalPanthError = DAL_PANTH_NOT_SET_UP;
            break;
          }

          console.error("Paper registration Dal Panth not saved", dalPanthFailure);
          dalPanthError = DAL_PANTH_NOT_SAVED;
        }
      } catch (dalPanthThrown) {
        console.error("Paper registration Dal Panth not saved", dalPanthThrown);
        dalPanthSaved = false;
        dalPanthError = DAL_PANTH_NOT_SAVED;
      }
    }
  }

  // A rider who wrote an email address gets their code the same way an
  // online rider does, after the response so a slow send never holds up the
  // desk. A placeholder address is never sent to (resend.ts refuses it too).
  const recipients = created.riders.filter((rider) => !isPaperPlaceholderEmail(rider.email));

  if (recipients.length > 0) {
    after(async () => {
      // Names only, as on the online team path: riders never agreed to have
      // their contact details forwarded to the rest of the roster.
      const teammateNames = created.riders.map((rider) => rider.full_name);

      for (const rider of recipients) {
        const { subject, html, text } = buildRegistrationCodeEmail({
          fullName: rider.full_name,
          confirmationCode: rider.confirmation_code,
          registrationType: created.type,
          teamName: created.team_name,
          teammateNames: created.type === "team" ? teammateNames : [],
        });

        await sendEmail({ to: rider.email, subject, html, text });
      }
    });
  }

  return NextResponse.json({
    ok: true,
    registration: {
      type: created.type,
      registration_id: created.registration_id,
      team_name: created.team_name,
      riders: created.riders.map((rider) => ({
        id: rider.id,
        full_name: rider.full_name,
        confirmation_code: rider.confirmation_code,
        is_leader: rider.is_leader,
        email: displayEmail(rider.email),
        has_email: !isPaperPlaceholderEmail(rider.email),
      })),
    },
    dal_panth_saved: dalPanthSaved,
    ...(dalPanthSaved === false
      ? { dal_panth_error: dalPanthError ?? DAL_PANTH_NOT_SAVED }
      : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
