// GET /api/live/vmix/team - vMix Data Source: the side on the track.
//
// One flat row (a JSON array with one object, or `?format=csv`): the team's
// name, pool, points, target and whether it is through, then name, horse,
// result, points and status for each of its four riders (rider1_ ... rider4_).
// `?which=last` gives the side whose result came in most recently instead of
// the one on the track now. Every field is always present, and outside a
// Section round the row is simply empty, so vMix keeps a stable schema.
//
// Public like /api/live/state and built from the same assembled state: the
// standings a Section round already publishes, nothing more. ?sample=1
// answers with rehearsal data instead and never reads the database.
import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { buildPublicLiveSnapshot } from "@/lib/scoring/server";
import { vmixResponse, wantsCsv, wantsSample } from "@/lib/scoring/vmix";
import { vmixSampleSource } from "@/lib/scoring/vmix-sample-live";
import { VMIX_TEAM_COLUMNS, readVmixTeamWhich, toVmixTeamRow } from "@/lib/scoring/vmix-team";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const csv = wantsCsv(url);
  const which = readVmixTeamWhich(url);

  if (wantsSample(url)) {
    const sample = await vmixSampleSource(url);

    return vmixResponse(
      VMIX_TEAM_COLUMNS,
      [toVmixTeamRow(sample.state(), which, true)],
      csv,
      PUBLIC_LIVE_CACHE
    );
  }

  try {
    const { state } = await buildPublicLiveSnapshot();

    return vmixResponse(VMIX_TEAM_COLUMNS, [toVmixTeamRow(state, which)], csv, PUBLIC_LIVE_CACHE);
  } catch (error) {
    // vMix keeps showing its last good data on an HTTP error, which is better
    // on air than blanking every title.
    console.error("[scoring] vMix team row failed", error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
