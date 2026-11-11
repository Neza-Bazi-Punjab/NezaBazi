// Cut-out rider photos: PNGs with the background removed, for broadcast
// titles.
//
// The stored photos are JPEGs (bucket `rider-headshots`). A cut-out of each is
// made off the server and kept in its own private bucket, named after the
// photo it was cut from, so a replaced photo (always a new storage path) can
// never be shown with the old cut-out: until its own cut-out is uploaded, the
// photo route falls back to the JPEG.
//
// Only node:crypto, so the tests and the upload script's rule can't drift.
import { createHash } from "node:crypto";

export const CUTOUT_BUCKET = "rider-cutouts";

/* `<first 40 hex of SHA-256(storage path)>.png`, at the bucket's root. */
export const cutoutObjectName = (photoPath: string) =>
  `${createHash("sha256").update(photoPath, "utf8").digest("hex").slice(0, 40)}.png`;
