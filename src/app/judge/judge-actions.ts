// Writes from the judges' panel and the wording of their confirm prompts.
// Kept apart from the panel's JSX so the rules are easy to read in one place.
import { DISPLAY_MODE_CHOICES } from "@/components/scoring/format";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  type DisplayMode,
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
  | { kind: "call"; roundId: string; pool: string }
  | { kind: "current"; run: ScoringRun }
  | { kind: "round"; round: ScoringRound }
  | { kind: "scoreboard" }
  /* The Screens sheet: what /live and the overlays show, and the message. */
  | { kind: "display"; mode: DisplayMode }
  | { kind: "message"; message: string | null }
  /* Training mode only: the caller's practice session back to the start. */
  | { kind: "reset"; scope: TrainingScope };

const modeLabel = (mode: DisplayMode) =>
  DISPLAY_MODE_CHOICES.find((choice) => choice.mode === mode)?.label ?? mode;

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
        question: `Skip ${action.run.rider_name}'s run (run ${action.run.run_order})? It will not be scored.`,
        confirm: "Skip run",
      };
    case "restore":
      return {
        question: `Put ${action.run.rider_name}'s run (run ${action.run.run_order}) back in the start list?`,
        confirm: "Restore run",
      };
    case "call":
      return {
        question: `Call Pool ${action.pool} to the start? Every screen shows the Pool ${action.pool} roster until the first result.`,
        confirm: `Call Pool ${action.pool}`,
      };
    case "current":
      return {
        question: `Put ${action.run.rider_name} (run ${action.run.run_order}) on course now?`,
        confirm: "Put on course",
      };
    case "round":
      return {
        question: `Make "${action.round.name}" the live round? Nobody is on course until you call a pool or pick a rider.`,
        confirm: "Switch round",
      };
    case "scoreboard":
      return {
        question: "Return every screen to the scoreboard now?",
        confirm: "Show scoreboard",
      };
    case "display":
      return {
        question: `Switch every screen to "${modeLabel(action.mode)}"?`,
        confirm: "Switch screens",
      };
    case "message":
      return action.message
        ? { question: `Show "${action.message}" on every screen?`, confirm: "Show message" }
        : { question: "Remove the message from every screen?", confirm: "Clear message" };
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
      return `Run skipped for ${action.run.rider_name}.`;
    case "restore":
      return `Run restored for ${action.run.rider_name}.`;
    case "call":
      return `Pool ${action.pool} called.`;
    case "current":
      return `${action.run.rider_name} is on course.`;
    case "round":
      return `"${action.round.name}" is now the live round.`;
    case "scoreboard":
      return "Screens are back on the scoreboard.";
    case "display":
      return `Screens now show: ${modeLabel(action.mode)}.`;
    case "message":
      return action.message ? "Message is on the screens." : "Message cleared.";
    case "reset":
      return "Training data reset.";
  }
};

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

/* Sends one action — always a single request, so an action either happens
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
      return stateFromResponse(
        await post("/api/judge/live", { current_run_id: action.run.id })
      );
    case "round":
      return stateFromResponse(
        await post("/api/judge/live", { current_round_id: action.round.id })
      );
    case "scoreboard":
      return stateFromResponse(
        await post("/api/judge/live", { display_mode: "scoreboard" })
      );
    case "display":
      return stateFromResponse(
        await post("/api/judge/live", { display_mode: action.mode })
      );
    case "message":
      return stateFromResponse(
        await post("/api/judge/live", { message: action.message })
      );
    case "reset":
      // Only ever the training session: the route answers 404 to anything else.
      return stateFromResponse(
        await postJson(withTrainingFlag("/api/judge/reset-sample"), {})
      );
  }
};
