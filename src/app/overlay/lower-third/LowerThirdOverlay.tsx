"use client";

import { attemptTextIfMany } from "@/components/scoring/format";
import { shortLocation } from "@/lib/scoring/types";
import { MessageBar, NowNextLine, OverlayFrame, useOverlayState } from "../overlay-parts";

/* Bottom-left lower third for the rider on course: name, team / horse,
   district and state (never the village), attempt. Slides in whenever a new
   rider comes on course. */
export default function LowerThirdOverlay() {
  const state = useOverlayState();
  const live = state?.live ?? null;

  // "leaderboard" leaves the frame to the full leaderboard overlay.
  if (
    !state ||
    !state.configured ||
    !live ||
    live.display_mode === "blank" ||
    live.display_mode === "leaderboard"
  ) {
    return <OverlayFrame name="lower-third" />;
  }

  if (live.display_mode === "message") {
    return (
      <OverlayFrame name="lower-third">
        <MessageBar message={live.message} />
      </OverlayFrame>
    );
  }

  const run = live.display_mode === "pool_call" ? null : state.current_run;
  const sub = run
    ? [
        run.team_name ?? run.horse_name,
        shortLocation(run.rider_location),
        attemptTextIfMany(run, state.current_round),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <OverlayFrame name="lower-third">
      <div className="ov-lower">
        <NowNextLine state={state} />
        {run && (
          <div key={run.id} className="ov-slide-in">
            <div className="ov-panel ov-lower__name ov-ellipsis">{run.rider_name}</div>
            {sub && <div className="ov-lower__sub">{sub}</div>}
          </div>
        )}
      </div>
    </OverlayFrame>
  );
}
