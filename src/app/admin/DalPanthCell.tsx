"use client";

/* The Dal Panth of one rider: the value (or a dash) and a small Add or Edit
   button that opens a text box with Save and Cancel. Used in the Solo riders
   and Teams lists (variant "table") and on the check-in card ("card").

   It saves on its own, through PATCH DAL_PANTH_API, so it is never part of a
   row's edit form or of anything sent to /api/admin/registrations. The
   database keeps every entry under the rider's confirmation code in step, so
   the code is what is sent; without one the cell only shows the value.

   Before the database update is applied the rows carry no dal_panth at all:
   the cell shows a dash, and a save shows the server's message. */
import { useEffect, useId, useRef, useState } from "react";
import {
  DAL_PANTH_API,
  DAL_PANTH_LABEL,
  DAL_PANTH_MAX_LENGTH,
  normalizeDalPanth,
  type DalPanthRequest,
  type DalPanthSaved,
} from "@/lib/dal-panth";

type DalPanthCellProps = {
  /* The rider's confirmation code; without one the cell is display-only. */
  code: string | null | undefined;
  value: string | null | undefined;
  riderName: string;
  /* "table": compact, for a list row. "card": for the check-in card. */
  variant?: "table" | "card";
  onSaved?: (value: string | null) => void;
};

const SAVE_FAILED = "Could not save the Dal Panth. Nothing was changed. Try again.";
const UNREACHABLE = "Could not reach the server. Check the connection and retry.";

/* A stored value worth showing, or null for none. */
const shownValue = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value : null;

export default function DalPanthCell({
  code,
  value,
  riderName,
  variant = "table",
  onSaved,
}: DalPanthCellProps) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /* Set when an edit ends, so focus goes back to the button (and only then,
     never on first render). */
  const returnFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The value this cell last saved, and the prop it was saved over. While the
     prop is still that one, the saved value is shown; once the list refreshes
     and the prop changes, the prop is followed again. */
  const [saved, setSaved] = useState<{ value: string | null; over: string | null } | null>(null);

  const propValue = shownValue(value);
  const current = saved && saved.over === propValue ? saved.value : propValue;
  const riderCode = typeof code === "string" && code.trim() !== "" ? code.trim() : null;
  const card = variant === "card";

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(current ?? "");
    setError(null);
    setEditing(true);
  };

  const stopEditing = () => {
    returnFocus.current = true;
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (saving || !riderCode) {
      return;
    }

    const normalized = normalizeDalPanth(draft);

    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    const body: DalPanthRequest = { code: riderCode, dal_panth: normalized.value };

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(DAL_PANTH_API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as
        | Partial<DalPanthSaved & { error: string }>
        | undefined;

      if (!response.ok || result?.ok !== true) {
        setError(
          typeof result?.error === "string" && result.error.trim() !== ""
            ? result.error
            : SAVE_FAILED
        );
        return;
      }

      const next = "dal_panth" in result ? shownValue(result.dal_panth) : normalized.value;

      setSaved({ value: next, over: propValue });
      stopEditing();
      onSaved?.(next);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();

      if (!saving) {
        stopEditing();
      }
    }
  };

  const buttonClass = card
    ? "shrink-0 rounded-lg px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60"
    : "h-8 shrink-0 rounded-lg px-2 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60";
  const quietButtonClass = `${buttonClass} border border-bronze/20 text-bronze-dark hover:border-bronze/40`;

  if (editing) {
    return (
      <div className="min-w-0">
        <label htmlFor={inputId} className="sr-only">
          {DAL_PANTH_LABEL} for {riderName}
        </label>
        <div className={`flex min-w-0 items-center gap-1.5 ${card ? "flex-wrap gap-2" : ""}`}>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={DAL_PANTH_MAX_LENGTH}
            readOnly={saving}
            placeholder="Blank for none"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={
              card
                ? "block w-full min-w-0 basis-full rounded-lg border border-bronze/20 bg-cream px-3 py-2 text-base text-brown focus:border-bronze focus:outline-none"
                : "block h-8 w-full min-w-0 flex-1 rounded-lg border border-bronze/20 bg-cream px-2 text-sm text-brown focus:border-bronze focus:outline-none"
            }
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={`${buttonClass} bg-bronze-deep text-cream hover:bg-bronze`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={stopEditing}
            disabled={saving}
            className={quietButtonClass}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 whitespace-normal break-words text-xs text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-2 ${card ? "flex-wrap" : ""}`}>
      <span
        className={`min-w-0 flex-1 truncate ${card ? "text-base" : ""} ${current ? "" : "text-brown/60"}`}
        title={current ?? undefined}
      >
        {current ?? "—"}
      </span>
      {riderCode && (
        <button
          ref={buttonRef}
          type="button"
          onClick={startEditing}
          aria-label={`${current ? "Edit" : "Add"} ${DAL_PANTH_LABEL} for ${riderName}`}
          className={quietButtonClass}
        >
          {current ? "Edit" : "Add"}
        </button>
      )}
    </div>
  );
}
