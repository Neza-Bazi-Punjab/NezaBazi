// GET /api/live/vmix/leaderboard — vMix Data Source: current round standings.
//
// Flat rows for vMix: rank, pool rank, pool, name, team, horse, short
// location, points, best result, runs, "Yes"/"No"/"" for advanced, and a
// Single rider's photo (photo / photo_url; empty for a Section side).
//   ?pool=A     only Pool A, ordered by pool rank
//   ?limit=10   at most 10 rows (default 50, maximum 200)
//   ?format=csv CSV with a header row instead of a JSON array
//   ?sample=1   rehearsal rows (sample = "Yes"); the database is not read
//   ?sample=solo moving rehearsal rows while switched on (vmix-sample-live.ts)
// Every field is always present; with nothing to show the response is one row
// of empty values, so vMix keeps a stable schema.
//
// Public like /api/live/state, built from the same assembled state — the
// scoring_* tables and view — plus each rider's photo name and link from the
// photo index (public-photos.ts: at most a second's wait, and a photo problem
// only empties the photo columns).
import { NextResponse } from "next/server";
import { loadVmixPhotos, sampleVmixPhotos } from "@/lib/broadcast/public-photos";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE, publicLiveCacheFor } from "@/lib/scoring/http";
import { buildPublicLiveSnapshot } from "@/lib/scoring/server";
import {
  VMIX_LEADERBOARD_COLUMNS,
  readVmixLeaderboardQuery,
  toVmixLeaderboardRows,
  vmixResponse,
  wantsCsv,
  wantsSample,
} from "@/lib/scoring/vmix";
import { vmixSampleSource } from "@/lib/scoring/vmix-sample-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const csv = wantsCsv(url);
  const query = readVmixLeaderboardQuery(url);

  if (wantsSample(url)) {
    return vmixResponse(
      VMIX_LEADERBOARD_COLUMNS,
      toVmixLeaderboardRows((await vmixSampleSource(url)).state(), query, true, sampleVmixPhotos(url)),
      csv,
      PUBLIC_LIVE_CACHE
    );
  }

  try {
    const photosPending = loadVmixPhotos(url);
    const { state } = await buildPublicLiveSnapshot();
    const photos = await photosPending;

    return vmixResponse(
      VMIX_LEADERBOARD_COLUMNS,
      toVmixLeaderboardRows(state, query, false, photos),
      csv,
      publicLiveCacheFor(state)
    );
  } catch (error) {
    console.error("[scoring] vMix leaderboard failed", error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
