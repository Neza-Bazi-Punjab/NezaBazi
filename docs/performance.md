# Performance notes

A record of speed work on the site: what changed, how it was measured, and the results, so later changes can be compared against it.

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
