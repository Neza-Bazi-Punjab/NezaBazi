// Response helpers shared by every scoring route.
//
// Two jobs: read a request body without trusting its size, and turn a
// database error into a response that never leaks SQL. The scoring functions
// raise only two kinds of error meant for people — P0002 (not found) and 22023
// (not allowed right now) — and those messages are written to be shown to a
// judge on a phone. Everything else becomes a generic 500 and is logged
// server-side.
import "server-only";

import { NextResponse } from "next/server";
import { isScoringNotConfiguredError, type DbError } from "@/lib/scoring/server";

export const NOT_CONFIGURED_MESSAGE = "Live scoring is not set up yet.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/* Staff and admin responses must never be cached by a browser or the CDN. */
export const PRIVATE_NO_STORE = "private, no-store";

/* Thousands of spectators poll the public state; Vercel's edge answers all but
   one request a second. */
export const PUBLIC_LIVE_CACHE = "public, s-maxage=1, stale-while-revalidate=4";

/* Request bodies here are a handful of ids and short strings. */
export const MAX_BODY_BYTES = 16 * 1024;

export const jsonNoStore = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });

export const jsonError = (message: string, status: number) =>
  jsonNoStore({ error: message }, status);

type BodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse };

/* Reads at most `maxBytes` of the body, then parses it as JSON. A body over
   the limit is refused without being buffered in full. */
export const readJsonBody = async (
  request: Request,
  maxBytes = MAX_BODY_BYTES
): Promise<BodyResult> => {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, response: jsonError("Request body is too large.", 413) };
  }

  if (!request.body) {
    return { ok: false, response: jsonError("Invalid request body.", 400) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;

      if (received > maxBytes) {
        await reader.cancel();
        return { ok: false, response: jsonError("Request body is too large.", 413) };
      }

      chunks.push(value);
    }
  } catch {
    return { ok: false, response: jsonError("Invalid request body.", 400) };
  }

  const bytes = new Uint8Array(received);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, response: jsonError("Invalid request body.", 400) };
  }
};

/* Maps a PostgREST / Postgres error from a scoring function to a response:
   tables or functions missing -> 503; P0002 -> 404 and 22023 -> 409 with the
   function's own human-written message; anything else -> 500 with a generic
   message (the detail goes to the server log only). */
export const databaseErrorResponse = (error: DbError, context: string) => {
  if (isScoringNotConfiguredError(error)) {
    return jsonError(NOT_CONFIGURED_MESSAGE, 503);
  }

  const message =
    typeof error?.message === "string" && error.message.trim().length > 0
      ? error.message.trim().slice(0, 300)
      : null;

  if (error?.code === "P0002") {
    return jsonError(message ?? "That no longer exists. Refresh and try again.", 404);
  }

  if (error?.code === "22023") {
    return jsonError(message ?? "That change is not allowed right now.", 409);
  }

  console.error(`[scoring] ${context} failed`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
  });

  return jsonError(GENERIC_ERROR_MESSAGE, 500);
};

/* For a thrown error while assembling a state payload. */
export const unexpectedErrorResponse = (error: unknown, context: string) => {
  console.error(`[scoring] ${context} failed`, error);
  return jsonError(GENERIC_ERROR_MESSAGE, 500);
};
