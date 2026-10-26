// Who may use training mode, which practice session they get, and the one way
// a scoring route answers a training request.
//
// A request asks for training with ?sample=1. It is allowed when EITHER
//   - the server's own environment has SCORING_SAMPLE_MODE=1 (a laptop set up
//     for practice): anyone, no login, one shared session; OR
//   - the caller is signed in as a judge, commentator or administrator
//     (STAFF_ROLES, checked on the server from their own profile row): their
//     own session, keyed by their user id, so practice from home never mixes
//     with anyone else's.
// Anyone else asking for training is refused exactly as the real route would
// refuse them (401 signed out, 403 wrong role), so ?sample=1 opens nothing.
//
// A training request is answered from the in-memory practice sessions in
// sample-session.ts. That branch never reads or writes the scoring or
// registration tables and never returns real data — the only database call
// it can make is the role check — which is why the scoring routes answer it
// before, and instead of, their own role check.
import "server-only";

import { verifyRoleRequest } from "@/lib/scoring/auth";
import { jsonError, jsonNoStore, readJsonBody } from "@/lib/scoring/http";
import {
  LOCAL_TRAINING_SESSION,
  SampleRefusal,
  personalTrainingSession,
} from "@/lib/scoring/sample-session";
import { STAFF_ROLES } from "@/lib/scoring/types";
import type { Parsed } from "@/lib/scoring/validation";

export const isSampleModeEnabled = () => process.env.SCORING_SAMPLE_MODE === "1";

/* The local, anonymous path only: SCORING_SAMPLE_MODE=1 and ?sample=1. The
   public live state uses this and nothing more, so it never reads a session
   and stays cacheable for spectators. */
export const isSampleRequest = (request: Request) =>
  process.env.SCORING_SAMPLE_MODE === "1" &&
  new URL(request.url).searchParams.get("sample") === "1";

export type SampleAccess =
  /* Not a training request: the route's real path runs, role check and all. */
  | { kind: "real" }
  /* Training, on this practice session. */
  | { kind: "training"; session: string }
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

  return { kind: "training", session: personalTrainingSession(access.actor.id) };
};

const TRAINING_ERROR = "The practice session could not do that. Reset training data and try again.";

/* Runs one training read or write and answers like the real route: 200 with
   the payload (never cached), 404 / 409 with the database's own message for a
   refusal, 500 with a generic message otherwise. */
export const sampleResponse = (produce: () => unknown) => {
  try {
    return jsonNoStore(produce());
  } catch (caught) {
    if (caught instanceof SampleRefusal) {
      return jsonError(caught.message, caught.status);
    }

    console.error("[scoring] training request failed", caught);
    return jsonError(TRAINING_ERROR, 500);
  }
};

/* A training write: the body is read and validated exactly as the real route
   does (size-limited, type guards), then applied to the session. */
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
