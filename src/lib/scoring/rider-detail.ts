// Rider background for the commentary panel: parents' names, age, home,
// experience, horse, team and today's runs, plus a short-lived headshot URL.
//
// Staff only. This is the one scoring module that reads the registration
// tables, and it is reached only from GET /api/commentary/state after the
// caller's judge / commentator / admin role has been verified. The public
// scoreboard and overlays never import it.
import "server-only";

import type { ServiceRoleClient } from "@/lib/admin/server";
import { getSoloHeadshotUrl, getTeamRiderHeadshotUrl } from "@/lib/admin/headshot-urls";
import type {
  RiderDetail,
  RunResult,
  RunStatus,
  ScoringRound,
  ScoringRun,
} from "@/lib/scoring/types";

/* father_name / mother_name come from 20261025100000_rider_parent_names.sql.
   They are selected explicitly; if that migration has not been applied yet
   the read is retried without them (Postgres 42703, undefined column) and the
   panel simply shows no parents' names. */
const PARENT_COLUMNS = "father_name, mother_name";
const SOLO_COLUMNS =
  "id, profile_id, email, full_name, age, location, years_experience, horse_name, horse_age, horse_breed";
const MEMBER_COLUMNS =
  "id, team_id, email, is_leader, full_name, age, location, years_experience, horse_name, horse_age, horse_breed";
const UNDEFINED_COLUMN = "42703";

type RiderRow = {
  id: string;
  full_name: string;
  father_name?: string | null;
  mother_name?: string | null;
  age: number | null;
  location: string | null;
  years_experience: number | null;
  horse_name: string | null;
  horse_age: number | null;
  horse_breed: string | null;
};

type SoloRow = RiderRow & { profile_id: string | null; email: string | null };

type MemberRow = RiderRow & {
  team_id: string;
  email: string | null;
  is_leader: boolean | null;
};

type TeamRow = { id: string; team_name: string; leader_profile_id: string | null };

type TodayRun = {
  round_id: string;
  run_order: number;
  attempt_number: number;
  result: RunResult | null;
  points: number | null;
  status: RunStatus;
  solo_registration_id: string | null;
  team_member_id: string | null;
};

type QueryError = { code?: string | null; message?: string | null } | null;

/* Runs a select with the parents' columns, falling back to the select
   without them when the columns do not exist yet. The column list is built at
   runtime, which supabase-js cannot type, so rows are typed here. */
const selectWithParents = async <T>(
  run: (columns: string) => PromiseLike<{ data: unknown; error: QueryError }>,
  baseColumns: string
): Promise<T[]> => {
  const rowsOf = (data: unknown) => (Array.isArray(data) ? (data as T[]) : []);
  const first = await run(`${baseColumns}, ${PARENT_COLUMNS}`);

  if (!first.error) {
    return rowsOf(first.data);
  }

  if (first.error.code === UNDEFINED_COLUMN) {
    const fallback = await run(baseColumns);

    if (!fallback.error) {
      return rowsOf(fallback.data);
    }
  }

  console.error("[scoring] rider detail read failed", {
    code: first.error.code ?? null,
    message: first.error.message ?? null,
  });
  return [];
};

/* Assembly ------------------------------------------------------------------------ */

const fromSnapshot = (run: ScoringRun): RiderDetail => ({
  full_name: run.rider_name,
  father_name: null,
  mother_name: null,
  age: null,
  location: run.rider_location,
  years_experience: null,
  horse_name: run.horse_name,
  horse_age: null,
  horse_breed: null,
  team_name: run.team_name,
  is_leader: null,
  headshot_url: null,
  today: [],
  total_points_today: 0,
});

const unique = (values: (string | null)[]) => [
  ...new Set(values.filter((value): value is string => typeof value === "string")),
];

/* Rider detail for each run, keyed by run id. Every run gets an entry: when
   the registration row has gone, the run's own snapshot fills in. */
export const loadRiderDetails = async (
  client: ServiceRoleClient,
  runs: ScoringRun[],
  rounds: ScoringRound[]
): Promise<Map<string, RiderDetail>> => {
  const details = new Map<string, RiderDetail>();

  if (runs.length === 0) {
    return details;
  }

  const soloIds = unique(runs.map((run) => run.solo_registration_id));
  const memberIds = unique(runs.map((run) => run.team_member_id));

  const [soloRows, memberRows] = await Promise.all([
    soloIds.length > 0
      ? selectWithParents<SoloRow>(
          (columns) => client.from("solo_registrations").select(columns).in("id", soloIds),
          SOLO_COLUMNS
        )
      : Promise.resolve([]),
    memberIds.length > 0
      ? selectWithParents<MemberRow>(
          (columns) => client.from("team_members").select(columns).in("id", memberIds),
          MEMBER_COLUMNS
        )
      : Promise.resolve([]),
  ]);

  const teamIds = unique(memberRows.map((member) => member.team_id));

  const [teamsResult, soloTodayResult, memberTodayResult] = await Promise.all([
    teamIds.length > 0
      ? client.from("teams").select("id, team_name, leader_profile_id").in("id", teamIds)
      : Promise.resolve({ data: [], error: null }),
    soloIds.length > 0
      ? client
          .from("scoring_runs")
          .select(
            "round_id, run_order, attempt_number, result, points, status, solo_registration_id, team_member_id"
          )
          .in("solo_registration_id", soloIds)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length > 0
      ? client
          .from("scoring_runs")
          .select(
            "round_id, run_order, attempt_number, result, points, status, solo_registration_id, team_member_id"
          )
          .in("team_member_id", memberIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const teams = new Map(
    ((teamsResult.data ?? []) as TeamRow[]).map((team) => [team.id, team])
  );
  const solos = new Map(soloRows.map((row) => [row.id, row]));
  const members = new Map(memberRows.map((row) => [row.id, row]));
  const todayRuns = [
    ...((soloTodayResult.data ?? []) as TodayRun[]),
    ...((memberTodayResult.data ?? []) as TodayRun[]),
  ];
  const roundsById = new Map(rounds.map((round) => [round.id, round]));

  const todayFor = (match: (run: TodayRun) => boolean) => {
    const today = todayRuns
      .filter(match)
      .sort((first, second) => {
        const firstRound = roundsById.get(first.round_id)?.sort_order ?? 0;
        const secondRound = roundsById.get(second.round_id)?.sort_order ?? 0;
        return (
          firstRound - secondRound ||
          first.attempt_number - second.attempt_number ||
          first.run_order - second.run_order
        );
      });

    return {
      today: today.map((run) => ({
        round_name: roundsById.get(run.round_id)?.name ?? "Round",
        attempt_number: run.attempt_number,
        result: run.result,
        points: run.points,
        status: run.status,
      })),
      total_points_today: today.reduce(
        (total, run) => total + (run.status === "scored" ? run.points ?? 0 : 0),
        0
      ),
    };
  };

  await Promise.all(
    runs.map(async (run) => {
      const solo = run.solo_registration_id ? solos.get(run.solo_registration_id) : undefined;
      const member = run.team_member_id ? members.get(run.team_member_id) : undefined;
      const rider: RiderRow | undefined = solo ?? member;

      if (!rider) {
        details.set(run.id, fromSnapshot(run));
        return;
      }

      const team = member ? teams.get(member.team_id) : undefined;
      /* A solo rider: the registration's own photo, else the account's for
         the account holder's own entry. A team rider has no profile id of
         their own: the leader's account (for the leader) or the accounts found
         by email, and only one whose email and name are the rider's. */
      const headshotUrl = solo
        ? await getSoloHeadshotUrl(client, solo)
        : member
          ? await getTeamRiderHeadshotUrl(
              client,
              member,
              member.is_leader ? team?.leader_profile_id ?? null : null
            )
          : null;
      const history = solo
        ? todayFor((today) => today.solo_registration_id === solo.id)
        : todayFor((today) => today.team_member_id === member?.id);

      details.set(run.id, {
        full_name: rider.full_name,
        father_name: rider.father_name ?? null,
        mother_name: rider.mother_name ?? null,
        age: rider.age,
        location: rider.location,
        years_experience: rider.years_experience,
        horse_name: rider.horse_name,
        horse_age: rider.horse_age,
        horse_breed: rider.horse_breed,
        team_name: team?.team_name ?? run.team_name,
        is_leader: member ? member.is_leader === true : null,
        headshot_url: headshotUrl,
        ...history,
      });
    })
  );

  return details;
};
