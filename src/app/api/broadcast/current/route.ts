// GET /api/broadcast/current?key=… — the broadcast team's vMix Data Source:
// the public current row (/api/live/vmix/current) with the photos of the
// rider on course and of the last result: photo_url, photo_file, photo_path,
// last_photo_url, last_photo_file, last_photo_path, then sample.
//
// Keyed (src/lib/broadcast/key.ts). Same rules as the public feed: every
// column always present, `?format=csv`, `?sample=` modes (an invented rider's
// photo is one placeholder picture), one row of empty values when there is
// nothing to show. `?photo_dir=<folder>` fills photo_path with the unzipped
// file's path. A photo problem never fails the feed: the photo columns are
// just empty.
import { NextResponse } from "next/server";
import { verifyBroadcastKey } from "@/lib/broadcast/key";
import { BROADCAST_CURRENT_COLUMNS } from "@/lib/broadcast/columns";
import { getPhotoIndex } from "@/lib/broadcast/photo-index";
import { createPhotoContext, toBroadcastCurrentRow } from "@/lib/broadcast/rows";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE, publicLiveCacheFor } from "@/lib/scoring/http";
import { buildPublicLiveSnapshot } from "@/lib/scoring/server";
import { toVmixCurrentRow, vmixResponse, wantsCsv, wantsSample } from "@/lib/scoring/vmix";
import { vmixSampleSource } from "@/lib/scoring/vmix-sample-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = verifyBroadcastKey(request);
  if (!access.ok) {
    return access.response;
  }

  const url = new URL(request.url);
  const csv = wantsCsv(url);

  try {
    if (wantsSample(url)) {
      const sample = await vmixSampleSource(url);
      const state = sample.state();
      const context = createPhotoContext(url, access.secret, new Map());

      return vmixResponse(
        BROADCAST_CURRENT_COLUMNS,
        [
          toBroadcastCurrentRow(
            toVmixCurrentRow(state, sample.runsForRound(sample.liveRoundId).length, true),
            state,
            context,
            true
          ),
        ],
        csv,
        PUBLIC_LIVE_CACHE
      );
    }

    const [{ state, runCount }, index] = await Promise.all([
      buildPublicLiveSnapshot(),
      getPhotoIndex(),
    ]);
    const context = createPhotoContext(url, access.secret, index.photos);

    return vmixResponse(
      BROADCAST_CURRENT_COLUMNS,
      [toBroadcastCurrentRow(toVmixCurrentRow(state, runCount), state, context)],
      csv,
      publicLiveCacheFor(state)
    );
  } catch (error) {
    // vMix keeps showing its last good data on an HTTP error, which is better
    // on air than blanking every title.
    console.error("[broadcast] current row failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
