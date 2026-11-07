# Performance notes

A record of speed work on the site: what changed, how it was measured, and the results, so later changes can be compared against it.

## Admin clicks stop waiting on the Auth server (6 Nov 2026)

**Branch:** `feat/phone-panels-admin-speed` · **Files:** `src/lib/supabase/middleware.ts`, `src/app/admin/admin-access.tsx`, `src/lib/admin/server.ts`, `src/lib/scoring/auth.ts`, `src/app/admin/loading.tsx`, `src/app/admin/AdminDashboardSection.tsx`, `src/lib/admin/headshot-urls.ts`

The organisers reported about two seconds between each click on the admin dashboard.

**Before:** every admin menu click waited on a chain of network calls, one after the other, before anything appeared on screen:

1. the proxy (`src/proxy.ts`) asked the Supabase Auth server who was signed in (`getUser()`), on every request;
2. the page asked the Auth server again (`getAdminAccess`);
3. then read the administrator's role from `profiles`;
4. then read the page's own data;
5. then, on Solo riders and Audit log, listed every account (up to 1,000) from the Auth server;
6. then, on Solo riders, signed the photo links.

On a full load or after a save (`router.refresh()`), the admin layout made its own `getUser()` and `profiles` calls as well. There was no loading state, so a click showed nothing until the whole page was back. Every judge tap, commentary update and admin save paid steps 1 to 3 too (`verifyRoleRequest`, `verifyAdminRequest`).

**After:**

- **The session is checked locally.** The project signs session tokens with an asymmetric key (ES256, one P-256 key in its published key set), so `getClaims()` checks the token's signature on the server itself, against a copy of the public key the library keeps for 10 minutes. No call to the Auth server. This is in the four session checks only: the proxy, `getAdminAccess`, `verifyAdminRequest` and `getSessionRole` (the last three share `getVerifiedSession` in `src/lib/admin/server.ts`). Who is asking still comes only from the verified token (`sub`); the role is still read from `profiles` under the caller's own session; the audit log records the same name and email as before. If the key is ever switched back to a shared secret (HS256), the library asks the Auth server by itself.
- **One check per request.** `getAdminAccess` is wrapped in React's `cache()`, so the layout and the page share one check and one `profiles` read.
- **An instant loading state.** `src/app/admin/loading.tsx` shows the page heading's outline and three muted bars (no words or numbers) the moment a menu item is clicked, while the menu stays put.
- **The account listing starts with the page's reads.** On Solo riders and Audit log the listing no longer waits for the rows to arrive; it runs alongside them. Results are the same (`loadSoloHeadshots` is now `loadAuthUserIndex` + `matchSoloHeadshots`).
- **Unchanged on purpose:** saves still refresh the page from the database (`router.refresh()`), so several desks stay in step; it now costs one `profiles` read plus the page's reads instead of three calls to the Auth server first. Every other `getUser()` in the site (account pages, registration, sign-in callbacks, the browser) is as it was.

### Results

**Before, on the live site** (Supabase gateway logs, server-side calls, the 24 hours to 6 Nov 2026 22:50 PT):

| Call | Calls in 24 h | Average | 90th percentile |
| --- | --- | --- | --- |
| `/auth/v1/user` (each `getUser()`) | 67,452 | 78 ms | 122 ms |
| `/rest/v1/profiles` (the role read) | 27,199 | 116 ms | 150 ms |
| `/rest/v1/solo_registrations` | 526 | 171 ms | 299 ms |
| `/rest/v1/scoring_live_state` | 466 | 187 ms | 304 ms |

- About **2.5 Auth checks for every role read**, and the role read only starts after them.
- The site's functions reach Supabase from Ashburn, Virginia (Vercel `iad1`), while the database is in Oregon (AWS us-west-2): every call crosses the country.
- A polling staff panel shows the same three steps every 3 seconds: `/auth/v1/user` from the proxy, `/auth/v1/user` again from the route, then `profiles`.

So a Solo riders click waited on roughly 78 + 78 + 116 ms (two Auth checks and the role read, on average) before its own reads even started, then the riders (171 ms), the account listing and the photo links, one after another.

**Calls that must finish one after another**, on the server, before a menu click's page can come back (signed in, session still fresh), read from the code:

| Page | Before | After | Calls to the Auth server first |
| --- | --- | --- | --- |
| Solo riders | 6 (Auth, Auth, role, riders, accounts, photo links) | 3 (role, riders and accounts together, photo links) | 2 → **0** |
| Audit log | 5 (Auth, Auth, role, entries, accounts) | 2 (role, entries and accounts together) | 2 → **0** |
| Teams | 4 (Auth, Auth, role, teams) | 2 (role, teams) | 2 → **0** |
| Overview | 5 (Auth, Auth, role, counts, actor names) | 3 (role, counts, actor names) | 2 → **0** |
| Check-in, Staff | 3 (Auth, Auth, role), then their own data request: 4 more | 1 (role), then their own data request: 2 more | 4 → **0** |
| A judge's tap, a staff panel's poll, a dashboard save | 3 before the work (Auth, Auth, role) | 1 before the work (role) | 2 → **0** |

**After (expected; to be confirmed from the same gateway query after deploy):** per admin click, the proxy checks the token locally (no call), the page makes one `profiles` read, then its own data. Server-side `/auth/v1/user` calls should fall to just those made by the account pages, registration and sign-in, which still use `getUser()`, `profiles` calls should roughly halve on full loads and refreshes (the layout and page now share one).

A full load or `router.refresh()` also drops the layout's duplicate `getUser()` and `profiles` calls (they ran alongside the page's, so they cost load rather than waiting). An expired session (about once an hour) still costs one refresh call, before and after. The local check needs the public key once per server instance every 10 minutes.

| Measurement | Result |
| --- | --- |
| One local ES256 signature check (what `getClaims()` does with the key in hand) | **0.18 ms** (median of 50) |
| One `getUser()` on the live site | **78 ms** average, 122 ms 90th percentile (gateway logs above) |

### How it was measured

- **The "before" figures** are Supabase's gateway logs (`edge_logs`) for the project, server-side calls only (Node user agent), the 24 hours to 6 Nov 2026 22:50 PT; "Average" and "90th percentile" are the time Supabase took to answer each call. The calling region comes from the same logs.
- **The call counts are read from the code**, following one admin menu click through `src/proxy.ts`, the admin layout, `getAdminAccess` and each page (`AdminDashboardSection.tsx`, `page.tsx`), before and after the change. `src/app/admin/admin-speed.test.mts` checks the "after" shape so it cannot quietly come back.
- **The signature check** was timed in Node on the development laptop with a freshly made P-256 key and the same Web Crypto calls the library uses (import the key, verify the signature), median of 50 runs after one warm-up. The project's published key set holds one EC key (ES256, P-256).
- **Not measured on the dev server:** it compiles pages as they are visited, so timing clicks on it says nothing about the live site.
- **To confirm after deploy:** run the same gateway query over the 24 hours after the deploy and compare the four rows above.

### Tried and dropped

**Caching each administrator's role between requests** (no `profiles` read per click). Dropped before it was built: a role taken away must stop working on the very next click, and several desks rely on seeing each other's saves at once.

## Admin pages load only the data they show (1 Nov 2026)

**Commit:** `3804ad2` · **File:** `src/app/admin/AdminDashboardSection.tsx`

**Before:** every admin section page (Solo riders, Teams, Check-in, Staff, Audit log) ran the same six reads on every visit: all solo registrations, all teams, all team riders, the last 200 audit entries, up to 500 archived audit entries, and up to 1,000 user accounts. That happened even on pages that use none of it.

**After:** each page reads only what it shows.

| Page | Reads now |
| --- | --- |
| Solo riders | Solo registrations |
| Teams | Teams and their riders |
| Audit log | Audit log, archive, and the account list (to put names to the actors) |
| Check-in | Nothing extra (fetches its own data through `/api/admin/check-in`) |
| Staff | Nothing extra (fetches its own data through `/api/admin/users`) |

Data is still read fresh on every visit and after every save, so several desks and devices stay in step as before.

### Results

| Page | Before | After | Load time | Data |
| --- | --- | --- | --- | --- |
| Solo riders | 252 ms, 84.1 KB | 91 ms, 11.0 KB | **64% faster** | **87% less** |
| Teams | 252 ms, 84.1 KB | 83 ms, 0.0 KB | **67% faster** | **100% less** |
| Audit log | 252 ms, 84.1 KB | 167 ms, 73.1 KB | **34% faster** | 13% less |
| Check-in | 252 ms, 84.1 KB | none | **no extra load** | **100% less** |
| Staff | 252 ms, 84.1 KB | none | **no extra load** | **100% less** |

### How it was measured

- The same reads the page makes, run against the live Supabase database from a laptop, **median of 9 runs** after one warm-up. "Data" is the size of the rows returned (JSON).
- The data on the day: 18 solo riders, 0 teams, 12 audit entries, 10 archived entries, 65 accounts.
- The time is the page's **data-loading step**, not the whole page appearing on screen. On the live site the server sits closer to the database, so both numbers are lower there, but the proportions hold.
- The old way loaded everything on every page, so its cost grows with every registration, team and audit entry. The gap widens as the event approaches.

### Tried and dropped

**Skipping the Supabase session refresh for signed-out visitors** (`src/lib/supabase/middleware.ts`). Measured with fake requests and a counted `fetch`, the old code already made **no** network call when there was no login cookie, because the Supabase client skips it by itself. The change gave no gain, so it was not kept.
