// GET /api/broadcast/entrants?key=… — the broadcast team's vMix Data Source:
// the public entrants rows (/api/live/vmix/entrants, `?round=` as there) with
// photos: photo_url, photo_file, photo_path for a Single rider (empty for a
// Section side), member_1_photo_url … member_4_photo_url for a Section side's
// riders in the order of `members` (empty for a Single rider), then sample.
//
// Keyed (src/lib/broadcast/key.ts). Same rules as the public feed: every
// column always present, `?format=csv`, `?sample=` modes (an invented rider's
// photo is one placeholder picture), one row of empty values when there is
// nothing to show. `?photo_dir=<folder>` fills photo_path. A photo problem
// never fails the feed: the photo columns are just empty.
import { NextResponse } from "next/server";
import { verifyBroadcastKey } from "@/lib/broadcast/key";
import { BROADCAST_ENTRANTS_COLUMNS } from "@/lib/broadcast/columns";
import { getPhotoIndex } from "@/lib/broadcast/photo-index";
import { createPhotoContext, toBroadcastEntrantRows } from "@/lib/broadcast/rows";
import { PRIVATE_NO_STORE, PUBLIC_LIVE_CACHE } from "@/lib/scoring/http";
import { buildPublicRoundFeed } from "@/lib/scoring/server";
import {
  EMPTY_VMIX_ENTRANT_ROW,
  readVmixRoundParam,
  toVmixEntrantRows,
  vmixResponse,
  wantsCsv,
  wantsSample,
} from "@/lib/scoring/vmix";
import { vmixSampleSource } from "@/lib/scoring/vmix-sample-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = verifyBroadcastKey(request);
  if (!access.ok) {
    return access.response;
  }

  const url = new URL(request.url);
  const csv = wantsCsv(url);
  const roundParam = readVmixRoundParam(url);

  try {
    if (roundParam === "invalid") {
      const context = createPhotoContext(url, access.secret, new Map());

      return vmixResponse(
        BROADCAST_ENTRANTS_COLUMNS,
        toBroadcastEntrantRows([EMPTY_VMIX_ENTRANT_ROW], null, [], context),
        csv,
        PUBLIC_LIVE_CACHE
      );
    }

    if (wantsSample(url)) {
      const sample = await vmixSampleSource(url);
      const roundId = roundParam ?? sample.liveRoundId;
      const round = sample.rounds().find((candidate) => candidate.id === roundId) ?? null;
      const runs = sample.runsForRound(roundId);
      const context = createPhotoContext(url, access.secret, new Map());

      return vmixResponse(
        BROADCAST_ENTRANTS_COLUMNS,
        toBroadcastEntrantRows(
          toVmixEntrantRows(round, runs, sample.leaderboardForRound(roundId), true),
          round,
          runs,
          context,
          true
        ),
        csv,
        PUBLIC_LIVE_CACHE
      );
    }

    const [feed, index] = await Promise.all([buildPublicRoundFeed(roundParam), getPhotoIndex()]);
    const context = createPhotoContext(url, access.secret, index.photos);

    return vmixResponse(
      BROADCAST_ENTRANTS_COLUMNS,
      toBroadcastEntrantRows(
        toVmixEntrantRows(feed.round, feed.runs, feed.leaderboard),
        feed.round,
        feed.runs,
        context
      ),
      csv,
      PUBLIC_LIVE_CACHE
    );
  } catch (error) {
    // vMix keeps showing its last good data on an HTTP error, which is better
    // on air than blanking every title.
    console.error("[broadcast] entrants failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Live scoring is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
