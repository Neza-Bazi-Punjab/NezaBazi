// GET /api/broadcast/photos/zip?key=… — every rider's photo in one ZIP, for
// local files on the vMix computer (instant, and independent of venue
// internet). One entry per rider with a photo, named as photo_file in the
// manifest (/api/broadcast/photos). Stored, not compressed (JPEGs do not
// shrink), and streamed: photos are downloaded at most 8 at a time and sent
// as they arrive, so the archive (about 20 MB) is never held in memory. A
// photo that fails to download is left out and listed in a final
// missing.txt.
//
// Keyed (src/lib/broadcast/key.ts); private, never cached.
import { HEADSHOT_BUCKET } from "@/lib/headshots";
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyBroadcastKey } from "@/lib/broadcast/key";
import { getPhotoIndex } from "@/lib/broadcast/photo-index";
import { mapInOrder, zipStream, type ZipSourceFile } from "@/lib/broadcast/zip";
import { PRIVATE_NO_STORE } from "@/lib/scoring/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DOWNLOADS_AT_ONCE = 8;

export async function GET(request: Request) {
  const access = verifyBroadcastKey(request);
  if (!access.ok) {
    return access.response;
  }

  const index = await getPhotoIndex({ waitForBuild: true });
  const client = createServiceRoleClient();
  const riders = index.riders.filter(
    (rider): rider is typeof rider & { photo: NonNullable<typeof rider.photo> } => rider.photo !== null
  );

  const download = async (rider: (typeof riders)[number]): Promise<ZipSourceFile> => {
    try {
      const { data, error } = await client.storage.from(HEADSHOT_BUCKET).download(rider.photo.path);

      if (error || !data) {
        throw error ?? new Error("No data.");
      }

      return { name: rider.photo.file, data: new Uint8Array(await data.arrayBuffer()) };
    } catch (error) {
      console.error("[broadcast] zip photo download failed", error instanceof Error ? error.message : error);
      return { name: rider.photo.file, data: null, note: rider.name };
    }
  };

  return new Response(zipStream(mapInOrder(riders, DOWNLOADS_AT_ONCE, download)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="rider-photos.zip"',
      "Cache-Control": PRIVATE_NO_STORE,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
