// GET /api/live/vmix/leaderboard — vMix Data Source: current round standings.
//
// Flat rows for vMix: rank, pool rank, pool, name, team, horse, short
// location, points, best result, runs and "Yes"/"No"/"" for advanced.
//   ?pool=A     only Pool A, ordered by pool rank
//   ?limit=10   at most 10 rows (default 50, maximum 200)
//   ?format=csv CSV with a header row instead of a JSON array
//   ?sample=1   rehearsal rows (sample = "Yes"); the database is not read
// Every field is always present; with nothing to show the response is one row
// of empty values, so vMix keeps a stable schema.
//
// Public like /api/live/state, built from the same assembled state — the
// scoring_* tables and view only, never a registration table.
import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { buildPublicLiveSnapshot } from "@/lib/scoring/server";
import {
  VMIX_LEADERBOARD_COLUMNS,
  readVmixLeaderboardQuery,
  toVmixLeaderboardRows,
  vmixResponse,
  wantsCsv,
  wantsSample,
} from "@/lib/scoring/vmix";
import { samplePublicLiveState } from "@/lib/scoring/vmix-sample";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const csv = wantsCsv(url);
  const query = readVmixLeaderboardQuery(url);

  if (wantsSample(url)) {
    return vmixResponse(
      VMIX_LEADERBOARD_COLUMNS,
      toVmixLeaderboardRows(samplePublicLiveState(), query, true),
      csv,
      PUBLIC_LIVE_CACHE
    );
  }

  try {
    const { state } = await buildPublicLiveSnapshot();

    return vmixResponse(
      VMIX_LEADERBOARD_COLUMNS,
      toVmixLeaderboardRows(state, query),
      csv,
      PUBLIC_LIVE_CACHE
    );
  } catch (error) {
    console.error("[scoring] vMix leaderboard failed", error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
