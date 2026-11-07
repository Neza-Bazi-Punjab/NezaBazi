// Writes from the judges' panel and the wording of their confirm prompts.
// Kept apart from the panel's JSX so the rules are easy to read in one place.
import {
  RESULT_LABELS,
  RESULT_POINTS,
  type JudgeState,
  type RunResult,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import { TRAINING_RESET_QUESTION, type TrainingScope } from "@/lib/scoring/training";

export type JudgeAction =
  | {
      kind: "score";
      run: ScoringRun;
      result: RunResult;
      /* True when the run already has a result ("Change result"). */
      override: boolean;
      /* Armed from the big result buttons for the rider on course. Such a
         choice is dropped if a different rider comes on course meanwhile. */
      fromMain: boolean;
    }
  | { kind: "clear"; run: ScoringRun; returnToRun: boolean }
  | { kind: "void"; run: ScoringRun }
  | { kind: "restore"; run: ScoringRun }
  /* `attempt`: the round (Round 1 / 2 / 3) the pool is called for, when
     riders have more than one attempt; only the wording uses it. */
  | { kind: "call"; roundId: string; pool: string; attempt?: number | null }
  | { kind: "current"; run: ScoringRun }
  /* The big Start button: the next rider in order comes on course. Sent
     straight away with no question (see needsConfirmation); any other pick
     uses "current" or "ride_now", which ask first. */
  | { kind: "start"; run: ScoringRun }
  | { kind: "round"; round: ScoringRound }
  /* The Skipped box: a skipped (or passed-over) ride goes on course now. */
  | { kind: "ride_now"; run: ScoringRun }
  /* Take out for the rest of the round, or Bring back. */
  | { kind: "take_out"; roundId: string; entrantKey: string; name: string; out: boolean }
  /* Training mode only: the caller's practice session back to the start. */
  | { kind: "reset"; scope: TrainingScope };

/* "Round 2 · Pool A", or "Pool A" when riders have one attempt. */
const callName = (action: { pool: string; attempt?: number | null }) =>
  action.attempt ? `Round ${action.attempt} · Pool ${action.pool}` : `Pool ${action.pool}`;

const resultWithPoints = (result: RunResult) =>
  `${RESULT_LABELS[result]} ${RESULT_POINTS[result]}`;

export const describeAction = (
  action: JudgeAction
): { question: string; confirm: string; result?: RunResult } => {
  switch (action.kind) {
    case "score":
      if (action.override && action.run.result) {
        return {
          question: `Change ${action.run.rider_name} from ${resultWithPoints(
            action.run.result
          )} to ${resultWithPoints(action.result)}?`,
          confirm: `Change to ${RESULT_LABELS[action.result]}`,
          result: action.result,
        };
      }

      return {
        question: `Record ${RESULT_LABELS[action.result]} (${RESULT_POINTS[action.result]}) for ${action.run.rider_name}?`,
        confirm: `Confirm ${RESULT_LABELS[action.result]}`,
        result: action.result,
      };
    case "clear":
      return {
        question: `Undo ${
          action.run.result ? resultWithPoints(action.run.result) : "the result"
        } for ${action.run.rider_name}? The run goes back to waiting${
          action.returnToRun ? " and comes back on course" : ""
        }.`,
        confirm: "Undo result",
      };
    case "void":
      return {
        question: `Skip ${action.run.rider_name} for now? They wait in the Skipped box until you press Ride now.`,
        confirm: "Skip",
      };
    case "restore":
      return {
        question: `Put ${action.run.rider_name}'s run (run ${action.run.run_order}) back in the start list?`,
        confirm: "Restore run",
      };
    case "call":
      return {
        question: `Call ${callName(action)} to the start? Every screen shows the Pool ${action.pool} roster until the first result; then tap Start for its first rider.`,
        confirm: `Call Pool ${action.pool}`,
      };
    case "current":
      return {
        question: `Put ${action.run.rider_name} (run ${action.run.run_order}) on course now?`,
        confirm: "Put on course",
      };
    case "start":
      return {
        question: `Start ${action.run.rider_name}?`,
        confirm: "Start",
      };
    case "round":
      return {
        question: `Make "${action.round.name}" the live round? Nobody is on course until you call a pool or pick a rider.`,
        confirm: "Switch round",
      };
    case "ride_now":
      return {
        question: `Put ${action.run.rider_name} on course now?`,
        confirm: "Ride now",
      };
    case "take_out":
      return action.out
        ? {
            question: `Take ${action.name} out? They will not ride again in this round and show as Out.`,
            confirm: "Take out",
          }
        : {
            question: `Bring ${action.name} back? Their rides in this round go back on the list.`,
            confirm: "Bring back",
          };
    case "reset":
      return {
        question: TRAINING_RESET_QUESTION[action.scope],
        confirm: "Reset training data",
      };
  }
};

export const successMessage = (action: JudgeAction) => {
  switch (action.kind) {
    case "score":
      return `${resultWithPoints(action.result)} recorded for ${action.run.rider_name}.`;
    case "clear":
      return `Result cleared for ${action.run.rider_name}.`;
    case "void":
      return `${action.run.rider_name} skipped — in the Skipped box.`;
    case "restore":
      return `Run restored for ${action.run.rider_name}.`;
    case "call":
      return `${callName(action)} called.`;
    case "current":
    case "start":
      return `${action.run.rider_name} is on course.`;
    case "round":
      return `"${action.round.name}" is now the live round.`;
    case "ride_now":
      return `${action.run.rider_name} is on course.`;
    case "take_out":
      return action.out ? `${action.name} taken out.` : `${action.name} brought back.`;
    case "reset":
      return "Training data reset.";
  }
};

/* Only Start for the next rider in order skips the confirm bar: after a
   result nobody is on course until the judge taps it, so it is the panel's
   most frequent tap and its button names the rider. */
export const needsConfirmation = (action: JudgeAction) => action.kind !== "start";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* POSTs JSON and returns the parsed body. Throws an Error whose message is
   the server's own `error` text (shown verbatim to the judge), or a plain
   connection message when the request never reached the server. */
export const postJson = async (url: string, body: unknown): Promise<unknown> => {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach the server. Check the connection and try again.");
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : `The server answered ${response.status}. Nothing was changed.`;
    throw new Error(message);
  }

  return payload;
};

/* Every judge write answers with the fresh JudgeState as `state`. */
export const stateFromResponse = (payload: unknown): JudgeState | null =>
  isRecord(payload) && isRecord(payload.state) && Array.isArray(payload.state.runs)
    ? (payload.state as JudgeState)
    : null;

/* Training mode (/judge/demo): the same endpoints with ?sample=1, which the
   server answers from a practice session in memory — the shared one on a
   SCORING_SAMPLE_MODE=1 laptop, or the signed-in staff member's own. */
export const withTrainingFlag = (url: string) =>
  `${url}${url.includes("?") ? "&" : "?"}sample=1`;

/* Sends one action — a single request (Ride now on a skipped ride is the one
   exception, see below), so an action either happens
   completely or not at all. Returns the newest JudgeState the server reported
   (null if a response lacked one — the caller then refetches). With
   `training`, every request goes to the training session instead. */
export const sendAction = async (
  action: JudgeAction,
  training = false
): Promise<JudgeState | null> => {
  const post = (url: string, body: unknown) =>
    postJson(training ? withTrainingFlag(url) : url, body);

  switch (action.kind) {
    case "score":
      return stateFromResponse(
        await post("/api/judge/score", {
          run_id: action.run.id,
          result: action.result,
          ...(action.override ? { override: true } : {}),
        })
      );
    case "clear":
      /* "Undo last result" (returnToRun) brings that rider back on course so
         the judge can record the right result straight away. The database
         does both in one transaction (scoring_clear_result's p_make_current),
         so the pointer can never be left on the next rider while this
         rider's result is gone. */
      return stateFromResponse(
        await post("/api/judge/clear", {
          run_id: action.run.id,
          ...(action.returnToRun ? { make_current: true } : {}),
        })
      );
    case "void":
      return stateFromResponse(
        await post("/api/judge/status", { run_id: action.run.id, status: "void" })
      );
    case "restore":
      return stateFromResponse(
        await post("/api/judge/status", { run_id: action.run.id, status: "pending" })
      );
    case "call":
      return stateFromResponse(
        await post("/api/judge/call-pool", {
          round_id: action.roundId,
          pool_label: action.pool,
        })
      );
    case "current":
    case "start":
      // The judge's Start: the one way a rider comes on course.
      return stateFromResponse(
        await post("/api/judge/live", { current_run_id: action.run.id })
      );
    case "round":
      return stateFromResponse(
        await post("/api/judge/live", { current_round_id: action.round.id })
      );
    case "ride_now":
      // A skipped ride is restored first, then put on course: the one action
      // that takes two requests. If the second fails, the ride simply waits
      // in the Skipped box again.
      if (action.run.status === "void") {
        await post("/api/judge/status", { run_id: action.run.id, status: "pending" });
      }

      return stateFromResponse(
        await post("/api/judge/live", { current_run_id: action.run.id })
      );
    case "take_out":
      return stateFromResponse(
        await post("/api/judge/take-out", {
          round_id: action.roundId,
          entrant_key: action.entrantKey,
          out: action.out,
        })
      );
    case "reset":
      // Only ever the training session: the route answers 404 to anything else.
      return stateFromResponse(
        await postJson(withTrainingFlag("/api/judge/reset-sample"), {})
      );
  }
};
