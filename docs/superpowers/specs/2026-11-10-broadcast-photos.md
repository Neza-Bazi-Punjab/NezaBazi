# Rider photos for the broadcast team

10 November 2026. The event is on 11 November, so this must not touch anything
the live scoring already relies on: **no database change, no edit to the four
public vMix feeds, no edit to the staff screens' behaviour.**

## Goal

The broadcast graphics team shows the photo of the rider on course. They get:

1. keyed data feeds, in the shape of the vMix feeds they already use, with
   photo columns;
2. permanent, CDN-cached links to each photo (fast: no database, Auth or
   signing call when a picture is fetched);
3. a ZIP of every photo behind the same key, for local files on the vMix
   computer (instant, and independent of venue internet).

## Facts this design rests on

- Photos are JPEGs (longest edge 1200 px) in the private bucket
  `rider-headshots`. 133 objects, 156 KB average, 674 KB largest, 20 MB total.
- A photo is either on the registration row (`headshot_path`,
  `paper/<row id>/<uuid>.jpg`, on `solo_registrations` and `team_members`) or
  on the rider's own account (Auth metadata `headshot_path`,
  `<profile id>/<uuid>.jpg`). Whose photo an account's is, is decided by
  `isOwnRegistration` (`src/lib/registration-identity.ts`). Row photo first.
  `src/lib/admin/headshot-urls.ts` (`matchSoloHeadshots`,
  `matchTeamHeadshots`) is the reference for these rules.
- Replacing a photo always writes a new object name, so one storage path
  always means the same bytes: a link to a path can be cached for good.
- Functions run in Virginia, storage is in Oregon, the venue is in Punjab.
  An uncached photo is slow; one cached at the CDN edge is not.
- `scoring_runs` rows carry `solo_registration_id` / `team_member_id`.

## The key

- Env var `BROADCAST_API_KEY`. Unset or shorter than 24 characters: every
  broadcast route answers 503 `{ "error": "The broadcast feed is not set up yet." }`,
  `private, no-store`.
- Given only as `?key=`. vMix Data Sources cannot send headers, and a header
  key would make a CDN-cached answer reachable without the key. No header
  form.
- Compared in constant time (`timingSafeEqual` over SHA-256 digests). Wrong
  or missing: 401 `{ "error": "A valid key is required." }`, `private, no-store`.
- The key is never logged and never appears in a response body.

## Photo links

`<origin>/api/broadcast/photo/<signature>/<encoded path>.jpg`

- `encoded path` = base64url of the storage path. `signature` = first 32
  base64url characters of `HMAC-SHA256(BROADCAST_API_KEY, "broadcast-photo:v1:" + path)`.
- The route needs no `?key=`: the signature is the permission. It verifies the
  signature in constant time, then checks the path is one of the two allowed
  shapes (own-folder account path or `paper/<uuid>/<file>`), then downloads the
  object with the service role and streams it.
- Success: `Content-Type: image/jpeg`, `Cache-Control: public, max-age=604800,
  s-maxage=604800, immutable`, `X-Content-Type-Options: nosniff`,
  `X-Robots-Tag: noindex`.
- Anything wrong: 404, `private, no-store`, no detail.
- Changing `BROADCAST_API_KEY` makes every old link invalid at the function
  (copies already in a CDN or on a disk stay until they expire).

## The photo index

`src/lib/broadcast/photo-index.ts` (server only): one in-memory index of every
rider's photo, rebuilt at most every 30 seconds per server instance, with one
shared in-flight build.

- Reads: all `solo_registrations` (id, profile_id, email, full_name,
  headshot_path), all `team_members` (id, team_id, email, full_name, is_leader,
  headshot_path), `teams` (id, team_name, leader_profile_id), and one
  `loadAuthUserIndex` call.
- Result: `Map<"solo:<id>" | "member:<id>", { path, file }>` plus the rider
  list for the manifest. **Paths, not signed URLs.**
- Path choice must be the same rule the admin lists use. Extract the pure
  path-choosing parts of `matchSoloHeadshots` / `matchTeamHeadshots` into
  exported functions in `headshot-urls.ts` and have the existing functions call
  them, with identical behaviour; the index calls the same functions. One rule,
  one place: a wrong face on air is the worst failure here.
- A failed rebuild keeps serving the previous index; with none, an empty one.
  A photo problem must never fail a feed: the photo columns are just empty.
- `file` is the stable local file name: `<name-slug>-<first 8 of row id>.jpg`,
  lower-case ASCII `a-z0-9-`, slug at most 40 characters, `rider` when the slug
  is empty. It does not change when the photo is replaced.

## Routes (all under `src/app/api/broadcast/`, all `force-dynamic`)

Every row keeps the public feed's rules: every column always present, strings
never null, one empty row when there is nothing to show, JSON array or
`?format=csv`. Feed cache: `public, s-maxage=1, stale-while-revalidate=4`
(the key is part of the URL, so of the cache key). Errors while assembling:
503 `private, no-store`, like the public feeds.

| Route | Rows |
| --- | --- |
| `current` | The public current row, then `photo_url`, `photo_file`, `photo_path`, `last_photo_url`, `last_photo_file`, `last_photo_path`, then `sample`. |
| `entrants` | The public entrants row (`?round=` as there), then `photo_url`, `photo_file`, `photo_path` (Single: the rider; Section: empty), `member_1_photo_url` … `member_4_photo_url` (Section: the riders in the order of `members`; Single: empty), then `sample`. |
| `photos` | One row per registered rider (solo riders, then team riders), by name: `entrant_key`, `name`, `team_name`, `has_photo` (`Yes`/`No`), `photo_file`, `photo_url`, `photo_path`. |
| `photos/zip` | `application/zip`, `Content-Disposition: attachment; filename="rider-photos.zip"`, `private, no-store`. One entry per rider with a photo, named `photo_file`. Stored, not compressed (JPEGs do not shrink). Streamed, downloads at most 8 at a time, `maxDuration = 60`. A photo that fails to download is left out and listed in a final `missing.txt` entry. |
| `photo/[signature]/[file]` | The picture (see Photo links). |

- `photo_url` is absolute, built from the request's origin.
- `?photo_dir=<folder>`: when given (at most 200 characters, no control
  characters), `photo_path` = folder + `\` + `photo_file` (no doubled
  separator; `/` is kept if the folder uses `/`). Otherwise `photo_path` is
  empty. This is how a vMix Data Source column can point at the unzipped files.
- A rider with no photo: all three photo columns empty.
- `?sample=` modes work as on the public feeds. Sample riders are invented, so
  their `photo_url` is one fixed placeholder image already in `public/`
  (absolute URL), `photo_file` = `sample-rider.png` or matching extension, and
  `sample` = `Yes`.
- Run ids come from the same snapshot the row is built from; if the public
  mappers strip the registration ids, read them from the raw snapshot.

Column lists live in `src/lib/broadcast/columns.ts` (no imports, like
`vmix-columns.ts`) and reuse the public lists so the two can never drift.

## Files and ownership

Code worker:
- `src/lib/broadcast/{key,photo-link,photo-index,columns,rows,zip}.ts`
- `src/app/api/broadcast/**`
- `src/lib/admin/headshot-urls.ts` (extraction only)
- `src/lib/broadcast/broadcast.test.mts`, added to `npm test` in `package.json`
- `.env.example`

Words worker:
- `src/app/privacy/page.tsx` and its test
- `docs/vmix-data-feed.md`, then `npm run build:guide`
- `docs/event-day-runbook.md` (one short entry), `README.md` if it lists env vars or routes

## Tests (node test runner, `.test.mts`)

- key: unset / short / wrong / right; no header form in the source.
- photo link: round trip; a tampered path or signature fails; a path outside
  the two shapes fails even with a valid signature; different key, different
  signature.
- rows: every column present on empty, single, section and sample rows;
  `photo_path` joining; file-name slug (non-ASCII names, empty, long).
- zip: written archive has correct local headers, central directory and CRCs
  (read it back).
- routes: each broadcast route checks the key first except `photo/...`, is
  `force-dynamic`, and the four public vMix routes are byte-for-byte unchanged.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.
