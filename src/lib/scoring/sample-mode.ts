// Who may use training mode, which practice session they get, and the one way
// a scoring route answers a training request.
//
// A request asks for training with ?sample=1. It is allowed when EITHER
//   - the server's own environment has SCORING_SAMPLE_MODE=1 (a laptop set up
//     for practice): anyone, no login, the laptop's one in-memory session; OR
//   - the caller is signed in as a judge, commentator or administrator
//     (STAFF_ROLES, checked on the server from their own profile row): the
//     organisers' ONE shared demo (SHARED_TRAINING_SESSION), the same on
//     every device, so judges, commentary and the stream rehearse together.
// Anyone else asking for training is refused exactly as the real route would
// refuse them (401 signed out, 403 wrong role), so ?sample=1 opens nothing.
// When an administrator has closed the demo for the event
// (training-switch.ts), staff are refused too, with 409 "The demo is closed
// for the event. Open the live panel." The laptop's own session is never
// closed.
//
// A training request is answered from the practice session in
// sample-session.ts (in memory on the laptop, the scoring_training_sessions
// row on the live site). That branch never reads or writes the scoring
// tables, never writes a registration and never returns a real result (the
// riders are the invented ones, or after a reset on the live site a copy of
// the registered solo riders), which is why the scoring routes answer it
// before, and instead of, their own role check.
//
// ?sample=demo is the public, read-only view of the same demo for the vMix
// feeds, /api/live/state, /live and the overlays (isDemoRequest below, and
// demoTrainingSession in sample-session.ts); it needs no login because it
// shows only what the real scoreboard shows on the day (name, horse, district
// and state), with practice scores.
import "server-only";

import { verifyRoleRequest } from "@/lib/scoring/auth";
import { jsonError, jsonNoStore, readJsonBody } from "@/lib/scoring/http";
import {
  LOCAL_TRAINING_SESSION,
  SHARED_TRAINING_SESSION,
  SampleRefusal,
} from "@/lib/scoring/sample-session";
import { DEMO_CLOSED_MESSAGE, isDemoClosed } from "@/lib/scoring/training-switch";
import { STAFF_ROLES } from "@/lib/scoring/types";
import type { Parsed } from "@/lib/scoring/validation";

export const isSampleModeEnabled = () => process.env.SCORING_SAMPLE_MODE === "1";

/* The local, anonymous path only: SCORING_SAMPLE_MODE=1 and ?sample=1. The
   public live state uses this and nothing more, so it never reads a session
   and stays cacheable for spectators. */
export const isSampleRequest = (request: Request) =>
  process.env.SCORING_SAMPLE_MODE === "1" &&
  new URL(request.url).searchParams.get("sample") === "1";

/* ?sample=demo: the public view of the demo the judges are driving. */
export const isDemoRequest = (request: Request) =>
  new URL(request.url).searchParams.get("sample")?.trim().toLowerCase() === "demo";

export type SampleAccess =
  /* Not a training request: the route's real path runs, role check and all. */
  | { kind: "real" }
  /* Training, on this practice session; `actor` is the signed-in staff
     member (none on the laptop), recorded as the row's updated_by. */
  | { kind: "training"; session: string; actor?: string }
  /* Asked for training without the right to it: return this response. */
  | { kind: "refused"; response: Response };

export const resolveSampleAccess = async (request: Request): Promise<SampleAccess> => {
  if (new URL(request.url).searchParams.get("sample") !== "1") {
    return { kind: "real" };
  }

  if (process.env.SCORING_SAMPLE_MODE === "1") {
    return { kind: "training", session: LOCAL_TRAINING_SESSION };
  }

  const access = await verifyRoleRequest(STAFF_ROLES);

  if (!access.ok) {
    return { kind: "refused", response: access.response };
  }

  if (await isDemoClosed()) {
    return { kind: "refused", response: jsonError(DEMO_CLOSED_MESSAGE, 409) };
  }

  return { kind: "training", session: SHARED_TRAINING_SESSION, actor: access.actor.id };
};

const TRAINING_ERROR = "The practice session could not do that. Reset training data and try again.";

/* Runs one training read or write and answers like the real route: 200 with
   the payload (never cached), 404 / 409 with the database's own message for a
   refusal (and the 409 "Someone else just changed the practice…" after a lost
   race), 500 with a generic message otherwise. `produce` may be async. */
export const sampleResponse = async (produce: () => unknown) => {
  try {
    return jsonNoStore(await produce());
  } catch (caught) {
    if (caught instanceof SampleRefusal) {
      return jsonError(caught.message, caught.status);
    }

    console.error("[scoring] training request failed", caught);
    return jsonError(TRAINING_ERROR, 500);
  }
};

/* A training write: the body is read and validated exactly as the real route
   does (size-limited, type guards), then applied to the session. `apply` may
   be async. */
export const sampleWriteResponse = async <T>(
  request: Request,
  parse: (body: unknown) => Parsed<T>,
  apply: (value: T) => unknown
) => {
  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parse(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  return sampleResponse(() => apply(parsed.value));
};
