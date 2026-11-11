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
  horse_name: string | null;
  checked_in: boolean;
  /* For the scoring page's rider searches, which match as the check-in desk
     does (check-in-search.ts): father and town also show on each match.
     Staff only, as that desk is. */
  father_name: string | null;
  location: string | null;
  email: string;
  phone: string;
  confirmation_code: string;
  details: string[];
};

/* A team the administrator can add to a Section round. A team is fully
   checked in when checked_in_count === member_count === 4. */
export type TeamCandidate = {
  id: string;
  team_name: string;
  checked_in_count: number;
  member_count: number;
  /* The riders' horses, for the pool builder's list and search. */
  horse_names: string[];
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

/* The "Graphics rehearsal feed" switch (scoring_rehearsal). */
export type RehearsalSwitch = {
  solo_sample_enabled: boolean;
  updated_at: string;
  updated_by_name: string | null;
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
  /* Null until the rehearsal feed migration has been applied. */
  rehearsal: RehearsalSwitch | null;
  candidates: {
    solo: SoloCandidate[];
    teams: TeamCandidate[];
  };
};
