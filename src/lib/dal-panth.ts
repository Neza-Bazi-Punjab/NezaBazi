// Dal Panth: the one optional line organisers keep about a rider, naming the
// Dal Panth they ride with. Blank for most riders.
//
// It is organisers' data. Only administrators write it (the Solo Riders and
// Teams lists, paper entry, the check-in desk), always through the
// service-role-only database function admin_set_dal_panth, which keeps every
// entry a rider holds under one confirmation code in step and writes the
// audit record. It is never shown on a public page, a feed or the commentary
// panel: the site names no organisation (see the spec,
// docs/superpowers/specs/2026-11-10-dal-panth-and-excel-export.md).
//
// This file is the shared contract between the route, the cell and the
// export. It imports nothing, so the browser, the server and the tests can
// all load it.

export const DAL_PANTH_LABEL = "Dal Panth";

/* The database enforces the same bound (<table>_dal_panth_length). */
export const DAL_PANTH_MAX_LENGTH = 120;

/* PATCH { code, dal_panth } — administrators only. */
export const DAL_PANTH_API = "/api/admin/dal-panth";

export const DAL_PANTH_MIGRATION = "supabase/migrations/20261110100000_rider_dal_panth.sql";

/* Shown wherever a save is attempted before the migration is applied. */
export const DAL_PANTH_NOT_SET_UP = `Dal Panth needs a database update first (${DAL_PANTH_MIGRATION}).`;

export type DalPanthRequest = {
  /* The rider's confirmation code (NBP-XXXXXX). */
  code: string;
  /* Blank or null clears it. */
  dal_panth: string | null;
};

export type DalPanthSaved = {
  ok: true;
  confirmation_code: string;
  full_name: string;
  dal_panth: string | null;
  /* False when the stored value was already this one: nothing was written. */
  changed: boolean;
};

export type DalPanthFailed = { error: string };

export type NormalizedDalPanth =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/* Trims, collapses runs of whitespace to one space, and turns blank into
   null. Anything that is not a string, null or undefined is refused, as is a
   value longer than the bound after trimming. */
export const normalizeDalPanth = (value: unknown): NormalizedDalPanth => {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${DAL_PANTH_LABEL} must be text.` };
  }

  const text = value.replace(/\s+/g, " ").trim();

  if (text === "") {
    return { ok: true, value: null };
  }

  if (text.length > DAL_PANTH_MAX_LENGTH) {
    return {
      ok: false,
      error: `${DAL_PANTH_LABEL} must be ${DAL_PANTH_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, value: text };
};
