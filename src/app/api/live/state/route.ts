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
// Staff practising on the live site use their own sessions through the judge
// and commentary APIs; this public route never reads a session or cookie. The
// sample branch never touches the database.
import { NextResponse } from "next/server";
import { PUBLIC_LIVE_CACHE, unexpectedErrorResponse } from "@/lib/scoring/http";
import { isSampleRequest } from "@/lib/scoring/sample-mode";
import { LOCAL_TRAINING_SESSION, samplePublicLiveState } from "@/lib/scoring/sample-session";
import { buildPublicLiveState } from "@/lib/scoring/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (isSampleRequest(request)) {
      return NextResponse.json(samplePublicLiveState(LOCAL_TRAINING_SESSION), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const state = await buildPublicLiveState();

    return NextResponse.json(state, {
      headers: { "Cache-Control": PUBLIC_LIVE_CACHE },
    });
  } catch (error) {
    return unexpectedErrorResponse(error, "public live state");
  }
}
