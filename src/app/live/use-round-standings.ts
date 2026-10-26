"use client";

import { useEffect, useState } from "react";
import { parseLeaderboardRows } from "@/components/scoring/format";
import type { LeaderboardRow } from "@/lib/scoring/types";
import { createClient } from "@/lib/supabase/client";

type Loaded = { roundId: string; rows: LeaderboardRow[] | null; error: string | null };

/* Standings of an earlier (completed) round for the public scoreboard.
   GET /api/live/state carries only the current round's standings, so these
   are read straight from the public `scoring_leaderboard` view with the
   anonymous browser client. The view is built from run snapshots only (name,
   horse, team, home location) and is granted to anon for exactly this; no
   registration table is touched. Rows are passed through
   parseLeaderboardRows, which keeps only the known LeaderboardRow fields. */
export function useRoundStandings(roundId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!roundId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("scoring_leaderboard")
          .select("*")
          .eq("round_id", roundId)
          .order("rank", { ascending: true })
          .limit(1000);

        if (cancelled) {
          return;
        }

        setLoaded(
          error
            ? { roundId, rows: null, error: "Standings for this round are not available right now." }
            : { roundId, rows: parseLeaderboardRows(data), error: null }
        );
      } catch {
        if (!cancelled) {
          setLoaded({
            roundId,
            rows: null,
            error: "Standings for this round are not available right now.",
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [roundId]);

  const current = loaded && loaded.roundId === roundId ? loaded : null;

  return {
    rows: current?.rows ?? null,
    error: current?.error ?? null,
    loading: roundId !== null && current === null,
  };
}
