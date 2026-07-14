// Client-side helpers + React hook for the registration_drafts table: loads,
// debounce-saves, and deletes the signed-in user's solo/team draft so
// half-finished registrations survive logout and device switches.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type DraftType = "solo" | "team";

export type SoloDraftData = {
  step?: number;
  fullName?: string;
  age?: string;
  location?: string;
  phone?: string;
  email?: string;
  yearsExperience?: string;
  horseName?: string;
  horseAge?: string;
  horseBreed?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

export type TeamRiderDraft = {
  fullName?: string;
  age?: string;
  location?: string;
  phone?: string;
  email?: string;
  yearsExperience?: string;
  horseAge?: string;
  horseBreed?: string;
};

export type TeamDraftData = {
  step?: number;
  teamName?: string;
  riders?: TeamRiderDraft[];
};

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export const deleteRegistrationDraft = async (draftType: DraftType) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { error } = await supabase
    .from("registration_drafts")
    .delete()
    .eq("profile_id", user.id)
    .eq("draft_type", draftType);

  if (error) {
    // A leftover draft is harmless; the next registration attempt overwrites it.
    console.error("Unable to delete the registration draft", error);
  }
};

/* Debounced autosave for a registration draft. Pass the current form data;
   every change is upserted DEBOUNCE_MS after the user stops typing. The first
   render (restored draft or prefill) is not re-saved. */
const DEBOUNCE_MS = 800;

export const useRegistrationDraft = <T extends object>(
  draftType: DraftType,
  data: T
) => {
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const lastSavedRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const pendingRef = useRef<string>("");

  const persist = useCallback(
    async (serialized: string) => {
      setStatus("saving");

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setStatus("error");
        return;
      }

      const { error } = await supabase.from("registration_drafts").upsert(
        {
          profile_id: user.id,
          draft_type: draftType,
          data: JSON.parse(serialized) as T,
        },
        { onConflict: "profile_id,draft_type" }
      );

      if (error) {
        console.error("Unable to save the registration draft", error);
        setStatus("error");
        return;
      }

      lastSavedRef.current = serialized;
      setStatus("saved");
    },
    [draftType]
  );

  // Immediate save, used on wizard step changes and the manual Save button.
  const flush = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (pendingRef.current !== lastSavedRef.current) {
      void persist(pendingRef.current);
    }
  }, [persist]);

  useEffect(() => {
    const serialized = JSON.stringify(data);
    pendingRef.current = serialized;

    // Treat the initial mount value as already saved — only user edits count.
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized;
      return;
    }

    if (serialized === lastSavedRef.current) {
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      void persist(serialized);
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [data, persist]);

  return { status, flush };
};
