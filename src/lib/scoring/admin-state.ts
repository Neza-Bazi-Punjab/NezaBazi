// Builds the /admin/scoring payload: every round, every run, every standing,
// the live state, the overrides with their notes, and the riders and teams an
// administrator can draw or add. Administrator only — the routes and the page
// that call this verify the admin role first. Reads go through the service
// role because the candidate lists come from the registration tables.
import "server-only";

import type { ServiceRoleClient } from "@/lib/admin/server";
import type {
  AdminScoringState,
  AdvanceOverrideRow,
  SoloCandidate,
  TeamCandidate,
} from "@/lib/scoring/admin-types";
import {
  LIVE_COLUMNS,
  ROUND_COLUMNS,
  RUN_COLUMNS,
  ScoringReadError,
  fetchAllRows,
  isScoringNotConfiguredError,
  loadAllLeaderboards,
} from "@/lib/scoring/server";
import type { LiveState, ScoringRound, ScoringRun } from "@/lib/scoring/types";

type SoloCandidateRow = { id: string; full_name: string; checked_in_at: string | null };
type TeamRow = { id: string; team_name: string };
type MemberRow = { team_id: string; checked_in_at: string | null };

const loadCandidates = async (client: ServiceRoleClient) => {
  const [soloResult, teamsResult, membersResult] = await Promise.all([
    fetchAllRows<SoloCandidateRow>((from, to) =>
      client
        .from("solo_registrations")
        .select("id, full_name, checked_in_at")
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TeamRow>((from, to) =>
      client
        .from("teams")
        .select("id, team_name")
        .order("team_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<MemberRow>((from, to) =>
      client
        .from("team_members")
        .select("team_id, checked_in_at")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const error = soloResult.error ?? teamsResult.error ?? membersResult.error;

  if (error) {
    throw new ScoringReadError("the registrations", error);
  }

  const counts = new Map<string, { members: number; checkedIn: number }>();

  for (const member of membersResult.rows) {
    const entry = counts.get(member.team_id) ?? { members: 0, checkedIn: 0 };
    entry.members += 1;
    entry.checkedIn += member.checked_in_at ? 1 : 0;
    counts.set(member.team_id, entry);
  }

  const solo: SoloCandidate[] = soloResult.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    checked_in: row.checked_in_at !== null,
  }));

  const teams: TeamCandidate[] = teamsResult.rows.map((row) => ({
    id: row.id,
    team_name: row.team_name,
    checked_in_count: counts.get(row.id)?.checkedIn ?? 0,
    member_count: counts.get(row.id)?.members ?? 0,
  }));

  return { solo, teams };
};

export const buildAdminScoringState = async (
  client: ServiceRoleClient
): Promise<AdminScoringState> => {
  const candidates = await loadCandidates(client);

  const [roundsResult, liveResult, runsResult, overridesResult, boards] = await Promise.all([
    client.from("scoring_rounds").select(ROUND_COLUMNS).order("sort_order", { ascending: true }),
    client.from("scoring_live_state").select(LIVE_COLUMNS).eq("id", true).maybeSingle(),
    fetchAllRows<ScoringRun>((from, to) =>
      client
        .from("scoring_runs")
        .select(RUN_COLUMNS)
        .order("round_id", { ascending: true })
        .order("run_order", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<AdvanceOverrideRow>((from, to) =>
      client
        .from("scoring_advance_overrides")
        .select("round_id, entrant_key, advanced, note, updated_at")
        .order("round_id", { ascending: true })
        .order("entrant_key", { ascending: true })
        .range(from, to)
    ),
    loadAllLeaderboards(client),
  ]);

  const error =
    roundsResult.error ??
    liveResult.error ??
    runsResult.error ??
    overridesResult.error ??
    boards.error;

  if (error) {
    if (isScoringNotConfiguredError(error)) {
      return {
        configured: false,
        generated_at: new Date().toISOString(),
        rounds: [],
        runs_by_round: {},
        leaderboards_by_round: {},
        live: null,
        overrides: [],
        candidates,
      };
    }

    throw new ScoringReadError("the scoring rounds", error);
  }

  const rounds = (roundsResult.data ?? []) as ScoringRound[];
  const runsByRound: Record<string, ScoringRun[]> = {};

  for (const round of rounds) {
    runsByRound[round.id] = [];
  }

  for (const run of runsResult.rows) {
    (runsByRound[run.round_id] ??= []).push(run);
  }

  return {
    configured: true,
    generated_at: new Date().toISOString(),
    rounds,
    runs_by_round: runsByRound,
    leaderboards_by_round: boards.leaderboards,
    live: (liveResult.data ?? null) as LiveState | null,
    overrides: overridesResult.rows,
    candidates,
  };
};

/* One round's runs in start order, for the responses of writes that reshape a
   start list. A read failure after a committed write is logged and answered
   with an empty list; the `admin` payload (or a refetch) carries the truth. */
export const readRoundRuns = async (client: ServiceRoleClient, roundId: string) => {
  const { rows, error } = await fetchAllRows<ScoringRun>((from, to) =>
    client
      .from("scoring_runs")
      .select(RUN_COLUMNS)
      .eq("round_id", roundId)
      .order("run_order", { ascending: true })
      .range(from, to)
  );

  if (error) {
    console.error("[scoring] reading a round's runs after a write failed", error);
    return [];
  }

  return rows;
};

/* After a successful write: the change has committed, so a failure to rebuild
   the payload is logged and reported as null (the panel then refetches). */
export const buildAdminScoringStateAfterWrite = async (client: ServiceRoleClient) => {
  try {
    return await buildAdminScoringState(client);
  } catch (error) {
    console.error("[scoring] rebuilding the admin scoring state after a write failed", error);
    return null;
  }
};
