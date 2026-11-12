// GET /api/live/state — the public live scoring state.
//
// Read by /live, every stream overlay and any data-source software. Public
// and anonymous: assembled through the anonymous role from the scoring_*
// tables and the scoring_leaderboard view only, so it carries nothing beyond
// what is announced over the PA. Cached at the edge for a second so thousands
// of spectators cost the database one read a second.
//
// Training mode: with SCORING_SAMPLE_MODE=1 in .env.local, ?sample=1 returns
// the laptop's shared practice session instead (sample riders; it follows
// what the judges do on /judge/demo), so /live and the overlays can be
// previewed and practised with before the scoring tables exist. The flag is
// read from the server environment only — a visitor adding ?sample=1 on the
// live site gets the real state, so fake results can never reach the public.
//
// ?sample=demo returns the organisers' shared demo (the one /judge/demo drives
// on the live site; the laptop's own session on a SCORING_SAMPLE_MODE=1
// laptop), so /live?sample=demo and every overlay with ?sample=demo follow the
// rehearsal on any device, no login. It reads only the practice row
// (scoring_training_sessions, invented riders, through sample-session.ts),
// never a registration or scoring table, and is cached like the real state.
// When an administrator has closed the demo for the event, it answers with the
// frozen sample (vmix-sample.ts, the ?sample=1 data) instead.
// This route never reads a session or cookie.
import { NextResponse } from "next/server";
import { PUBLIC_LIVE_CACHE, publicLiveCacheFor, unexpectedErrorResponse } from "@/lib/scoring/http";
import { isDemoRequest, isSampleRequest } from "@/lib/scoring/sample-mode";
import {
  LOCAL_TRAINING_SESSION,
  demoTrainingSession,
  samplePublicLiveState,
} from "@/lib/scoring/sample-session";
import { buildPublicLiveState } from "@/lib/scoring/server";
import { isDemoClosed } from "@/lib/scoring/training-switch";
import { samplePublicLiveState as frozenSampleState } from "@/lib/scoring/vmix-sample";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (isSampleRequest(request)) {
      return NextResponse.json(await samplePublicLiveState(LOCAL_TRAINING_SESSION), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (isDemoRequest(request)) {
      const key = demoTrainingSession();
      // Closed for the event: the frozen sample, never anything live.
      const closed = key !== LOCAL_TRAINING_SESSION && (await isDemoClosed());

      return NextResponse.json(closed ? frozenSampleState() : await samplePublicLiveState(key), {
        headers: { "Cache-Control": PUBLIC_LIVE_CACHE },
      });
    }

    const state = await buildPublicLiveState();

    return NextResponse.json(state, {
      headers: { "Cache-Control": publicLiveCacheFor(state) },
    });
  } catch (error) {
    return unexpectedErrorResponse(error, "public live state");
  }
}
