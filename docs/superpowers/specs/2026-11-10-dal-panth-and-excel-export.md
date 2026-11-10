# Dal Panth field and Excel export of riders

10 November 2026, the evening before the event. Requested by the head
organiser: "for the players we need a Dal Panth option (add one empty slot
for that) and an export option under solo riders and teams so that we can
export the players easily to an excel sheet".

Decisions the organiser made when asked:

- Dal Panth is **one blank text box per rider**. Blank for riders who have
  none.
- It is filled in by organisers in three places: the **Solo Riders and Teams
  lists**, **paper entry**, and the **check-in desk**. Riders do not fill it
  in themselves: nothing changes on the public registration forms or the
  account page.

## The rule that shapes everything: add, never alter

The event is tomorrow and check-in runs on these code paths all morning. So:

- **No existing database function is patched, dropped or recreated.** Not
  `admin_mutate_registration`, not `admin_find_rider_by_code`, not
  `paper_registration_rider`, not `admin_create_paper_registration`, not
  `admin_desk_team`. The migration only adds a column, two constraints, a
  grant and two new functions.
- **Every existing flow keeps working exactly as it does now if the new part
  fails.** A registration, a check-in, a desk team or an edit must never fail,
  and never report failure, because Dal Panth could not be read or saved.
- **Code and migration may go live in either order.** Before the migration:
  lists show a dash, saving says the database update is needed, the export
  leaves the column blank. After the migration with old code: nothing
  notices (the column is nullable and nothing names it).
- **No new npm dependency.** The .xlsx file is written by a small writer in
  this repository.

## Privacy

- Dal Panth names an organisation a rider belongs to. The site names no
  organisation anywhere, so the value is **staff-only**: admin lists, paper
  entry, check-in desk, the Excel export. It must never reach `/live`, the
  overlays, `/api/live/**`, the vMix feeds, the graphics rider export
  (`/api/admin/scoring/export`), the commentary panel, the account page, an
  email, or the demo.
- The label "Dal Panth" itself is a general term and may appear in the admin
  UI. No Dal Panth is named in code, copy, tests, fixtures or docs: use
  `Example Dal` in tests.
- The Excel export carries contact details (phone, email, address, age,
  parents, emergency contact). It is for administrators only, is never
  cached, and every download is written to the audit log. It carries **no
  confirmation code** (a code is what a rider shows to check in) and no
  internal ids.
- The privacy page lists what is stored about a rider; it gains one line.

## Shared contract (already written, do not change without telling the lead)

`src/lib/dal-panth.ts`: `DAL_PANTH_LABEL`, `DAL_PANTH_MAX_LENGTH` (120),
`DAL_PANTH_API`, `DAL_PANTH_MIGRATION`, `DAL_PANTH_NOT_SET_UP`,
`DalPanthRequest`, `DalPanthSaved`, `DalPanthFailed`, `normalizeDalPanth`.
It imports nothing.

## Part 1. Database: `supabase/migrations/20261110100000_rider_dal_panth.sql`

Follow the conventions of `20261109120000_desk_teams.sql` and
`20261025100000_rider_parent_names.sql`: a header comment saying what and why
and naming the undo file, idempotent throughout, preconditions that fail
loudly, a verification block at the end, `notify pgrst, 'reload schema';`
last.

1. **Preconditions.** `public.solo_registrations`, `public.team_members` and
   `public.admin_audit_log` exist; both rider tables have `confirmation_code`
   and `full_name`.
2. **Column.** `alter table ... add column if not exists dal_panth text` on
   `solo_registrations` and `team_members`. Nullable, no default.
3. **Length.** Constraints `solo_registrations_dal_panth_length` and
   `team_members_dal_panth_length`:
   `check (dal_panth is null or char_length(btrim(dal_panth)) between 1 and 120)`,
   added only when missing (the `pg_constraint` lookup pattern).
4. **Grants.** `grant select (dal_panth) on public.<table> to authenticated;`
   for both tables (the admin lists read with the administrator's own
   session; today SELECT is table-wide, the explicit grant keeps the column
   readable if that is ever narrowed). **No INSERT or UPDATE grant**: UPDATE
   on these tables is a column list, so riders cannot change it. (INSERT is
   table-wide today, so a rider's own new row could carry a value; accepted,
   it is their own row and the length check holds.)
5. **`public.admin_set_dal_panth(p_code text, p_dal_panth text, p_actor_id uuid, p_actor_name text, p_actor_email text) returns jsonb`**,
   `language plpgsql security invoker set search_path = ''`, modelled on
   `admin_set_check_in` (20260728163000 L100-197):
   - `normalized_code := upper(btrim(p_code))`. Null or blank: raise
     `'Rider not found.'` with errcode `P0002`.
   - New value: collapse whitespace runs to one space, `btrim`, blank becomes
     null. Longer than 120: raise
     `'Dal Panth must be 120 characters or fewer.'` with errcode `22023`.
   - Find the rider across both tables by
     `upper(btrim(confirmation_code)) = normalized_code` (name from a solo
     entry first, else a team entry). None: `'Rider not found.'`, `P0002`.
   - Remember the value before (the solo entry's when there is one, else the
     team entry's).
   - Update **every** row in both tables with that code
     `where dal_panth is distinct from <new value>`; count rows per table.
   - If no row changed: write nothing to the audit log and return
     `changed: false`.
   - Otherwise insert one `admin_audit_log` row: action `set_dal_panth`,
     target_table `registrations`, target_id the normalized code, details
     `{ subject_name, confirmation_code, before, after, solo_entries, team_entries }`.
   - Return `{ confirmation_code, full_name, dal_panth, solo_entries, team_entries, changed }`.
6. **`public.admin_sync_dal_panth() returns integer`**, same language and
   settings: copies a solo entry's value onto team places that share its
   confirmation code and have none
   (`team_members.dal_panth is null`, `solo_registrations.dal_panth is not null`,
   codes compared with `upper(btrim(...))`, codes not null). Returns the
   number of team places filled. No audit row (it repeats a value an
   administrator already set). Running it twice changes nothing the second
   time. This covers a desk team formed after the rider's Dal Panth was typed:
   `admin_desk_team` copies the solo entry with an explicit column list that
   does not include the new column, and that function is not to be touched.
7. **Execute.** For both functions: `revoke execute ... from public, anon, authenticated;`
   then `grant execute ... to service_role;`.
8. **Verification block** (raises on any failure): both columns exist and are
   nullable; both constraints exist; `authenticated` has column SELECT and
   has **no** column UPDATE on `dal_panth` in either table; both functions
   exist with these exact signatures; neither is executable by `anon` or
   `authenticated`; `service_role` can execute both.

Undo file `supabase/migrations/revert/20261110100000_rider_dal_panth.revert.sql`:
refuses while any `dal_panth` value is stored (says how many, and to export
first), then drops both functions, both constraints and both columns, and
reloads the schema. Never applied automatically.

Docs: a numbered entry in `docs/supabase-changes.md` after 27 (number it 28
and say plainly that the two migrations between 27 and this one,
`20261108100000_paper_rider_headshots` and `20261109120000_desk_teams`, have
no numbered entry). State that it is **not applied yet** and patches no
existing function.

## Part 2. Route: `PATCH /api/admin/dal-panth`

`src/app/api/admin/dal-panth/route.ts`, `export const dynamic = "force-dynamic"`.

- `verifyAdminRequest()` first; its response on failure.
- Body through `readJsonBody` (small limit, 4 KB). Must be an object with
  `code` (string, non-blank after trim, at most 32 characters) and
  `dal_panth` (string or null). Anything else: 400
  `"Please provide a rider's code and a Dal Panth."`.
- `normalizeDalPanth(body.dal_panth)`; its error is a 400.
- `createServiceRoleClient().rpc("admin_set_dal_panth", { p_code, p_dal_panth, p_actor_id, p_actor_name, p_actor_email })`.
  The actor comes only from the verified session.
- Errors: `P0002` is 404 with the database's message; `22023` is 400 with the
  database's message; `PGRST202`, `42883` (function missing) and `42703`
  (column missing) are 503 with `DAL_PANTH_NOT_SET_UP`; anything else is
  logged and 500 `"Could not save the Dal Panth. Nothing was changed. Try again."`.
- Success: 200 `DalPanthSaved`, built field by field from the function's
  result (never the raw result), `Cache-Control: private, no-store` on every
  response.

## Part 3. `DalPanthCell` and the admin lists

`src/app/admin/DalPanthCell.tsx` (client component), the same idea as
`SoloHeadshotCell.tsx`: a self-contained cell with its own save, so the
row-edit machinery of `AdminDashboard.tsx` and the registrations route are
not touched.

```ts
type DalPanthCellProps = {
  /* The rider's confirmation code; without one the cell is display-only. */
  code: string | null | undefined;
  value: string | null | undefined;
  riderName: string;
  /* "table": compact, for a list row. "card": for the check-in card. */
  variant?: "table" | "card";
  onSaved?: (value: string | null) => void;
};
```

- Resting: the value, or a dash, and a small button: **Add** when blank,
  **Edit** otherwise, with an accessible name that includes the rider's name
  ("Add Dal Panth for <name>").
- Editing: a text input (`maxLength={DAL_PANTH_MAX_LENGTH}`, label
  "Dal Panth"), **Save** and **Cancel**. Enter saves, Escape cancels. Saving
  blank clears it. While saving, the buttons are disabled and Save reads
  "Saving…".
- Save sends `PATCH DAL_PANTH_API` with `DalPanthRequest`. On success the
  cell shows the returned value at once and calls `onSaved`. On failure the
  server's `error` (or "Could not reach the server. Check the connection and
  retry.") shows under the input with `role="alert"` and the input keeps
  what was typed.
- When the `value` prop changes from outside (a refresh), the cell follows
  it, unless it is being edited.
- Styling from the existing admin classes (bronze, sand, cream); works at
  375 px; no layout shift in the table when it opens (the input fits the
  column).

`src/app/admin/AdminDashboard.tsx`:

- `SoloRegistration` and `TeamMember` types gain
  `confirmation_code?: string | null` and `dal_panth?: string | null` (both
  already arrive, or will, through `select("*")`).
- A **Dal Panth** column in the Solo table and in the Teams member table,
  placed straight after Mother's Name, rendering `DalPanthCell`. Update the
  `<colgroup>`, the header row and the `min-w-[...]` widths, and
  `AdminDashboard.layout.test.mts` with them.
- After a save the list's own row state must carry the new value (so search
  and a later re-render are right): use whatever the dashboard already does
  after an inline edit or a photo change.
- Search (`matchesPerson`) also matches Dal Panth.
- The toolbar (`ListSearchBar`) gains room for one action; the Solo section
  passes `<ExportRidersButton list="solo" />`, the Teams section
  `<ExportRidersButton list="teams" />` (Part 5). On a narrow screen the
  button wraps under the search box; nothing overflows.
- Audit page labels: `set_dal_panth` reads "Set Dal Panth", `export_riders`
  reads "Exported Riders" (add both to `auditActionLabels`).

## Part 4. Check-in desk, paper entry, desk teams, privacy page

`src/app/api/admin/check-in/route.ts` (POST lookup by code only):

- After the existing lookup has succeeded, one extra service-role read of
  `dal_panth` for that code (solo entry first, else the team entry), wrapped
  so that **any** error, a missing column included, yields `null` and is at
  most logged. The lookup response gains `dalPanth: string | null`.
- The roster and search selects are pinned by `check-in.test.mts` and stay
  exactly as they are. Dal Panth is not added to them.

`src/app/admin/CheckInPanel.tsx`: on the rider's card, a "Dal Panth" row
rendering `<DalPanthCell variant="card" code={rider.confirmation_code} value={dalPanth} riderName={rider.full_name} />`.
It saves on its own; **Confirm Check-in** neither waits for it nor sends it.
The card's value resets when another rider is looked up.

Paper entry (`src/app/admin/paper/PaperEntryPanel.tsx`,
`src/app/api/admin/paper-registration/route.ts`):

- One optional box, **Dal Panth (optional)**, on the solo form; on the team
  form one box, **Dal Panth for the whole team (optional)**, applied to all
  four riders. It is its own piece of state, **not** an entry in
  `PAPER_RIDER_FIELDS` (that list also drives the payload the database
  whitelists and the printed PDF forms; neither changes).
- The request body gains a top-level `dal_panth` (string or absent). The
  route reads it from the raw body, runs `normalizeDalPanth`, and a value
  that fails is a 400 **before** anything is saved. It is never put in
  `p_payload`.
- After `admin_create_paper_registration` has succeeded and its result has
  been parsed, when there is a value: call `admin_set_dal_panth` once per
  created rider code, sequentially, each in try/catch.
- The success response is unchanged except for two added fields:
  `dal_panth_saved` (`true`, `false`, or `null` when none was given) and,
  when false, `dal_panth_error` (`DAL_PANTH_NOT_SET_UP` when the function or
  column is missing, otherwise "The registration was saved, but the Dal Panth
  was not. Add it from the Solo Riders or Teams list."). The registration is
  reported as saved either way, with its codes.
- The panel shows that message on the confirmation screen when
  `dal_panth_saved === false`.
- The confirmation email is untouched.

Desk teams (`src/app/api/admin/desk-teams/route.ts`, POST only): after
`admin_desk_team` has succeeded, call `rpc("admin_sync_dal_panth")` in
try/catch; a failure (missing function included) is logged at most and never
changes the response. Nothing else in that file changes.

Privacy page (`src/app/privacy/page.tsx`): one line in the list of what is
stored about a rider, in the page's voice, e.g. "The Dal Panth a rider rides
with, where an organiser records it (optional)." Keep `privacy.test.mts`
passing and pin the new line there.

## Part 5. Excel export

`src/lib/xlsx/write-xlsx.ts`: a dependency-free writer.

```ts
export type XlsxColumn = { header: string; width: number; kind: "text" | "number" };
export type XlsxCell = string | number | null | undefined;
export const buildXlsx: (input: {
  sheetName: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
}) => Uint8Array;
```

- A valid Office Open XML workbook: `[Content_Types].xml`, `_rels/.rels`,
  `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml`,
  `xl/worksheets/sheet1.xml`, in a ZIP container (deflate through
  `node:zlib`'s `deflateRawSync`, CRC-32 from a table in this file, correct
  local headers, central directory and end record).
- Header row bold and frozen (`pane ySplit="1"`), an auto-filter over the
  whole table, column widths from `width`. Worksheet child elements in the
  order Excel requires (sheetViews, cols, sheetData, autoFilter).
- Text cells are **inline strings** (`t="inlineStr"`), so a value that starts
  with `=`, `+`, `-` or `@` is text and can never run as a formula. Number
  cells only for finite numbers in `kind: "number"` columns; anything else
  in such a column is written as text. Null, undefined and "" leave the cell
  out.
- Text is made safe for XML 1.0: `&`, `<`, `>` escaped, characters XML
  forbids removed (control characters other than tab, line feed and carriage
  return, lone surrogates, U+FFFE and U+FFFF), `xml:space="preserve"`,
  truncated at Excel's 32,767 characters. Punjabi (Gurmukhi) text must
  survive byte for byte.
- Sheet name cleaned to Excel's rules (at most 31 characters, none of
  `[ ] : * ? / \`, not blank).

`src/lib/admin/rider-export.ts`: pure functions, no I/O, so they can be
tested: the two fixed column lists and `buildSoloExportRows` /
`buildTeamExportRows` from plain row objects.

Solo columns, in order: No., Rider, Father's name, Mother's name, Age,
Dal Panth, Horse, Horse breed, Horse age, District and state, Full address,
Phone, Email, Experience (years), Emergency contact, Emergency phone,
Registered (Online or Paper), Registered on, Checked in (Yes or No),
Checked in at. Sorted by rider name, then registration time.

Team columns, in order: No., Team, Team leader (Yes or No), Rider, then the
same rider columns as solo from Father's name to Experience (years), then
Team emergency contact, Team emergency phone, Registered (Online, Paper or
Desk), Registered on, Checked in, Checked in at. Sorted by team name, the
leader first, then rider name.

- District and state through `shortLocation` (`src/lib/scoring/types.ts`).
- A paper entry's placeholder email (`isPaperPlaceholderEmail`) is written
  blank.
- Times as text in India time, `10 Nov 2026 19:35`.
- Phones always text.
- The lists are the whole of what is written: no confirmation code, no ids,
  no `checked_in_by`, no `entered_by`, no `profile_id`, no `headshot_path`.

`src/app/api/admin/registrations/export/route.ts`: `GET ?list=solo|teams`
(anything else is a 400), `export const dynamic = "force-dynamic"`,
`export const runtime = "nodejs"`.

- `verifyAdminRequest()` first.
- Service-role reads with **named columns** (never `*`), paged with
  `fetchAllRows`. The select names `dal_panth`; on error code `42703` it is
  retried once without it and the column is exported blank. Any other read
  error: logged, 500 `"The rider list could not be read. Try again."`.
- Before the file is sent, one audit row through `insertRequiredAuditLog`:
  action `export_riders`, target_table `solo_registrations` or
  `team_members`, target_id `solo` or `teams`,
  details `{ list, rows, format: "xlsx", includes_contact_details: true }`.
  If the audit write fails the export is refused (500
  `"The export could not be recorded, so it was not made. Try again."`).
- Response: the bytes, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `Content-Disposition: attachment; filename="nezabazi-solo-riders-YYYY-MM-DD.xlsx"`
  (or `nezabazi-team-riders-...`), the date in India, `Cache-Control: private, no-store`.
  Error responses are JSON `{ error }` with the same cache header.

`src/app/admin/ExportRidersButton.tsx` (client component),
`{ list: "solo" | "teams"; className?: string }`: a button, **Export to
Excel**. It fetches the route, and only when the response is OK turns the
bytes into a download (blob URL, the filename from `Content-Disposition`,
the URL revoked afterwards). While working it is disabled and reads
"Preparing…". A failure shows the server's `error` next to the button with
`role="alert"`; a JSON error is never saved as a file. A note under or
beside it, small: "Every rider, with contact details. For organisers only."

## Tests

Node's test runner, `.mts`, the style of the existing files (many pin source
text; pure functions are imported and exercised). Every new test file must be
added to the explicit list in `package.json` `scripts.test`: the QA pass does
that, workers only name their files in their report.

- Migration: column, constraints, the SELECT grant, **no** insert or update
  grant, both functions with `security invoker` and `set search_path = ''`,
  execute revoked from public, anon and authenticated, the audit action, and
  that the file contains none of `admin_mutate_registration`,
  `admin_find_rider_by_code`, `paper_registration_rider`,
  `admin_create_paper_registration`, `admin_desk_team` outside comments.
- `normalizeDalPanth`: null, blank, whitespace, collapse, exactly 120, 121,
  non-string.
- Route source: admin check first, actor from the session only, the error
  mapping, no-store.
- Privacy guards: `dal_panth` added to the forbidden patterns in
  `src/app/api/scoring-routes.test.mts` (graphics export) and
  `src/app/live/live-pages.test.mts` (public pages), and a new assertion that
  `src/lib/scoring/**`, `src/app/commentary/**`, `src/app/account/**`,
  `src/app/register/**`, `src/app/register-team/**` and `src/lib/email/**`
  never mention `dal_panth`.
- `buildXlsx`: the ZIP parses (central directory, CRCs match, each part
  inflates), required parts present, a `=1+1` value is an inline string, XML
  specials and control characters are handled, Gurmukhi text round-trips,
  numbers are numeric cells, header count equals column count.
- Export rows: column order, sorting, placeholder email blank, no code or id
  anywhere in the output, team leader first.
- Export route source: admin check before any read, named columns, audit
  before the response, no-store, the 42703 fallback.

## Not in this change

- The public registration forms, the account page and the printed paper form
  PDFs.
- Showing Dal Panth to the commentator, on the scoreboard or on the stream.
- Filtering the export by the search box (it is always the whole list).
- A CSV option (the graphics team's CSV export on `/admin/scoring` stays as
  it is).

## Who owns which files

No two workers touch the same file. `package.json`,
`docs/event-day-runbook.md` and the two privacy-guard test files belong to
the QA pass.

| Worker | Files |
| --- | --- |
| Database and route | `supabase/migrations/20261110100000_rider_dal_panth.sql`, its revert, `src/app/api/admin/dal-panth/route.ts`, `src/app/admin/dal-panth.test.mts`, `docs/supabase-changes.md` |
| Export | `src/lib/xlsx/write-xlsx.ts`, `src/lib/xlsx/write-xlsx.test.mts`, `src/lib/admin/rider-export.ts`, `src/app/api/admin/registrations/export/route.ts`, `src/app/admin/ExportRidersButton.tsx`, `src/app/admin/rider-export.test.mts` |
| Admin lists | `src/app/admin/DalPanthCell.tsx`, `src/app/admin/AdminDashboard.tsx`, `src/app/admin/AdminDashboard.layout.test.mts`, `src/app/admin/dal-panth-cell.test.mts` |
| Desk and paper | `src/app/admin/CheckInPanel.tsx`, `src/app/api/admin/check-in/route.ts`, `src/app/admin/paper/PaperEntryPanel.tsx`, `src/app/api/admin/paper-registration/route.ts`, `src/app/api/admin/desk-teams/route.ts`, `src/app/privacy/page.tsx`, `src/app/privacy/privacy.test.mts`, `src/app/admin/dal-panth-desk.test.mts`, and `src/app/admin/check-in.test.mts` / `src/app/admin/paper-registration.test.mts` only where an existing pin has to move |
