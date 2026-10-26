// GET /api/live/vmix/rounds — vMix Data Source: every round.
//
// One flat row per round in running order: id, name, event type, number,
// status, whether it is the live round, attempts, target, pool size, how many
// pools and entrants it has, and its progress (runs_total / runs_scored).
// The round_id values are what /api/live/vmix/entrants?round= takes.
//   ?format=csv  CSV with a header row instead of a JSON array
//   ?sample=1    rehearsal rows (sample = "Yes"); the database is not read
// Every field is always present; with nothing to show the response is one row
// of empty values, so vMix keeps a stable schema.
//
// Public: built from the scoring_* tables only, read as the anonymous role —
// never a registration table.
import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { buildPublicRoundsFeed } from "@/lib/scoring/server";
import {
  VMIX_ROUNDS_COLUMNS,
  toVmixRoundRows,
  vmixResponse,
  wantsCsv,
  wantsSample,
} from "@/lib/scoring/vmix";
import {
  SAMPLE_QUALIFICATION_ROUND_ID,
  sampleAllRuns,
  sampleRounds,
} from "@/lib/scoring/vmix-sample";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const csv = wantsCsv(url);

  if (wantsSample(url)) {
    return vmixResponse(
      VMIX_ROUNDS_COLUMNS,
      toVmixRoundRows(sampleRounds(), sampleAllRuns(), SAMPLE_QUALIFICATION_ROUND_ID, true),
      csv,
      PUBLIC_LIVE_CACHE
    );
  }

  try {
    const feed = await buildPublicRoundsFeed();

    return vmixResponse(
      VMIX_ROUNDS_COLUMNS,
      toVmixRoundRows(feed.rounds, feed.runs, feed.liveRoundId),
      csv,
      PUBLIC_LIVE_CACHE
    );
  } catch (error) {
    console.error("[scoring] vMix rounds failed", error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
