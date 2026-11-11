// GET /api/live/vmix/entrants — vMix Data Source: a round's entrants.
//
// One flat row per entrant in start order (the position of their first run):
// pool, name, team, horse, short location, the four riders of a Section side
// in `members`, progress (runs_total / runs_scored), points, best result,
// advanced, rank and pool rank, and a Single rider's photo (photo /
// photo_url; empty for a Section side).
//   ?round=<round_id>  that round (ids from /api/live/vmix/rounds); default:
//                      the live round
//   ?format=csv        CSV with a header row instead of a JSON array
//   ?sample=1          rehearsal rows (sample = "Yes"); the database is not read
//   ?sample=solo       moving rehearsal rows while switched on (vmix-sample-live.ts)
// Every field is always present; with nothing to show the response is one row
// of empty values, so vMix keeps a stable schema.
//
// Public: built from the scoring_* tables and view, read as the anonymous
// role, plus each rider's photo name and link from the photo index
// (public-photos.ts: at most a second's wait, and a photo problem only
// empties the photo columns).
import { NextResponse } from "next/server";
import { loadVmixPhotos, sampleVmixPhotos } from "@/lib/broadcast/public-photos";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { buildPublicRoundFeed } from "@/lib/scoring/server";
import {
  EMPTY_VMIX_ENTRANT_ROW,
  VMIX_ENTRANTS_COLUMNS,
  readVmixRoundParam,
  toVmixEntrantRows,
  vmixResponse,
  wantsCsv,
  wantsSample,
} from "@/lib/scoring/vmix";
import { vmixSampleSource } from "@/lib/scoring/vmix-sample-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const csv = wantsCsv(url);
  const roundParam = readVmixRoundParam(url);

  if (roundParam === "invalid") {
    return vmixResponse(VMIX_ENTRANTS_COLUMNS, [EMPTY_VMIX_ENTRANT_ROW], csv, PUBLIC_LIVE_CACHE);
  }

  if (wantsSample(url)) {
    const sample = await vmixSampleSource(url);
    const roundId = roundParam ?? sample.liveRoundId;
    const round = sample.rounds().find((candidate) => candidate.id === roundId) ?? null;

    return vmixResponse(
      VMIX_ENTRANTS_COLUMNS,
      toVmixEntrantRows(
        round,
        sample.runsForRound(roundId),
        sample.leaderboardForRound(roundId),
        true,
        sampleVmixPhotos(url)
      ),
      csv,
      PUBLIC_LIVE_CACHE
    );
  }

  try {
    const photosPending = loadVmixPhotos(url);
    const feed = await buildPublicRoundFeed(roundParam);
    const photos = await photosPending;

    return vmixResponse(
      VMIX_ENTRANTS_COLUMNS,
      toVmixEntrantRows(feed.round, feed.runs, feed.leaderboard, false, photos),
      csv,
      PUBLIC_LIVE_CACHE
    );
  } catch (error) {
    // vMix keeps showing its last good data on an HTTP error, which is better
    // on air than blanking every title.
    console.error("[scoring] vMix entrants failed", error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
