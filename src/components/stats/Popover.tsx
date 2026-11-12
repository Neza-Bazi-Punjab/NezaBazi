"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { toolButton } from "./styles";

/* A toolbar button that opens a panel under the toolbar (Filters, Columns,
   Stats legend). Works by touch, mouse and keyboard: the panel follows its
   button in the tab order, and closes on Escape (focus goes back to the
   button), on a click or tap outside it, and when focus moves elsewhere.

   The panel is positioned against the nearest positioned ancestor (the
   toolbar row), so on a phone it spans the toolbar instead of running off
   the side of the screen. */
export default function Popover({
  id,
  label,
  badge,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  label: string;
  /* Short extra text on the button, e.g. "2" active filters. */
  badge?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `${id}-panel`;

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
        aria-labelledby={`${id}-button`}
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-bronze/25 bg-cream p-4 text-brown shadow-lg shadow-brown/10 sm:right-auto sm:w-96"
      >
        {children}
      </div>
    </>
  );
}
