import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  BROADCAST_KEY_REQUIRED_MESSAGE,
  BROADCAST_NOT_SET_UP_MESSAGE,
  checkBroadcastKey,
  readBroadcastSecret,
  verifyBroadcastKey,
} from "./key.ts";
import {
  buildPhotoLink,
  encodePhotoPath,
  isAllowedPhotoPath,
  readPhotoLink,
  signPhotoPath,
} from "./photo-link.ts";
import {
  BROADCAST_CURRENT_COLUMNS,
  BROADCAST_ENTRANTS_COLUMNS,
  BROADCAST_PHOTOS_COLUMNS,
} from "./columns.ts";
import {
  SAMPLE_PHOTO_FILE,
  createPhotoContext,
  joinPhotoPath,
  photoFileName,
  readPhotoDir,
  slugifyName,
  toBroadcastCurrentRow,
  toBroadcastEntrantRows,
  toBroadcastPhotoRows,
  type IndexedRider,
  type RiderPhoto,
} from "./rows.ts";
import { MISSING_LIST_NAME, createStoredZipWriter, mapInOrder, zipStream } from "./zip.ts";
import { crc32 } from "../xlsx/write-xlsx.ts";
import { VMIX_CURRENT_COLUMNS, VMIX_ENTRANTS_COLUMNS } from "../scoring/vmix-columns.ts";
import type { PublicLiveState, ScoringRound, ScoringRun } from "../scoring/types.ts";
import type { VmixCurrentRow, VmixEntrantRow } from "../scoring/vmix.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const SECRET = "test-secret-0123456789-abcdefghij";
const OTHER_SECRET = "another-secret-0123456789-abcdefgh";
const PROFILE = "6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab";
const ROW = "a1b2c3d4-0000-4000-8000-00000000abcd";
const ACCOUNT_PATH = `${PROFILE}/0f9e8d7c-6b5a-4938-8271-605f4e3d2c1b.jpg`;
const PAPER_PATH = `paper/${ROW}/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.jpg`;

/* The key -------------------------------------------------------------------- */

test("key: unset or short is not set up (503)", () => {
  assert.equal(readBroadcastSecret(undefined), null);
  assert.equal(readBroadcastSecret(""), null);
  assert.equal(readBroadcastSecret("x".repeat(23)), null);
  assert.equal(readBroadcastSecret("x".repeat(24)), "x".repeat(24));

  const url = new URL(`https://example.test/api/broadcast/current?key=${SECRET}`);
  assert.deepEqual(checkBroadcastKey(url, null), {
    ok: false,
    status: 503,
    error: BROADCAST_NOT_SET_UP_MESSAGE,
  });
});

test("key: missing or wrong is 401, right is allowed", () => {
  const base = "https://example.test/api/broadcast/current";
  const refused = { ok: false, status: 401, error: BROADCAST_KEY_REQUIRED_MESSAGE };

  assert.deepEqual(checkBroadcastKey(new URL(base), SECRET), refused);
  assert.deepEqual(checkBroadcastKey(new URL(`${base}?key=`), SECRET), refused);
  assert.deepEqual(checkBroadcastKey(new URL(`${base}?key=${SECRET}x`), SECRET), refused);
  assert.deepEqual(checkBroadcastKey(new URL(`${base}?key=${SECRET.slice(0, -1)}`), SECRET), refused);
  assert.deepEqual(checkBroadcastKey(new URL(`${base}?key=${SECRET}`), SECRET), { ok: true, secret: SECRET });
});

test("key: responses are private, carry no key, and a header is never accepted", async () => {
  const headerOnly = new Request("https://example.test/api/broadcast/current", {
    headers: { "x-broadcast-key": SECRET, authorization: `Bearer ${SECRET}` },
  });
  const refused = verifyBroadcastKey(headerOnly, SECRET);
  assert.equal(refused.ok, false);

  if (!refused.ok) {
    assert.equal(refused.response.status, 401);
    assert.equal(refused.response.headers.get("cache-control"), "private, no-store");
    const body = await refused.response.text();
    assert.doesNotMatch(body, new RegExp(SECRET));
    assert.deepEqual(JSON.parse(body), { error: BROADCAST_KEY_REQUIRED_MESSAGE });
  }

  const unset = verifyBroadcastKey(new Request(`https://example.test/x?key=${SECRET}`), null);
  assert.equal(unset.ok, false);

  if (!unset.ok) {
    assert.equal(unset.response.status, 503);
    assert.equal(unset.response.headers.get("cache-control"), "private, no-store");
  }

  assert.equal(verifyBroadcastKey(new Request(`https://example.test/x?key=${SECRET}`), SECRET).ok, true);

  const source = repoFile("src/lib/broadcast/key.ts");
  assert.doesNotMatch(source, /headers\.get\(/);
  assert.doesNotMatch(source, /console\./);
  assert.match(source, /timingSafeEqual\(digest\(given\), digest\(expected\)\)/);
});

/* Photo links ------------------------------------------------------------------ */

const linkParts = (link: string) => {
  const match = link.match(/^https:\/\/example\.test\/api\/broadcast\/photo\/([^/]+)\/([^/]+)$/);
  assert.ok(match, link);
  return { signature: match[1], file: match[2] };
};

test("photo link: round trip for both path shapes", () => {
  for (const path of [ACCOUNT_PATH, PAPER_PATH]) {
    const link = buildPhotoLink("https://example.test", SECRET, path);
    const { signature, file } = linkParts(link);

    assert.equal(signature.length, 32);
    assert.match(signature, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(file, `${encodePhotoPath(path)}.jpg`);
    assert.equal(readPhotoLink(SECRET, signature, file), path);
  }
});

test("photo link: a tampered path or signature fails", () => {
  const { signature, file } = linkParts(buildPhotoLink("https://example.test", SECRET, ACCOUNT_PATH));
  const otherPath = `${PROFILE}/ffffffff-6b5a-4938-8271-605f4e3d2c1b.jpg`;

  assert.equal(readPhotoLink(SECRET, signature, `${encodePhotoPath(otherPath)}.jpg`), null);
  const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  assert.equal(readPhotoLink(SECRET, flipped, file), null);
  assert.equal(readPhotoLink(SECRET, signature.slice(1), file), null);
  assert.equal(readPhotoLink(SECRET, `${signature}A`, file), null);
  assert.equal(readPhotoLink(SECRET, signature, file.replace(/\.jpg$/, ".png")), null);
  assert.equal(readPhotoLink(SECRET, signature, file.replace(/\.jpg$/, "")), null);
  assert.equal(readPhotoLink(SECRET, signature, `${file.slice(0, -4)}=.jpg`), null);
  assert.equal(readPhotoLink(null, signature, file), null);
});

test("photo link: a path outside the two shapes fails even with a valid signature", () => {
  for (const path of [
    "secret.txt",
    `${PROFILE}/../${PROFILE}/x.jpg`,
    `${PROFILE}/..`,
    `${PROFILE}/a/b.jpg`,
    `paper/${ROW}/..`,
    `paper/not-a-uuid/x.jpg`,
    `other/${ROW}/x.jpg`,
    `paper/${ROW}`,
    `/${PROFILE}/x.jpg`,
    `${PROFILE}/x y.jpg`,
  ]) {
    assert.equal(isAllowedPhotoPath(path), false, path);
    const signature = signPhotoPath(SECRET, path);
    assert.equal(readPhotoLink(SECRET, signature, `${encodePhotoPath(path)}.jpg`), null, path);
  }

  assert.equal(isAllowedPhotoPath(ACCOUNT_PATH), true);
  assert.equal(isAllowedPhotoPath(PAPER_PATH), true);
});

test("photo link: a different key gives a different signature, and old links stop working", () => {
  assert.notEqual(signPhotoPath(SECRET, ACCOUNT_PATH), signPhotoPath(OTHER_SECRET, ACCOUNT_PATH));
  const { signature, file } = linkParts(buildPhotoLink("https://example.test", SECRET, ACCOUNT_PATH));
  assert.equal(readPhotoLink(OTHER_SECRET, signature, file), null);
});

/* Columns ---------------------------------------------------------------------- */

test("columns: the public lists, then the photo columns, then sample", () => {
  assert.deepEqual(BROADCAST_CURRENT_COLUMNS, [
    ...VMIX_CURRENT_COLUMNS.filter((column) => column !== "sample"),
    "photo_url",
    "photo_file",
    "photo_path",
    "last_photo_url",
    "last_photo_file",
    "last_photo_path",
    "sample",
  ]);
  assert.deepEqual(BROADCAST_ENTRANTS_COLUMNS, [
    ...VMIX_ENTRANTS_COLUMNS.filter((column) => column !== "sample"),
    "photo_url",
    "photo_file",
    "photo_path",
    "member_1_photo_url",
    "member_2_photo_url",
    "member_3_photo_url",
    "member_4_photo_url",
    "sample",
  ]);
  assert.deepEqual(BROADCAST_PHOTOS_COLUMNS, [
    "entrant_key",
    "name",
    "team_name",
    "has_photo",
    "photo_file",
    "photo_url",
    "photo_path",
  ]);
});

/* Rows ------------------------------------------------------------------------- */

const NOW = "2026-11-11T10:00:00.000Z";

const run = (overrides: Partial<ScoringRun>): ScoringRun => ({
  id: "run-1",
  round_id: "round-1",
  run_order: 1,
  attempt_number: 1,
  pool_label: "A",
  entrant_key: "solo:solo-1",
  solo_registration_id: "solo-1",
  team_member_id: null,
  team_id: null,
  rider_name: "Harpreet Singh",
  horse_name: "Badal",
  team_name: null,
  rider_location: "Amritsar, Punjab",
  status: "pending",
  result: null,
  points: null,
  scored_by: null,
  scored_at: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const round = (eventType: "single" | "section"): ScoringRound => ({
  id: "round-1",
  event_type: eventType,
  name: eventType === "single" ? "Qualification" : "Section 1",
  round_number: eventType === "single" ? 0 : 1,
  attempts_per_rider: eventType === "single" ? 3 : 1,
  target_points: eventType === "single" ? null : 8,
  status: "live",
  sort_order: 1,
  pool_size: null,
  podium: null,
  created_at: NOW,
  updated_at: NOW,
});

const state = (overrides: Partial<PublicLiveState>): PublicLiveState => ({
  configured: true,
  generated_at: NOW,
  live: null,
  current_round: null,
  current_run: null,
  last_scored_run: null,
  recent_results: [],
  up_next: [],
  leaderboard: [],
  pools: [],
  pool_rosters: {},
  next_pool_label: null,
  rounds: [],
  ...overrides,
});

const baseCurrent = (sample: "Yes" | "No" = "No"): VmixCurrentRow =>
  Object.fromEntries(
    VMIX_CURRENT_COLUMNS.map((column) => [column, column === "sample" ? sample : ""])
  ) as unknown as VmixCurrentRow;

const baseEntrant = (entrantKey: string, sample: "Yes" | "No" = "No"): VmixEntrantRow =>
  Object.fromEntries(
    VMIX_ENTRANTS_COLUMNS.map((column) => [
      column,
      column === "sample" ? sample : column === "entrant_key" ? entrantKey : "",
    ])
  ) as unknown as VmixEntrantRow;

const photos = new Map<string, RiderPhoto>([
  ["solo:solo-1", { path: ACCOUNT_PATH, file: "harpreet-singh-solo1.jpg" }],
  ["member:m-1", { path: PAPER_PATH, file: "rider-one-m1.jpg" }],
  ["member:m-3", { path: ACCOUNT_PATH, file: "rider-three-m3.jpg" }],
]);

const contextFor = (query = "") =>
  createPhotoContext(new URL(`https://example.test/api/broadcast/current?key=k${query}`), SECRET, photos);

const assertEveryColumn = (row: Record<string, unknown>, columns: readonly string[]) => {
  assert.deepEqual(Object.keys(row).sort(), [...columns].sort());

  for (const column of columns) {
    assert.notEqual(row[column], null, column);
    assert.notEqual(row[column], undefined, column);
  }
};

test("rows: current, empty, with a photo, between riders, and sample", () => {
  const empty = toBroadcastCurrentRow(baseCurrent(), state({}), contextFor());
  assertEveryColumn(empty, BROADCAST_CURRENT_COLUMNS);
  assert.equal(empty.photo_url, "");
  assert.equal(empty.last_photo_file, "");
  assert.deepEqual(Object.keys(empty), [...BROADCAST_CURRENT_COLUMNS]);

  const onCourse = run({ id: "run-2", status: "on_course" });
  const lastScored = run({ id: "run-9", solo_registration_id: "solo-2", status: "scored" });
  const live = toBroadcastCurrentRow(
    baseCurrent(),
    state({ current_round: round("single"), current_run: onCourse, last_scored_run: lastScored }),
    contextFor("&photo_dir=C:\\Photos")
  );
  assertEveryColumn(live, BROADCAST_CURRENT_COLUMNS);
  assert.equal(live.photo_url, buildPhotoLink("https://example.test", SECRET, ACCOUNT_PATH));
  assert.equal(live.photo_file, "harpreet-singh-solo1.jpg");
  assert.equal(live.photo_path, "C:\\Photos\\harpreet-singh-solo1.jpg");
  // The last rider has no photo: all three empty.
  assert.deepEqual([live.last_photo_url, live.last_photo_file, live.last_photo_path], ["", "", ""]);
  assert.equal(live.sample, "No");

  // Between riders: the rider who has just ridden, as the public row.
  const between = toBroadcastCurrentRow(
    baseCurrent(),
    state({ current_round: round("single"), current_run: null, last_scored_run: run({ status: "scored" }) }),
    contextFor()
  );
  assert.equal(between.photo_file, "harpreet-singh-solo1.jpg");
  assert.equal(between.last_photo_file, "harpreet-singh-solo1.jpg");
  assert.equal(between.photo_path, "");

  const sample = toBroadcastCurrentRow(
    baseCurrent("Yes"),
    state({ current_round: round("single"), current_run: onCourse }),
    contextFor(),
    true
  );
  assertEveryColumn(sample, BROADCAST_CURRENT_COLUMNS);
  assert.equal(sample.photo_url, "https://example.test/icons/icon-512.png");
  assert.equal(sample.photo_file, SAMPLE_PHOTO_FILE);
  assert.equal(sample.last_photo_url, "");
  assert.equal(sample.sample, "Yes");
});

test("rows: entrants, empty, single, section and sample", () => {
  const empty = toBroadcastEntrantRows([baseEntrant("")], null, [], contextFor());
  assert.equal(empty.length, 1);
  assertEveryColumn(empty[0], BROADCAST_ENTRANTS_COLUMNS);
  assert.deepEqual(Object.keys(empty[0]), [...BROADCAST_ENTRANTS_COLUMNS]);

  const single = toBroadcastEntrantRows(
    [baseEntrant("solo:solo-1"), baseEntrant("solo:solo-2")],
    round("single"),
    [
      run({ id: "r1", run_order: 1 }),
      run({ id: "r2", run_order: 2, entrant_key: "solo:solo-2", solo_registration_id: "solo-2" }),
      run({ id: "r3", run_order: 3, attempt_number: 2 }),
    ],
    contextFor("&photo_dir=/Volumes/Photos/")
  );
  assertEveryColumn(single[0], BROADCAST_ENTRANTS_COLUMNS);
  assert.equal(single[0].photo_file, "harpreet-singh-solo1.jpg");
  assert.equal(single[0].photo_path, "/Volumes/Photos/harpreet-singh-solo1.jpg");
  assert.equal(single[0].member_1_photo_url, "");
  assert.deepEqual([single[1].photo_url, single[1].photo_file, single[1].photo_path], ["", "", ""]);

  const teamRun = (id: string, order: number, member: string, name: string) =>
    run({
      id,
      run_order: order,
      entrant_key: "team:t-1",
      solo_registration_id: null,
      team_member_id: member,
      team_id: "t-1",
      rider_name: name,
      team_name: "Lions",
    });
  const sectionRuns = [
    teamRun("s3", 3, "m-3", "Rider Three"),
    teamRun("s1", 1, "m-1", "Rider One"),
    teamRun("s2", 2, "m-2", "Rider Two"),
    teamRun("s4", 4, "m-4", "Rider Four"),
    teamRun("s5", 5, "m-1", "Rider One"),
  ];
  const [section] = toBroadcastEntrantRows([baseEntrant("team:t-1")], round("section"), sectionRuns, contextFor());
  assertEveryColumn(section, BROADCAST_ENTRANTS_COLUMNS);
  assert.deepEqual([section.photo_url, section.photo_file, section.photo_path], ["", "", ""]);
  // In the order of `members`: first appearance in run order.
  assert.equal(section.member_1_photo_url, buildPhotoLink("https://example.test", SECRET, PAPER_PATH));
  assert.equal(section.member_2_photo_url, "");
  assert.equal(section.member_3_photo_url, buildPhotoLink("https://example.test", SECRET, ACCOUNT_PATH));
  assert.equal(section.member_4_photo_url, "");

  const [sampleSection] = toBroadcastEntrantRows(
    [baseEntrant("team:t-1", "Yes")],
    round("section"),
    sectionRuns,
    contextFor(),
    true
  );
  assertEveryColumn(sampleSection, BROADCAST_ENTRANTS_COLUMNS);
  assert.equal(sampleSection.member_2_photo_url, "https://example.test/icons/icon-512.png");
  assert.equal(sampleSection.sample, "Yes");

  const [sampleSingle] = toBroadcastEntrantRows(
    [baseEntrant("solo:solo-2", "Yes")],
    round("single"),
    [run({ entrant_key: "solo:solo-2", solo_registration_id: "solo-2" })],
    contextFor("&photo_dir=D:\\vmix"),
    true
  );
  assert.equal(sampleSingle.photo_file, SAMPLE_PHOTO_FILE);
  assert.equal(sampleSingle.photo_path, `D:\\vmix\\${SAMPLE_PHOTO_FILE}`);
});

test("rows: the photo manifest, solo riders then team riders by name", () => {
  const riders: IndexedRider[] = [
    { key: "member:m-1", kind: "team", entrant_key: "team:t-1", name: "Zorawar Singh", team_name: "Lions", photo: { path: PAPER_PATH, file: "zorawar-singh-m1.jpg" } },
    { key: "solo:s-2", kind: "solo", entrant_key: "solo:s-2", name: "manpreet kaur", team_name: "", photo: null },
    { key: "solo:s-1", kind: "solo", entrant_key: "solo:s-1", name: "Amandeep Singh", team_name: "", photo: { path: ACCOUNT_PATH, file: "amandeep-singh-s1.jpg" } },
    { key: "member:m-2", kind: "team", entrant_key: "team:t-1", name: "Balraj Singh", team_name: "Lions", photo: null },
  ];
  const rows = toBroadcastPhotoRows(riders, contextFor("&photo_dir=C:\\P"));

  assert.deepEqual(rows.map((row) => row.name), ["Amandeep Singh", "manpreet kaur", "Balraj Singh", "Zorawar Singh"]);

  for (const row of rows) {
    assertEveryColumn(row, BROADCAST_PHOTOS_COLUMNS);
  }

  assert.equal(rows[0].has_photo, "Yes");
  assert.equal(rows[0].photo_path, "C:\\P\\amandeep-singh-s1.jpg");
  assert.deepEqual([rows[1].has_photo, rows[1].photo_url, rows[1].photo_file, rows[1].photo_path], ["No", "", "", ""]);

  const empty = toBroadcastPhotoRows([], contextFor());
  assert.equal(empty.length, 1);
  assertEveryColumn(empty[0], BROADCAST_PHOTOS_COLUMNS);
});

test("rows: photo_path joining and ?photo_dir= limits", () => {
  assert.equal(joinPhotoPath("C:\\Photos", "a.jpg"), "C:\\Photos\\a.jpg");
  assert.equal(joinPhotoPath("C:\\Photos\\", "a.jpg"), "C:\\Photos\\a.jpg");
  assert.equal(joinPhotoPath("/Users/vmix/photos", "a.jpg"), "/Users/vmix/photos/a.jpg");
  assert.equal(joinPhotoPath("/Users/vmix/photos/", "a.jpg"), "/Users/vmix/photos/a.jpg");
  assert.equal(joinPhotoPath("Photos", "a.jpg"), "Photos\\a.jpg");
  assert.equal(joinPhotoPath("C:/Photos", "a.jpg"), "C:/Photos/a.jpg");

  const dir = (value: string) => readPhotoDir(new URL(`https://example.test/?photo_dir=${encodeURIComponent(value)}`));
  assert.equal(readPhotoDir(new URL("https://example.test/")), null);
  assert.equal(dir(""), null);
  assert.equal(dir("   "), null);
  assert.equal(dir("C:\\Photos"), "C:\\Photos");
  assert.equal(dir("x".repeat(200)), "x".repeat(200));
  assert.equal(dir("x".repeat(201)), null);
  assert.equal(dir("C:\\Pho\ntos"), null);
  assert.equal(dir("C:\\Pho\u0000tos"), null);
});

test("rows: file names are lower-case ASCII slugs with the first 8 of the id", () => {
  assert.equal(photoFileName("Harpreet Singh Sandhu", ROW), "harpreet-singh-sandhu-a1b2c3d4.jpg");
  assert.equal(photoFileName("  José  Ñúñez!! ", ROW), "jose-nunez-a1b2c3d4.jpg");
  assert.equal(photoFileName("ਹਰਪ੍ਰੀਤ ਸਿੰਘ", ROW), "rider-a1b2c3d4.jpg");
  assert.equal(photoFileName("", ROW), "rider-a1b2c3d4.jpg");
  assert.equal(photoFileName(null, ROW), "rider-a1b2c3d4.jpg");

  const long = photoFileName("Abcdefghij ".repeat(10), ROW);
  const slug = long.slice(0, -"-a1b2c3d4.jpg".length);
  assert.ok(slug.length <= 40, slug);
  assert.match(long, /^[a-z0-9-]+\.jpg$/);
  assert.doesNotMatch(slug, /-$/);
  assert.equal(slugifyName("a".repeat(39) + " b"), "a".repeat(39));
});

/* ZIP -------------------------------------------------------------------------- */

type ReadEntry = { name: string; data: Uint8Array; crc: number; method: number };

/* Reads a ZIP back from its central directory, checking every local header
   against it and every CRC against the data. */
const readZip = (bytes: Uint8Array): ReadEntry[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50, "end record");
  const count = view.getUint16(end + 10, true);
  assert.equal(view.getUint16(end + 8, true), count);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  assert.equal(centralOffset + centralSize, end, "central directory runs up to the end record");

  const entries: ReadEntry[] = [];
  let at = centralOffset;

  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50, "central header");
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, "local header");
    assert.equal(view.getUint16(localOffset + 8, true), method);
    assert.equal(view.getUint32(localOffset + 14, true), crc);
    assert.equal(view.getUint32(localOffset + 18, true), compressed);
    assert.equal(view.getUint32(localOffset + 22, true), size);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    assert.equal(
      new TextDecoder().decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)),
      name
    );
    const dataStart = localOffset + 30 + localNameLength + localExtra;
    const data = bytes.subarray(dataStart, dataStart + compressed);

    assert.equal(method, 0, "stored");
    assert.equal(compressed, size);
    assert.equal(crc32(data), crc, `${name} CRC`);
    entries.push({ name, data, crc, method });
    at += 46 + nameLength + extra + comment;
  }

  return entries;
};

const concat = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let at = 0;

  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }

  return output;
};

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      return concat(chunks);
    }

    chunks.push(value);
  }
};

test("zip: written archive has correct local headers, central directory and CRCs", () => {
  const writer = createStoredZipWriter(new Date("2026-11-11T09:30:12Z"));
  const files = [
    { name: "harpreet-singh-a1b2c3d4.jpg", data: new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]) },
    { name: "rider-00000000.jpg", data: new Uint8Array(70_000).map((_, index) => index % 251) },
    { name: "empty.txt", data: new Uint8Array(0) },
  ];
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    chunks.push(...writer.addFile(file.name, file.data));
  }

  chunks.push(writer.finish());
  const entries = readZip(concat(chunks));

  assert.deepEqual(entries.map((entry) => entry.name), files.map((file) => file.name));
  entries.forEach((entry, index) => assert.deepEqual(entry.data, files[index].data));
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.throws(() => writer.finish());
});

test("zip: the stream keeps order, leaves failures out and lists them in missing.txt", async () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  let running = 0;
  let most = 0;

  const files = mapInOrder(items, 3, async (item) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, item === "b" ? 15 : 2));
    running -= 1;
    return item === "d"
      ? { name: `${item}.jpg`, data: null, note: "Rider D" }
      : { name: `${item}.jpg`, data: new TextEncoder().encode(`photo ${item}`) };
  });

  const entries = readZip(await collect(zipStream(files)));
  assert.ok(most <= 3, `at most 3 at once, saw ${most}`);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    [...items.filter((item) => item !== "d").map((item) => `${item}.jpg`), MISSING_LIST_NAME]
  );
  assert.match(new TextDecoder().decode(entries.at(-1)!.data), /d\.jpg\tRider D/);

  async function* none() {}
  assert.deepEqual(readZip(await collect(zipStream(none()))), []);

  async function* allMissing() {
    yield { name: "x.jpg", data: null };
    yield { name: "y.jpg", data: null, note: "Rider Y" };
  }
  const onlyList = readZip(await collect(zipStream(allMissing())));
  assert.deepEqual(onlyList.map((entry) => entry.name), [MISSING_LIST_NAME]);
  assert.match(new TextDecoder().decode(onlyList[0].data), /x\.jpg\r\ny\.jpg\tRider Y/);
});

/* Routes ----------------------------------------------------------------------- */

const routesUnder = (directory: string) =>
  readdirSync(new URL(`../../../${directory}`, import.meta.url), { recursive: true })
    .map((entry) => String(entry).replace(/\\/g, "/"))
    .filter((entry) => entry.endsWith("route.ts"))
    .map((entry) => `${directory}/${entry}`)
    .sort();

const PHOTO_ROUTE = "src/app/api/broadcast/photo/[signature]/[file]/route.ts";

test("routes: every broadcast route exists, is dynamic, and checks the key first", () => {
  const routes = routesUnder("src/app/api/broadcast");
  assert.deepEqual(routes, [
    "src/app/api/broadcast/current/route.ts",
    "src/app/api/broadcast/entrants/route.ts",
    PHOTO_ROUTE,
    "src/app/api/broadcast/photos/route.ts",
    "src/app/api/broadcast/photos/zip/route.ts",
  ]);

  for (const path of routes) {
    const source = repoFile(path);
    assert.match(source, /export const dynamic = "force-dynamic";/, path);
    assert.equal((source.match(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? []).length, 1, path);
    assert.doesNotMatch(source, /headers\.get\(/, path);

    if (path === PHOTO_ROUTE) {
      assert.doesNotMatch(source, /verifyBroadcastKey/);
      assert.match(source, /readPhotoLink\(readBroadcastSecret\(\), signature, file\)/);
      assert.match(source, /"Cache-Control": "public, max-age=604800, s-maxage=604800, immutable"/);
      assert.match(source, /"X-Content-Type-Options": "nosniff"/);
      assert.match(source, /"X-Robots-Tag": "noindex"/);
      assert.match(source, /status: 404,[\s\S]*?"Cache-Control": "private, no-store"/);
      continue;
    }

    // The key check is the handler's first statement.
    assert.match(
      source,
      /export async function GET\(request: Request\) \{\s*const access = verifyBroadcastKey\(request\);\s*if \(!access\.ok\) \{\s*return access\.response;\s*\}/,
      path
    );
  }

  const zip = repoFile("src/app/api/broadcast/photos/zip/route.ts");
  assert.match(zip, /export const maxDuration = 60;/);
  assert.match(zip, /const DOWNLOADS_AT_ONCE = 8;/);
  assert.match(zip, /"Content-Type": "application\/zip"/);
  assert.match(zip, /"Content-Disposition": 'attachment; filename="rider-photos\.zip"'/);
  assert.match(zip, /"Cache-Control": PRIVATE_NO_STORE/);
  assert.match(zip, /new Response\(zipStream\(/);

  for (const path of ["current", "entrants", "photos"]) {
    assert.match(repoFile(`src/app/api/broadcast/${path}/route.ts`), /PUBLIC_LIVE_CACHE/);
  }
});

test("routes: the photo index uses the admin lists' rule and never signs URLs", () => {
  const index = repoFile("src/lib/broadcast/photo-index.ts");
  assert.match(index, /import "server-only";/);
  assert.match(index, /chooseSoloHeadshotPaths\(authIndex, soloRows\)/);
  assert.match(index, /chooseTeamHeadshotPaths\(\s*authIndex,\s*memberRows,\s*leaderProfileByTeam,\s*soloProfileByEmail\s*\)/);
  assert.match(index, /loadAuthUserIndex\(client\)/);
  assert.doesNotMatch(index, /createSignedUrl/);
  assert.match(index, /const INDEX_LIFETIME_MS = 30_000;/);

  const headshots = repoFile("src/lib/admin/headshot-urls.ts");
  assert.match(headshots, /chooseSoloHeadshotPaths\(index, registrations\)/);
  assert.match(headshots, /chooseTeamHeadshotPaths\(\s*index,\s*members,/);
});

/* The four public vMix routes, byte for byte (line endings aside), as they
   were when the broadcast feeds were added beside them. */
const PUBLIC_VMIX_ROUTE_HASHES: Record<string, string> = {
  current: "c6f80c8324fe4f345e1d2eab19a623b3f9bcf486b1f107624c482a45887b6a34",
  entrants: "1bfab214b1748c9a626c7c7b6821e1692d41b10f4d647e1f85346c72b0671f86",
  leaderboard: "2e71d85caee211132de1f6e5cb1fdec5a77dd03f2bea82ecac21fa9eb99292f8",
  rounds: "cec01f7e12d79c90c87556c8567116855fd2fd1783809f6de4ada2d5dcfc3933",
};

test("routes: the four public vMix routes are unchanged", () => {
  for (const [name, hash] of Object.entries(PUBLIC_VMIX_ROUTE_HASHES)) {
    const source = repoFile(`src/app/api/live/vmix/${name}/route.ts`).replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(source).digest("hex"), hash, name);
    assert.doesNotMatch(source, /broadcast|photo/i, name);
  }
});
