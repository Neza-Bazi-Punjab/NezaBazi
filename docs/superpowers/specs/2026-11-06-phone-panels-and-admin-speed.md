# Phone-fit staff panels and a faster admin — design (6 November 2026)

Three asks from the organisers after the 6 Nov panel redesign landed:

1. the **judges' panel** must work on a phone (judges score from phones at the track);
2. the **commentary panel** must work on a phone;
3. the **admin dashboard** lags "about two seconds between each click".

Everything here was checked on the dev server at 375 × 812 with the training
panels (`/judge/demo`, `/commentary/demo`, `SCORING_SAMPLE_MODE=1`), and by
reading the admin request path. Desktop layouts (`lg` and `xl` and up) are
**not** to change: Mani rebuilt both panels to the "Live Scoring 6e" design on
6 Nov, and only the narrow breakpoints are in scope.

## Part 1 — Judges' panel on a phone (`src/app/judge/JudgePanel.tsx`)

What is wrong at 375 px today:

- **The action row overflows.** Skip · Take out · Cancel · Confirm sit in one
  `grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]` row with `whitespace-nowrap`
  and 18 px padding; "CONFIRM" is cut off at the right edge. The one button
  a judge must never miss is the one that does not fit.
- **The status bar wraps to three lines** ("JUDGE QUALIFICATION POOL A / 1/10
  ROUND 1 OF 3 ● ONLINE / 22:39:06"), taking ~90 px of a 812 px screen, and
  "QUALIFICATION" repeats the top strip.
- **The rider's name at 52 px runs to three lines**, so on an iPhone SE
  (375 × 667) the result buttons start below the fold.
- **The side column (every pool, 30 riders) stacks under the main column**,
  so the Log and the pools make the page very long; nothing is collapsible.
- **Top-strip buttons are 32 px tall** (`h-8`), under the 44 px touch target.

Required behaviour below `lg` (desktop unchanged):

1. **Result buttons visible without scrolling** when a rider is on course, on
   a 375 × 667 viewport: top strip, "On course", the name, the facts grid and
   the three result buttons must all fit above the fold with the status bar
   showing. Name scale on phones: `text-[38px]` (keep `sm:text-[68px]
   xl:text-[84px]` as they are). Facts grid stays 2 × 2.
2. **Action row on phones**: two rows. Row 1 full width: `Cancel` | `Confirm`
   (equal halves, `h-14`, `text-[19px]`, Confirm filled ink). Row 2:
   `Skip` | `Take out` (equal halves, `h-12`). No `whitespace-nowrap` on
   phones. From `sm` up the current single row stays.
3. **Status bar on phones**: one line, in this order: role, the pool letter
   and rider counter (e.g. "POOL A · 1/10"), the online dot and word, the
   clock. Round "1 of 3" and the round name drop out on phones (they are in
   the top strip and the facts). Implement as a `phone` subset in
   `StatusBar` (`src/components/scoring/ledger/Ledger.tsx`): a new optional
   `phoneItems` prop; when given, `items` render from `sm` up and
   `phoneItems` below it. Both panels use it.
4. **Pools column on phones**: each pool is a tappable summary row
   ("Pool B · 0/10 through · Waiting · R1") that expands to its riders on tap;
   the pool with the rider on course (or the called pool) starts expanded, the
   rest collapsed. Add a `collapsible` prop to `PoolList`; desktop passes
   nothing and renders exactly as today. Use a native `<details>`/`<summary>`
   or a button with `aria-expanded`; either way keyboard and screen-reader
   usable.
5. **Touch targets**: every button a judge taps on a phone is at least 44 px
   tall (`min-h-11`), including the top-strip buttons (`StripButton`) and
   "Undo last". Desktop sizes unchanged (`sm:h-8` etc.).
6. **The Log** keeps its place but shows the last 5 results on phones with a
   "Show all" toggle; desktop shows everything as today.
7. The fixed confirmation sheet (the `fixed inset-x-0 bottom-0 z-[60]` block)
   keeps its safe-area padding; check it does not sit under the sticky status
   bar on a phone and that its two buttons are full-width halves.
8. Nothing in the component tree may read registration tables or staff APIs
   it does not already read; `live-pages.test.mts` must keep passing.

## Part 2 — Commentary panel on a phone (`src/app/commentary/CommentaryPanel.tsx`)

What is wrong at 375 px today:

- **Standings names are truncated to two letters** ("Ha…", "Gu…"): the grid
  gives the three result boxes and the "STILL RIDING" status column most of
  the width. Unusable for an announcer.
- **The status bar wraps to two lines** and the training/role word is
  covered by nothing on production, but the second line costs space.
- The rider's name at 48 px runs to two or three lines.
- Thirty standings rows come before "Next riders", "Round progress" and
  "Recent results", which are what a commentator reads between runs.

Required behaviour below `xl` (desktop unchanged):

1. **Standings rows on phones**: the name column gets the space. Grid on
   phones `grid-cols-[22px_minmax(0,1fr)_repeat(3,26px)_auto]` or equivalent
   so that a 21-character name ("Harpreet Singh Sandhu") shows in full at
   15 px in the condensed face; result boxes 26 × 26; status as a short mono
   tag on the right ("RIDING", "THROUGH", "OUT", "NEXT") rather than
   "STILL RIDING". Only truncate when the name really does not fit.
2. **Standings on phones default to the current pool** (the pool riding or
   called), with a "Show all pools" toggle that reveals the rest. Desktop
   shows everything as today.
3. **Section order on phones**: On course (name, facts, headshot) → Next
   riders → Round progress → Recent results → Standings → All pools. Desktop
   column layout unchanged. Do this with CSS order classes on the existing
   sections at the narrow breakpoint, not by duplicating markup.
4. **Name on phones** `text-[36px]`; `sm:text-[60px] xl:text-[72px]` stay.
5. **Status bar on phones**: one line via the same `phoneItems` prop: role,
   runs counter ("0/90 RUNS"), live dot and word, clock. "Screens: …" drops
   out on phones.
6. **The headshot**, when present, sits beside the name at 64 px on phones
   (its current size on desktop stays).
7. Touch targets ≥ 44 px for anything tappable on phones.

## Part 3 — The admin lag (`/admin/*`)

Why every click waits (read from the code; the site deploys from a Vercel
scope this session cannot read logs from):

1. `src/proxy.ts` → `updateSession` calls `supabase.auth.getUser()` on
   **every** request, including the RSC fetch behind each menu click. That is
   a network round trip to the Supabase Auth server.
2. The page then calls `getAdminAccess()` (`src/app/admin/admin-access.tsx`),
   which calls `auth.getUser()` **again** (second Auth round trip) and then
   the `profiles` role query (third hop), sequentially. On a full load the
   layout calls `getAdminAccess()` as well.
3. Only then do the page's data queries start. The Solo riders page then runs
   `loadSoloHeadshots` → `auth.admin.listUsers` (1 000 accounts) →
   `createSignedUrls`, sequentially after the rows arrive.
4. There is **no `loading.tsx`** under `/admin`, so a menu click gives no
   feedback until the whole RSC payload is back. With Vercel in another
   region from the database (Supabase is in AWS us-west-2) each hop is
   ~70–100 ms, plus a cold start, which is the "two seconds".
5. Every admin route (`verifyAdminRequest`) and every judge/commentary route
   (`getSessionRole`) does the same `getUser` + `profiles` pair, so each
   judge tap and each dashboard save pays it too.

**Measured on the live site (Supabase gateway logs, 24 h to 6 Nov 2026
22:50 PT, server-side calls only):**

| Path | Calls | Avg origin ms | p90 origin ms |
| --- | --- | --- | --- |
| `/auth/v1/user` | 67,452 | 78 | 122 |
| `/rest/v1/profiles` | 27,199 | 116 | 150 |
| `/rest/v1/solo_registrations` | 526 | 171 | 299 |
| `/rest/v1/scoring_live_state` | 466 | 187 | 304 |

About 2.5 Auth verifications for every role read, and the role read itself
comes after them. The calls arrive from Cloudflare IAD (Ashburn), so the
Vercel functions run in `iad1`; the database is in AWS us-west-2 (Oregon).
A polling staff panel shows the same three-hop pattern every 3 seconds:
`/auth/v1/user` from the proxy, `/auth/v1/user` from the route, then
`profiles`.

The project's JWT signing key is **asymmetric (ES256, one P-256 key in
`/auth/v1/.well-known/jwks.json`)**, so `supabase.auth.getClaims()` verifies
the session **locally** with a cached JWKS: no Auth round trip. The library
falls back to `getUser()` by itself for HS256 tokens, so the change is safe
even if the key is ever rotated back.

Required changes:

1. **`getClaims()` for session checks** in exactly these four places:
   `src/lib/supabase/middleware.ts` (the proxy's refresh call),
   `src/app/admin/admin-access.tsx`, `src/lib/admin/server.ts`
   (`verifyAdminRequest`), `src/lib/scoring/auth.ts` (`getSessionRole`).
   Identity = `claims.sub`; email = `claims.email`; display name =
   `claims.user_metadata?.full_name` (string, trimmed) falling back to the
   email, exactly the values the audit actor used before. A missing or
   invalid token = signed out, as before. Every other `getUser()` in the app
   (account, registration, auth callbacks, client components) stays as it is.
2. **One check per request**: wrap `getAdminAccess` in React `cache()` so the
   admin layout and the page share one verification and one `profiles` query.
3. **`src/app/admin/loading.tsx`**: an instant skeleton inside the admin
   layout: the slim page-heading bar (same height as `AdminPageHeading`) and
   three muted bars in a card, `aria-busy`, no text that could be mistaken for
   data. This is what makes a menu click respond at once and lets Next
   prefetch the loading state for every `<Link>` in `AdminNav`.
4. **Start the account listing in parallel** on the Solo riders page: split
   `loadSoloHeadshots` (`src/lib/admin/headshot-urls.ts`) into
   `loadAuthUserIndex(client)` (the `listUsers` call, returning the two maps)
   and `matchSoloHeadshots(index, rows, client)` (matching + batch signing),
   and have `AdminDashboardSection` start `loadAuthUserIndex` before awaiting
   the rows. Same for the Audit log page's `listUsers`: start it with the
   queries, not after them. Behaviour and results identical.
5. **Keep `router.refresh()` after saves** (several desks must stay in step;
   that was Mani's explicit choice). With 1–2 the refresh costs one
   `profiles` query plus the page's reads instead of three Auth hops.
6. ~~A `vercel.json` region pin to `pdx1`.~~ Dropped the same evening at the
   organisers' request: they do not think the region is the problem, and the
   functions stay where Vercel puts them.
7. **Document it** in `docs/performance.md` in the existing style (what
   changed, how measured, results): measure the dev-server data-loading step
   before/after is not meaningful (dev compiles), so measure what is: the
   number of sequential network hops per admin navigation before and after
   (count them from the code and from the dev server's request log), and the
   `getClaims` verification time versus a `getUser` round trip (time both with
   a real session token from the dev server log, or state that it needs a
   signed-in session and leave the row for the organisers to fill in).

Not in scope: changing what each admin page loads (done by Mani in PR #27),
virtualising tables, caching registration data between visits.

## Tests (house style: read the source, assert the invariant)

- `src/app/judge/panel-phone.test.mts` (new, add to `npm test`): the judge
  panel has the two-row phone action layout and no `whitespace-nowrap` on
  the Confirm button at the base breakpoint; `StatusBar` accepts
  `phoneItems`; `PoolList` accepts `collapsible`; strip buttons are
  `min-h-11` on phones.
- `src/app/commentary/panel-phone.test.mts` (new): standings grid gives the
  name a `minmax(0,1fr)` column on phones; the "Show all pools" toggle
  exists; phone section order uses `order-` classes only below `xl`.
- `src/app/admin/admin-speed.test.mts` (new): the four session checks call
  `getClaims()` and not `getUser()`; `getAdminAccess` is wrapped in `cache(`;
  `src/app/admin/loading.tsx` exists and renders no data; the Solo and Audit
  pages start the account listing before awaiting rows.
- Every existing test keeps passing (`npm test`), including
  `live-pages.test.mts` and `scoring-routes.test.mts`.

## File ownership (workers never touch another worker's files)

| Worker | Files |
| --- | --- |
| UI — panels | `src/app/judge/JudgePanel.tsx`, `src/app/commentary/CommentaryPanel.tsx`, `src/components/scoring/ledger/Ledger.tsx`, `src/components/scoring/ledger/ledger.css`, `src/app/judge/panel-phone.test.mts`, `src/app/commentary/panel-phone.test.mts` |
| PERF — admin | `src/lib/supabase/middleware.ts`, `src/app/admin/admin-access.tsx`, `src/lib/admin/server.ts`, `src/lib/scoring/auth.ts`, `src/app/admin/loading.tsx`, `src/app/admin/AdminDashboardSection.tsx`, `src/lib/admin/headshot-urls.ts`, `docs/performance.md`, `src/app/admin/admin-speed.test.mts` |
| PM (this session) | `package.json` test script (both new test files), `.gitattributes`, README, runbook, browser verification |
