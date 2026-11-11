// Column lists of the keyed broadcast feeds (/api/broadcast/*), in the order
// the endpoints send them. `current` and `entrants` are the public vMix lists
// (vmix-columns.ts) with the photo columns added before `sample`, built from
// those lists so the two can never drift. Only vmix-columns.ts is imported
// (itself import-free), so the node test runner can load this file directly.
import {
  VMIX_CURRENT_COLUMNS,
  VMIX_ENTRANTS_COLUMNS,
  VMIX_PUBLIC_PHOTO_COLUMNS,
} from "../scoring/vmix-columns.ts";

/* Without `sample`, and without the public feeds' own photo columns (photo,
   photo_url, last_…): the keyed feeds keep the schema they always had. */
const withoutSample = (columns: readonly string[]) =>
  columns.filter(
    (column) => column !== "sample" && !(VMIX_PUBLIC_PHOTO_COLUMNS as readonly string[]).includes(column)
  );

export const PHOTO_COLUMNS = ["photo_url", "photo_file", "photo_path"] as const;

export const LAST_PHOTO_COLUMNS = ["last_photo_url", "last_photo_file", "last_photo_path"] as const;

export const MEMBER_PHOTO_COLUMNS = [
  "member_1_photo_url",
  "member_2_photo_url",
  "member_3_photo_url",
  "member_4_photo_url",
] as const;

export const BROADCAST_CURRENT_COLUMNS: readonly string[] = [
  ...withoutSample(VMIX_CURRENT_COLUMNS),
  ...PHOTO_COLUMNS,
  ...LAST_PHOTO_COLUMNS,
  "sample",
];

export const BROADCAST_ENTRANTS_COLUMNS: readonly string[] = [
  ...withoutSample(VMIX_ENTRANTS_COLUMNS),
  ...PHOTO_COLUMNS,
  ...MEMBER_PHOTO_COLUMNS,
  "sample",
];

export const BROADCAST_PHOTOS_COLUMNS = [
  "entrant_key",
  "name",
  "team_name",
  "has_photo",
  "photo_file",
  "photo_url",
  "photo_path",
] as const;
