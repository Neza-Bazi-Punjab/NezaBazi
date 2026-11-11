// Permanent links to rider photos for the broadcast team:
//
//   <origin>/api/broadcast/photo/<signature>/<encoded path>.jpg
//
// `encoded path` is the storage path in base64url; `signature` is the first 32
// base64url characters of HMAC-SHA256(BROADCAST_API_KEY,
// "broadcast-photo:v1:" + path). The signature is the permission, so the link
// carries no key and the CDN can cache the picture for good (a storage path
// never changes its bytes: replacing a photo writes a new object name).
// Changing BROADCAST_API_KEY invalidates every link at the function.
//
// A signed path is still only served if it has one of the two shapes a rider
// photo has: an account's own `<profile id>/<file>`, or a registration's
// `paper/<row id>/<file>`. Anything else is refused even with a valid
// signature.
//
// Only node:crypto, Buffer and the import-free headshots.ts, so the tests can
// load this file directly.
import { createHmac, timingSafeEqual } from "node:crypto";
import { PAPER_HEADSHOT_FOLDER } from "../headshots.ts";

export const PHOTO_LINK_PREFIX = "/api/broadcast/photo/";
const SIGNATURE_PURPOSE = "broadcast-photo:v1:";
const SIGNATURE_LENGTH = 32;
const PHOTO_EXTENSION = ".jpg";

const FILE_NAME = /^[A-Za-z0-9._-]{1,200}$/;
const ID_SEGMENT = /^[0-9a-f-]{36}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const signPhotoPath = (secret: string, path: string) =>
  createHmac("sha256", secret)
    .update(SIGNATURE_PURPOSE + path, "utf8")
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);

export const encodePhotoPath = (path: string) => Buffer.from(path, "utf8").toString("base64url");

/* Strict: the text must be exactly what encodePhotoPath writes. */
export const decodePhotoPath = (encoded: string): string | null => {
  if (!BASE64URL.test(encoded) || encoded.length > 400) {
    return null;
  }

  const path = Buffer.from(encoded, "base64url").toString("utf8");
  return encodePhotoPath(path) === encoded ? path : null;
};

/* `<profile id>/<file>` or `paper/<row id>/<file>`, and nothing that could
   climb out of a folder. */
export const isAllowedPhotoPath = (path: string) => {
  const parts = path.split("/");
  const file = parts[parts.length - 1] ?? "";

  if (!FILE_NAME.test(file) || file === "." || file === ".." || file.includes("..")) {
    return false;
  }

  if (parts.length === 2) {
    return ID_SEGMENT.test(parts[0]);
  }

  return parts.length === 3 && parts[0] === PAPER_HEADSHOT_FOLDER && ID_SEGMENT.test(parts[1]);
};

/* The absolute link for a photo. `origin` is the request's, e.g.
   "https://example.com" (no trailing slash). */
export const buildPhotoLink = (origin: string, secret: string, path: string) =>
  `${origin.replace(/\/+$/, "")}${PHOTO_LINK_PREFIX}${signPhotoPath(secret, path)}/${encodePhotoPath(path)}${PHOTO_EXTENSION}`;

/* The storage path a link names, or null for anything wrong: no secret, a
   bad or tampered signature, an undecodable path, or a path of neither
   allowed shape. `file` is the last URL segment, `<encoded path>.jpg`. */
export const readPhotoLink = (
  secret: string | null,
  signature: string,
  file: string
): string | null => {
  if (!secret || typeof signature !== "string" || typeof file !== "string") {
    return null;
  }

  if (!file.endsWith(PHOTO_EXTENSION) || signature.length !== SIGNATURE_LENGTH) {
    return null;
  }

  const path = decodePhotoPath(file.slice(0, -PHOTO_EXTENSION.length));

  if (path === null) {
    return null;
  }

  const expected = Buffer.from(signPhotoPath(secret, path), "utf8");
  const given = Buffer.from(signature, "utf8");

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  return isAllowedPhotoPath(path) ? path : null;
};
