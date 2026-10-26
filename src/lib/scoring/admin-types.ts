// Payload of GET /api/admin/scoring/rounds — everything /admin/scoring needs.
// Shared by the server (which builds it) and the admin panel (which renders
// it), so it carries no "server-only" import.
import type {
  LeaderboardRow,
  LiveState,
  ScoringRound,
  ScoringRun,
} from "@/lib/scoring/types";

/* A solo registration the administrator can add to a Single round. */
export type SoloCandidate = {
  id: string;
  full_name: string;
  checked_in: boolean;
};

/* A team the administrator can add to a Section round. A team is fully
   checked in when checked_in_count === member_count === 4. */
export type TeamCandidate = {
  id: string;
  team_name: string;
  checked_in_count: number;
  member_count: number;
};

/* Staff-only view of an override, including the administrator's note (the
   public can see whether an override exists, not why). */
export type AdvanceOverrideRow = {
  round_id: string;
  entrant_key: string;
  advanced: boolean;
  note: string | null;
  updated_at: string;
};

export type AdminScoringState = {
  /* False until the live scoring migration has been applied. */
  configured: boolean;
  generated_at: string;
  rounds: ScoringRound[];
  /* Every run of every round, keyed by round id, in run order. */
  runs_by_round: Record<string, ScoringRun[]>;
  leaderboards_by_round: Record<string, LeaderboardRow[]>;
  live: LiveState | null;
  overrides: AdvanceOverrideRow[];
  candidates: {
    solo: SoloCandidate[];
    teams: TeamCandidate[];
  };
};
