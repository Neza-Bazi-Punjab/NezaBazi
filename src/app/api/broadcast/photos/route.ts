// GET /api/broadcast/photos?key=… — the photo manifest: one row per
// registered rider (solo riders, then team riders, each by name):
// entrant_key, name, team_name, has_photo (Yes / No), photo_file, photo_url,
// photo_path. photo_file is the file's name in the ZIP (/api/broadcast/photos/zip);
// `?photo_dir=<folder>` fills photo_path with where the unzipped file sits.
// JSON array, or `?format=csv`. One row of empty values when there are no
// riders.
//
// Keyed (src/lib/broadcast/key.ts). Registration names are read here, which
// is why this is behind the key and not public like /api/live/*.
import { NextResponse } from "next/server";
import { verifyBroadcastKey } from "@/lib/broadcast/key";
import { BROADCAST_PHOTOS_COLUMNS } from "@/lib/broadcast/columns";
import { getPhotoIndex } from "@/lib/broadcast/photo-index";
import { createPhotoContext, toBroadcastPhotoRows } from "@/lib/broadcast/rows";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { vmixResponse, wantsCsv } from "@/lib/scoring/vmix";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = verifyBroadcastKey(request);
  if (!access.ok) {
    return access.response;
  }

  const url = new URL(request.url);

  try {
    const index = await getPhotoIndex();
    const context = createPhotoContext(url, access.secret, index.photos);

    return vmixResponse(
      BROADCAST_PHOTOS_COLUMNS,
      toBroadcastPhotoRows(index.riders, context),
      wantsCsv(url),
      PUBLIC_LIVE_CACHE
    );
  } catch (error) {
    console.error("[broadcast] photo manifest failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "The photo list is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
