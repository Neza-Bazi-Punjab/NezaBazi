// The broadcast team's key for /api/broadcast/* (the photo feeds and the ZIP).
//
// One shared secret, BROADCAST_API_KEY, given only as `?key=`: vMix Data
// Sources cannot send headers, and a key in a header would let a CDN-cached
// answer be reached without it (the CDN keys on the URL, so with the key in
// the query string the key is part of the cache key). There is no header form.
//
// Unset or shorter than BROADCAST_KEY_MIN_LENGTH: every broadcast route
// answers 503. Wrong or missing: 401. Compared in constant time over SHA-256
// digests, so neither the length nor any prefix of the key leaks through
// timing. The key is never logged and never written into a response.
//
// Only node:crypto and the standard Response, so the tests can load this file
// directly.
import { createHash, timingSafeEqual } from "node:crypto";

export const BROADCAST_KEY_MIN_LENGTH = 24;

export const BROADCAST_NOT_SET_UP_MESSAGE = "The broadcast feed is not set up yet.";
export const BROADCAST_KEY_REQUIRED_MESSAGE = "A valid key is required.";

const NO_STORE = "private, no-store";

/* The configured key, or null when it is unset or too short to be one. */
export const readBroadcastSecret = (
  value: string | undefined = process.env.BROADCAST_API_KEY
): string | null => {
  const secret = value?.trim() ?? "";
  return secret.length >= BROADCAST_KEY_MIN_LENGTH ? secret : null;
};

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/* Constant-time equality of two strings of any length. */
export const sameSecret = (given: string, expected: string) =>
  timingSafeEqual(digest(given), digest(expected));

export type BroadcastKeyCheck =
  | { ok: true; secret: string }
  | { ok: false; status: 401 | 503; error: string };

/* The decision alone, for the tests: `?key=` against the configured secret. */
export const checkBroadcastKey = (url: URL, secret: string | null): BroadcastKeyCheck => {
  if (!secret) {
    return { ok: false, status: 503, error: BROADCAST_NOT_SET_UP_MESSAGE };
  }

  const given = url.searchParams.get("key");

  if (given === null || given === "" || !sameSecret(given, secret)) {
    return { ok: false, status: 401, error: BROADCAST_KEY_REQUIRED_MESSAGE };
  }

  return { ok: true, secret };
};

export type BroadcastAccess =
  | { ok: true; secret: string }
  | { ok: false; response: Response };

/* The first statement of every keyed broadcast route:
     const access = verifyBroadcastKey(request);
     if (!access.ok) { return access.response; } */
export const verifyBroadcastKey = (
  request: Request,
  secret: string | null = readBroadcastSecret()
): BroadcastAccess => {
  let url: URL;

  try {
    url = new URL(request.url);
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: BROADCAST_KEY_REQUIRED_MESSAGE },
        { status: 401, headers: { "Cache-Control": NO_STORE } }
      ),
    };
  }

  const check = checkBroadcastKey(url, secret);

  if (check.ok) {
    return check;
  }

  return {
    ok: false,
    response: Response.json(
      { error: check.error },
      { status: check.status, headers: { "Cache-Control": NO_STORE } }
    ),
  };
};
