"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { focusRing, toolButton } from "./styles";

/* A toolbar button that opens a panel under the toolbar (Filters, Columns,
   Stats legend). Works by touch, mouse and keyboard: the panel follows its
   button in the tab order, and closes on Escape (focus goes back to the
   button), on a click or tap outside it, and when focus moves elsewhere.

   The panel is positioned against the nearest positioned ancestor (the
   toolbar row), so on a phone it spans the toolbar instead of running off
   the side of the screen. A tall panel scrolls inside itself; with `title`
   it gets a header that stays in view, with a Close button. */
export default function Popover({
  id,
  label,
  badge,
  title,
  wide,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  label: string;
  /* Short extra text on the button, e.g. "2" active filters. */
  badge?: string;
  /* A heading for the panel; adds a header with a Close button. */
  title?: string;
  /* A wider panel on larger screens (the legend). */
  wide?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `${id}-panel`;

  const close = () => {
    onOpenChange(false);
    buttonRef.current?.focus();
  };

  /* On a phone a tall panel can open below the fold: bring all of it into
     view (it scrolls inside itself past 75% of the screen). */
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={toolButton}
      >
        {label}
        {badge && (
          <span className="rounded-full bg-bronze px-1.5 text-xs leading-5 text-cream">{badge}</span>
        )}
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      <div
        ref={panelRef}
        id={panelId}
        role="group"
        aria-labelledby={title ? `${id}-title` : `${id}-button`}
        hidden={!open}
        className={`absolute inset-x-0 top-full z-30 mt-2 max-h-[75vh] overflow-y-auto overscroll-contain rounded-xl border border-bronze/25 bg-cream text-brown shadow-lg shadow-brown/10 sm:right-auto ${
          wide ? "sm:w-[34rem]" : "sm:w-96"
        } ${title ? "pb-4" : "p-4"}`}
      >
        {title ? (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-bronze/20 bg-cream px-4 py-2">
              <h2
                id={`${id}-title`}
                className="font-display text-base font-bold uppercase tracking-[0.12em] text-ink"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={`Close ${title.toLowerCase()}`}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-bronze-dark hover:text-ink ${focusRing}`}
              >
                Close
                <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3">
                  <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
            <div className="px-4 pt-3">{children}</div>
          </>
        ) : (
          children
        )}
      </div>
    </>
  );
}
