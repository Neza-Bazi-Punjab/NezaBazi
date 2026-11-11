// Rider photos for the PUBLIC vMix feeds (/api/live/vmix/current, leaderboard,
// entrants): `photo` = "<Rider Name>.png", `photo_url` = its link at
// /api/live/vmix/photo/<name>. No key: the graphics team binds a title image
// to photo_url.
//
// These feeds are polled every second on air, so a photo problem must never
// fail or slow one: the index is awaited for at most one second (whatever
// index exists, or none, meanwhile), and nothing here ever rejects.
import "server-only";

import { getPhotoIndex } from "@/lib/broadcast/photo-index";
import { SAMPLE_PHOTO_PUBLIC_PATH } from "@/lib/broadcast/rows";
import { VMIX_PHOTO_PATH_PREFIX } from "@/lib/scoring/vmix-columns";
import { NO_VMIX_PHOTOS, type VmixPhotos } from "@/lib/scoring/vmix";

export const PUBLIC_PHOTO_WAIT_MS = 1_000;

const linksFrom = (url: URL) => ({
  urlFor: (file: string) => `${url.origin}${VMIX_PHOTO_PATH_PREFIX}${encodeURIComponent(file)}`,
  sampleUrl: `${url.origin}${SAMPLE_PHOTO_PUBLIC_PATH}`,
});

/* ?sample= rows: the placeholder for every invented rider; no index read. */
export const sampleVmixPhotos = (url: URL): VmixPhotos => {
  try {
    return { ...linksFrom(url), fileFor: () => "" };
  } catch {
    return NO_VMIX_PHOTOS;
  }
};

/* The live rows' photos. Never rejects, never waits more than a second. */
export const loadVmixPhotos = async (url: URL): Promise<VmixPhotos> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const waited = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PUBLIC_PHOTO_WAIT_MS);
    });
    const index = await Promise.race([getPhotoIndex().catch(() => null), waited]);

    if (!index) {
      return NO_VMIX_PHOTOS;
    }

    const photos = index.photos;

    return {
      ...linksFrom(url),
      fileFor: (riderKey) => photos.get(riderKey)?.vmix_file ?? "",
    };
  } catch (error) {
    console.error("[vmix] photos unavailable", error instanceof Error ? error.message : error);
    return NO_VMIX_PHOTOS;
  } finally {
    clearTimeout(timer);
  }
};
