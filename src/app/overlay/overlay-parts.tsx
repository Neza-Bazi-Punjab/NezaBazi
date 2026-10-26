"use client";

/* Shared pieces for the stream overlays: the transparent frame, the live
   state hook, the message bar, the "Now / Next" line and the result chip.
   Overlays read only GET /api/live/state (public, run snapshots only). */
import { useEffect, useMemo } from "react";
import { ResultMark } from "@/components/scoring/ResultBadge";
import {
  LIVE_STATE_URL,
  normalizePublicState,
  nowAndNextPools,
  nowNextText,
} from "@/components/scoring/format";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  type PublicLiveState,
  type RunResult,
} from "@/lib/scoring/types";
import { useLiveState } from "@/lib/scoring/use-live-state";

export const TRANSPARENT_CLASS = "nbp-overlay-transparent";

/* The overlay pages make the whole document transparent for the browser
   source. The rule is scoped by a class on <html> that this frame adds on
   mount and removes on unmount, so nothing else on the site changes. A
   second, separate rule (:has, for browsers that support it) also applies
   it on the very first paint before the effect runs. */
const TRANSPARENT_CSS = `html.${TRANSPARENT_CLASS},html.${TRANSPARENT_CLASS} body{background:transparent !important;overflow:hidden !important;}`;
const FIRST_PAINT_CSS = `html:has(.ov-root),html:has(.ov-root) body{background:transparent !important;overflow:hidden !important;}`;

export function OverlayFrame({
  name,
  children,
}: {
  name: string;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(TRANSPARENT_CLASS);
    return () => root.classList.remove(TRANSPARENT_CLASS);
  }, []);

  return (
    <>
      <style>{TRANSPARENT_CSS}</style>
      <style>{FIRST_PAINT_CSS}</style>
      <div className="ov-root" data-overlay={name}>
        {children}
      </div>
    </>
  );
}

export function useOverlayState() {
  const { data } = useLiveState<PublicLiveState>(LIVE_STATE_URL);
  return useMemo(() => normalizePublicState(data), [data]);
}

export function MessageBar({ message }: { message: string | null | undefined }) {
  if (!message) {
    return null;
  }

  return (
    <div className="ov-strip ov-strip--message ov-fade-in">
      <p className="ov-strip__text">
        <span className="ov-ellipsis">{message}</span>
      </p>
    </div>
  );
}

/* "Now: Pool B · Next: Pool C" (nothing for an unpooled round). */
export function NowNextLine({ state }: { state: PublicLiveState }) {
  const { riding, next } = nowAndNextPools(state);
  const text = nowNextText(riding, next, "Now");

  return text ? <div className="ov-nownext">{text}</div> : null;
}

export function ResultChip({ result, className = "" }: { result: RunResult; className?: string }) {
  return (
    <span className={`ov-result ov-result--${result} ${className}`}>
      <ResultMark result={result} />
      <span>{RESULT_LABELS[result]}</span>
      <span>{RESULT_POINTS[result]}</span>
    </span>
  );
}
