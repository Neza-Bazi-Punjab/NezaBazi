"use client";

import { useEffect, useState } from "react";
import { poolName, resultText } from "@/components/scoring/format";
import { MessageBar, OverlayFrame, useOverlayState } from "../overlay-parts";

export const TICKER_CYCLE_MS = 6_000;
const MAX_RESULTS = 8;

/* Bottom ticker cycling the latest results ("Harpreet Singh — Carried 4 ·
   Pool B") and the message. The results come from the server's
   `recent_results` (the current round's last scored runs, newest first), so a
   ticker opened mid-round, reloaded, or running on a second machine shows the
   same list, and an undone result drops out as soon as the state refreshes. */
export default function TickerOverlay() {
  const state = useOverlayState();
  const [tick, setTick] = useState(0);

  const results = (state?.recent_results ?? [])
    .filter((run) => run.result !== null)
    .slice(0, MAX_RESULTS);
  const newest = results[0];
  const newestKey = newest ? `${newest.id}|${newest.scored_at}|${newest.result}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(newestKey);

  // A new result jumps the ticker back to the start so it is shown at once
  // (state adjusted during render when the input changes — no effect needed).
  if (newestKey !== seenKey) {
    setSeenKey(newestKey);
    setTick(0);
  }

  const live = state?.live ?? null;
  const items = [
    ...results.map((run) =>
      [
        `${run.rider_name} — ${run.result ? resultText(run.result) : ""}`,
        poolName(run.pool_label),
      ]
        .filter(Boolean)
        .join(" · ")
    ),
    ...(live?.message ? [live.message] : []),
  ];
  const itemCount = items.length;

  useEffect(() => {
    if (itemCount <= 1) {
      return;
    }

    const timer = setInterval(() => setTick((value) => value + 1), TICKER_CYCLE_MS);
    return () => clearInterval(timer);
  }, [itemCount]);

  if (!state || !state.configured || !live || live.display_mode === "blank") {
    return <OverlayFrame name="ticker" />;
  }

  if (live.display_mode === "message") {
    return (
      <OverlayFrame name="ticker">
        <MessageBar message={live.message} />
      </OverlayFrame>
    );
  }

  if (itemCount === 0) {
    return <OverlayFrame name="ticker" />;
  }

  const index = tick % itemCount;
  const isMessage = index >= results.length;

  return (
    <OverlayFrame name="ticker">
      <div className="ov-strip ov-fade-in">
        <div className="ov-strip__label">{isMessage ? "News" : "Latest"}</div>
        <p key={`${index}-${items[index]}`} className="ov-strip__text ov-fade-in">
          <span className="ov-ellipsis">{items[index]}</span>
        </p>
      </div>
    </OverlayFrame>
  );
}
