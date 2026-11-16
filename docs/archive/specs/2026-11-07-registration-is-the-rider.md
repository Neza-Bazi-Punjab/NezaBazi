# A registration is the rider, the account is who entered it — design (7 November 2026)

## What went wrong

On 7 Nov an administrator registered three different riders from their own
account on the online solo form (admins may enter several). Every registration
carries that account's id, and the site assumes one account equals one rider:

1. **Photos.** An administrator's upload for a rider goes onto the rider's
   *account* (the earlier rider-photos work, PR 44), so all three registrations
   showed the same photo. Reported by the organisers as "uploading to multiple
   profiles".
2. **Account sync.** `syncRegistrationProfile` writes the account's name, age,
   location and phone onto every `solo_registrations` row whose `profile_id`
   is the account. The next time that administrator edits their own account,
   the three riders' details are overwritten with the administrator's. Not yet
   triggered; a live hazard.
3. **Shared contact details.** The organisers want several riders entered
   with the same email and phone (family, club contact, no email of their
   own). `solo_registrations` and `team_members` have `UNIQUE (email)` and
   `UNIQUE (phone)`, the paper entry refuses matches, and the confirmation
   code trigger reuses a code whenever the email matches, so lifting the
   uniqueness alone would hand one code to several riders and check-in by code
   would check them all in at once.

Live data on 7 Nov, counted only: 34 solo registrations, 33 with an account,
1 account on 3 registrations, 0 shared emails or phones yet, 0 teams, 24
accounts with their own photo, 5 admin photo uploads (3 onto accounts).

## The one rule

**A registration is a rider. The account is the person who entered it.** A
registration is the account holder's *own* only when its email equals the
account's email **and** its full name equals the account's full name (both
compared lower-cased, trimmed, spaces collapsed). Everything that used to
assume "the account is the rider" asks this question instead.

Consequences, by area:

- **Photos.** A registration's own photo (`headshot_path` on the row) comes
  first. The account's photo counts only for the account holder's own
  registration. An administrator's upload goes onto the account only for the
  holder's own registration; otherwise onto the registration row. The
  organisers can **replace** and **remove** a registration photo (audited
  `replace_headshot` / `remove_headshot`), not only fill an empty slot.
- **Account sync.** Account edits reach only the holder's own registration
  (matched on the previous email and name), never the riders they entered.
- **Account page.** "Your registration" is the holder's own; the others
  appear under "Registrations you entered" (name, event, code), read only.
- **Confirmation codes.** One code per *rider*: the trigger reuses a code only
  when email **and** full name match an existing entry (the same person in
  solo and on a team). Two riders sharing an email get two codes.
- **Duplicates.** A true duplicate is the same full name with the same email
  *or* the same phone in the same kind of entry; that is refused. Anything
  else is allowed. The paper entry's "Possible duplicate" box keeps warning.
- **Team riders** get `headshot_path` too, and the same rules.
- **Who may enter several riders online**: unchanged for now (administrators;
  everyone else sees "You have already registered"). *Open question for the
  organisers: should any account be able to enter several riders?*

## Step 1 — code only, ships first (the bug fixes)

No migration: `solo_registrations.headshot_path` already exists on the live
project (PR 44's migration).

Files: `src/app/api/admin/headshots/route.ts` (upload target by the rule;
`replace` and `remove`; DELETE handler), `src/lib/admin/headshot-urls.ts`
(`isOwnRegistration(registration, user)` helper; `loadSoloHeadshots`,
`getHeadshotUrl` callers apply registration-first then own-account-only),
`src/app/api/admin/check-in/route.ts` (`soloHeadshot`), `src/lib/scoring/rider-detail.ts`
(same), `src/app/admin/SoloHeadshotCell.tsx` (Replace / Remove on the
thumbnail pop-up, confirmation on Remove), `src/lib/supabase/sync-registration-profile.ts`
(own registration only), `src/app/account/page.tsx` + `AccountPage.tsx`
("Registrations you entered"), `src/app/admin/AdminDashboard.tsx`
(`auditActionLabels` only), tests (`solo-photos.test.mts`,
`check-in.test.mts`, `auth-flow.test.mts` where it asserts the account page
read), docs (`docs/supabase-changes.md` "Email is the rider's identity",
README check-in/photos paragraphs, `docs/event-day-runbook.md` photos line).

Storage: registration photos stay under `paper/<registration_id>/` (the name
is historical; the comment in `headshots.ts` says "entry photo"). Deleting a
registration still removes its objects.

## Step 2 — the database (after the organisers confirm the rule)

`supabase/migrations/20261108100000_registration_is_the_rider.sql` (there is
already a `20261108100000_paper_rider_headshots.sql`; use `20261108110000`):

1. Drop `solo_registrations_email_key`, `solo_registrations_phone_key`,
   `team_members_email_key`, `team_members_phone_key` (if they exist). Add
   plain indexes on `lower(email)` and on the phone digits for the lookups.
2. True-duplicate guard: a unique index on
   `(lower(btrim(full_name)), lower(btrim(email)))` and one on
   `(lower(btrim(full_name)), digits(phone))` per table, where `digits` is
   `paper_registration_phone_key` (already exists). Refuse message in the
   routes: "This rider is already registered with this email/phone."
3. `assign_confirmation_code`: reuse only on email **and** name match.
   Backfill: nothing (no shared emails yet).
4. `admin_create_paper_registration`: the same duplicate rule, patched with
   the asserted-anchor technique; the cross-kind phone rule goes.
5. `team_members.headshot_path` with the own-folder check and select grant,
   as `20261108100000_paper_rider_headshots.sql` did for solo.
6. `admin_mutate_registration` unchanged (it does not touch these columns).
7. Verify block; `notify pgrst`; revert file alongside.

Code with it: the solo form's 23505 message; the paper entry panel's
duplicate text; the Teams list gets a Photo column (`SoloHeadshotCell`
generalised to a `kind`); check-in team cards read the member's own photo
first; `docs/supabase-changes.md` entry 26.

## Not changing

Email confirmation as the proof that a person may claim an entry; check-in by
code; the draw; live scoring identity (`solo:<id>` / `team:<id>`).
