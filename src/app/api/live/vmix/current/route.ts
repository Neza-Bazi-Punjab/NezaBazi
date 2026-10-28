// GET /api/live/vmix/current — vMix Data Source: the rider on course.
//
// One flat row (a JSON array with one object, or `?format=csv` for a CSV with
// a header row) for vMix title bindings: round, called and next pool, the
// current rider, the attempt, the display mode and message, and the last
// result. Every field is always present (empty string or 0), and when scoring
// is not set up the row is simply empty, so vMix keeps a stable schema.
//
// Public like /api/live/state, built from the same assembled state — the
// scoring_* tables and view only, never a registration table. ?sample=1
// answers with rehearsal data instead (?sample=solo: moving rehearsal data while
// switched on, vmix-sample-live.ts) and never reads the database.
import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { buildPublicLiveSnapshot } from "@/lib/scoring/server";
import {
  VMIX_CURRENT_COLUMNS,
  toVmixCurrentRow,
  vmixResponse,
  wantsCsv,
  wantsSample,
} from "@/lib/scoring/vmix";
import { vmixSampleSource } from "@/lib/scoring/vmix-sample-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const csv = wantsCsv(url);

  if (wantsSample(url)) {
    const sample = await vmixSampleSource(url);

    return vmixResponse(
      VMIX_CURRENT_COLUMNS,
      [toVmixCurrentRow(sample.state(), sample.runsForRound(sample.liveRoundId).length, true)],
      csv,
      PUBLIC_LIVE_CACHE
    );
  }

  try {
    const { state, runCount } = await buildPublicLiveSnapshot();

    return vmixResponse(
      VMIX_CURRENT_COLUMNS,
      [toVmixCurrentRow(state, runCount)],
      csv,
      PUBLIC_LIVE_CACHE
    );
  } catch (error) {
    // vMix keeps showing its last good data on an HTTP error, which is better
    // on air than blanking every title.
    console.error("[scoring] vMix current row failed", error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
