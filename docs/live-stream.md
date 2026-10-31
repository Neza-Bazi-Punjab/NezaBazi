# Live Stream: Data Feed, Bridge Script and Overlays

**For the graphics team, send [vmix-data-feed.md](vmix-data-feed.md), or its printed form, the PDF at `https://www.nezabazipunjab.com/documents/vmix-guide.pdf`.** It is the self-contained handout: the four feed addresses, every column, the rehearsal mode, how to set them up in vMix and an event-day checklist.

This file is the fuller version for whoever supports the stream on our side, plus (in section 4) the steps for applying the database migrations. The same setup steps are on the site at [/overlay](https://www.nezabazipunjab.com/overlay) ("Live data feed & overlays"), in the same order as here: data feed first, the bridge script second, the optional ready-made overlays third, OBS last.

Everything here is **public and needs no login**: vMix and OBS cannot sign in, so the feeds and overlays carry only what is announced over the PA anyway — rider name, horse, team, district and state, pools, results and standings. Parents' names, ages, phone numbers and emails never appear on a stream surface; they are read only by the staff-only commentary panel.

How fresh is it? Judges record a result on `/judge` and the database commits it. Every open overlay and `/live` hears about it through Supabase Realtime and fetches the new state **within about a second**. The refetch carries `?v=<commit timestamp>`, so it is never answered with the edge's copy from before the write, and every viewer of the same change shares one fresh copy. If Realtime is blocked or drops, the pages poll every 4 seconds instead. The vMix data feeds and the bridge script always poll; at a 1–2 second refresh they follow within a second or two.

## Quick reference

| What | Address |
| --- | --- |
| Handout for the graphics team (PDF, A4) | `https://www.nezabazipunjab.com/documents/vmix-guide.pdf` |
| Setup page (instructions and links) | `https://www.nezabazipunjab.com/overlay` |
| Data feed: rider on course (one row) | `https://www.nezabazipunjab.com/api/live/vmix/current` |
| Data feed: standings (one row per entrant) | `https://www.nezabazipunjab.com/api/live/vmix/leaderboard` (`?pool=A`, `?limit=10`) |
| Data feed: start list with progress | `https://www.nezabazipunjab.com/api/live/vmix/entrants` (`?round=<round_id>`) |
| Data feed: every round | `https://www.nezabazipunjab.com/api/live/vmix/rounds` |
| Full JSON state (Singular, CasparCG, your own graphics) | `https://www.nezabazipunjab.com/api/live/state` |
| Overlays (optional) | `https://www.nezabazipunjab.com/overlay/scorebug`, `/lower-third`, `/leaderboard` (`?pool=A`, `?all=1`), `/ticker`, `/pool-call` |
| Public scoreboard (to check from a phone) | `https://www.nezabazipunjab.com/live` |

The handout PDF is `public/documents/vmix-guide.pdf`, linked from the `/overlay` page and as **vMix guide** on the **PDF guides** page (`/admin/guides`) in the admin menu. It is built from [vmix-data-feed.md](vmix-data-feed.md) by `npm run build:guide` (which rebuilds the staff guide too), so edit the Markdown, rebuild, and commit both; never edit the PDF by hand.

Every data feed also takes `?format=csv` (CSV with a header row instead of JSON), `?sample=1` (frozen rehearsal data) and `?sample=solo` (moving rehearsal data, below). The `/api/live/...` endpoints are cached at the edge for one second, and may be served up to four seconds old while the cache refreshes, so thousands of viewers cost the database about one read a second. Polling faster than once a second gains nothing.

## 1. The data feed (vMix Data Sources)

This is what the graphics team builds its own titles on. The four feeds, their options and every column, with a one-line meaning each, are in [vmix-data-feed.md](vmix-data-feed.md). The column lists themselves live in `src/lib/scoring/vmix-columns.ts`, which the `/overlay` page also reads, so the page can never document a column the feeds do not send.

In vMix: **Settings → Data Sources → Add → JSON** (or **CSV**), paste the address, refresh every **1–2 seconds**, then bind GT title fields to columns in the **GT Title Designer**. For the feeds with many rows, the Data Source row controls on the title input step through them.

Things worth knowing:

- **Every column is present on every response**, as an empty string or `0` rather than missing or null, because a vMix binding breaks when a key disappears. With nothing to show — scoring not set up yet, no live round, a `?pool=` or `?round=` that does not exist — a feed returns one row of empty values.
- **On a server error the feeds answer HTTP 503** rather than a row of blanks, and vMix keeps showing the last good values, which is better on air than blanking every title.
- **The feeds are not filtered by the screens' mode.** The current feed carries `display_mode` and `message`; honouring them is up to the titles (section 3c and the handout).
- CSV follows RFC 4180: values containing a comma, quote or line break are quoted, quotes doubled, lines end in CRLF.
- `last_rider_name`, `last_result` and the other `last_*` columns are the most recently recorded result in **any** round. `pool_label` in the current feed is the pool *called* to the start, which "Call Pool C" sets ahead of the riding.

**Rehearsal with `?sample=1`.** The live feeds stay empty until event day, so every feed answers `?sample=1` with fixed rehearsal data from `src/lib/scoring/vmix-sample.ts`, without reading the database. That data is a live Single qualification in Pools A and B (Pool A finished, Pool B on its second pass with a rider on course, the message "Sample data for rehearsal — not real results"), and a completed Section round with two teams of four. Every sample row has `sample` = `Yes` (live rows have `No`), so a title can show a SAMPLE badge. The sample round ids are fixed: the qualification is `5a3b1e00-0000-4000-8000-000000000001` and the Section round `5a3b1e00-0000-4000-8000-000000000002`, for `entrants?sample=1&round=…`. `/api/live/state` has no sample mode.

**Moving rehearsal with `?sample=solo`.** `?sample=1` never changes, so the graphics team cannot see how a title behaves when results come in. While the rehearsal feed is running, `?sample=solo` plays a scripted Single qualification on a loop instead, built in `src/lib/scoring/vmix-sample-live.ts`. There is one step every 8 seconds and 29 steps a loop, about four minutes. The script covers calling Pools A and B, results with carries skipping later attempts, a changed result, an undone result, a skipped run, and the screens going to the standings, a message and blank. Each step is a call on the training engine (`sample-engine.ts`, the database functions in TypeScript), so the rules are the real ones. The step is worked out from the clock, and the engine is replayed from a fresh seed on every request. Nothing is stored, every server instance and viewer sees the same moment, and timestamps are real times. The riders are the invented ones of `?sample=1`, and every row has `sample` = `Yes`. The bridge script reads it with `--moving-sample`. The name leaves room for a team (Section) loop later, as `?sample=team`.

> **Start and stop it from `/admin/scoring`**, on the **Graphics Rehearsal Feed** card under the rider list: **Start** or **Stop**, then confirm. It is **stopped by default**, and the card shows who last changed it and when. Each change is in the audit log as "Start Rehearsal Feed" or "Stop Rehearsal Feed". While it is stopped, `?sample=solo` answers exactly like `?sample=1`: frozen, still `sample` = `Yes`. A change reaches the feeds within a second or two. Each server reads the switch at most once a second, through the public key, from `scoring_rehearsal`, which shows the public the switch but never who changed it. The `/overlay` page shows "Moving sample right now: On / Off" (at most ten seconds old when the page is opened; refresh to check again).
>
> **It is safe to leave running**, on event day too. It changes only addresses with `?sample=solo`; real scores, `/live`, the overlays, the judges' and commentators' panels and the real feeds never change. The thing to watch is a `?sample=solo` address left on a Data Source while on air, which the SAMPLE badge and the event-day checklist cover. Stopping it on the day is an extra safeguard, not a requirement.
>
> The card needs the sixth migration, `20261028120000_scoring_rehearsal_feed.sql` (section 5). Until it is applied the card says "Not set up yet" and `?sample=solo` stays frozen.

**Rider list for name straps.** Separately from the public feeds, an administrator can download every registered rider from `/admin/scoring` → **Download rider list (CSV)** (`GET /api/admin/scoring/export`, administrators only; `?format=json` for JSON). Its columns are `source`, `full_name`, `team_name`, `is_leader`, `horse_name`, `horse_breed`, `horse_age`, `location_short`, `years_experience`, `checked_in`, `pool_label` and `round_name` (the pool and round of the latest start list that includes them). It deliberately carries no phone, email, age, parents' names emergency contact, full address or confirmation code (the code is the rider's check-in credential and never leaves the organisers); `location_short` is the district and state the announcer uses. Share it with the graphics team only.

## 2. The bridge script

`scripts/vmix-bridge.mjs` reads the current feed every second and pushes each value that changed into a vMix title through vMix's own HTTP API (`SetText`). It is one file with no dependencies.

Use it instead of a Data Source when you already have a title and would rather name its fields on the command line than bind them one by one, when you want to drive several titles from the same feed (run one bridge per title), or when you want vMix touched only when a value actually changes. It handles the one-row current feed only; use Data Sources for the others.

What you need:

- **Node.js 24** on the computer that runs it (nodejs.org). No `npm install`: copy `scripts/vmix-bridge.mjs` anywhere and run it.
- The computer must reach the website over the internet and vMix's HTTP API. Running it on the vMix computer itself is simplest (the default address `http://127.0.0.1:8088`). From another computer, vMix's Web Controller has to be switched on (**Settings → Web Controller**) and port 8088 allowed through the Windows firewall; pass `--vmix http://<vmix-computer>:8088`.
- A GT title with a text field for each value. Name the fields after the columns (`rider_name`, `team_name` …) or keep your own names and use `--map`.

Worked example — a title input called "Scorebug" with fields `Name`, `Team`, `Round`, `Pool` and `Result`:

```bash
# 1. See every column and its current value, and the exact URL that would be called. Sends nothing.
node scripts/vmix-bridge.mjs --input "Scorebug" --dry-run --once
#    The same with rehearsal values (before event day the live feed is empty):
node scripts/vmix-bridge.mjs --input "Scorebug" --dry-run --once --sample

# 2. Run it for the day.
node scripts/vmix-bridge.mjs --input "Scorebug" \
  --only rider_name,team_name,round_name,pool_label,last_result \
  --map rider_name=Name --map team_name=Team --map round_name=Round \
  --map pool_label=Pool --map last_result=Result
```

On Windows `cmd`, put it on one line (the `\` line breaks are for bash). Each change prints one line with a timestamp:

```text
2026-11-11 10:42:07.311  rider_name -> Name.Text = "Harpreet Singh"
2026-11-11 10:42:07.318  team_name -> Team.Text = ""
2026-11-11 10:43:55.902  last_result -> Result.Text = "Carried"
```

Each change is sent as `GET http://127.0.0.1:8088/API/?Function=SetText&Input=Scorebug&SelectedName=Name.Text&Value=Harpreet%20Singh`.

| Option | Meaning |
| --- | --- |
| `--input <name or number>` | The vMix title input to update. Required. |
| `--site <url>` | Website to read. Default `https://www.nezabazipunjab.com`. |
| `--vmix <url>` | vMix HTTP API. Default `http://127.0.0.1:8088`. |
| `--interval <ms>` | How often to read the feed. Default 1000, minimum 200. |
| `--map key=Field` | Send column `key` to title field `Field`. Repeatable. `.Text` is added unless the name already ends in it. A column without `--map` goes to the field of the same name. |
| `--only key1,key2` | Send only these columns. Recommended — list the fields your title actually has. |
| `--sample` | Read the rehearsal data (`?sample=1`) instead of the live feed. |
| `--once` | One pass, then exit. |
| `--dry-run` | Print what would be sent instead of contacting vMix. |
| `--help` | All of the above. |

How it behaves:

- The first pass sends every selected value; after that only values that changed.
- If the website cannot be read (internet down, or HTTP 503), vMix keeps what it shows and the bridge retries with exponential backoff — 2 s, 4 s, 8 s, then every 10 s at the default interval — logging each attempt, and says so when the site answers again.
- If vMix cannot be reached, the same backoff; when it answers again the bridge sends **every** value again, because vMix may have restarted with the title at its defaults.
- If vMix refuses one field (usually a field name the title does not have, or a wrong `--input`), that is logged once and retried quietly on later passes; the other fields carry on.
- It never crashes on a network problem. It exits with an error only on bad arguments (exit code 2). `--once` always exits 0, even when the pass failed — read the log line.
- **Ctrl+C** stops it cleanly. To push every value afresh at any time (for example after reloading the title), stop it and start it again.

It was tested against a local stand-in for the website and for vMix: first pass, change detection, awkward characters and Gurmukhi in values, site outage and recovery, vMix outage and full resend, a refused field, Ctrl+C, bad arguments and `--sample`. It has not yet been run against a real vMix.

## 3. Ready-made overlays (optional)

Finished graphics in the website's style, for a team that would rather not build its own titles. Each overlay is a web page with a transparent background, designed for 1920×1080 and legible at 1280×720.

### 3a. In vMix (Web Browser inputs)

1. **Add Input → More → Web Browser.**
2. Paste one overlay URL from the quick reference.
3. Set **Width** `1920` and **Height** `1080`, then OK.
4. Nothing to do for keying: the page background is transparent, so vMix keys it automatically.
5. Put the input on an **Overlay channel (1–4)** with the overlay buttons on the input. Do not cut to it as a main input.
6. Make **one input per overlay** — scorebug, lower third, leaderboard, ticker, pool call-up — so each can be switched on and off on its own. They are laid out not to overlap: the scorebug sits top-left, the lower third bottom-left above the ticker, the ticker along the bottom, the leaderboard and the pool call-up card in the centre. Each steps aside for the others as the screens' mode changes (section 3c).
7. **Leave the pool call-up overlay on all day.** It is empty and transparent except while a pool is being called, when it shows "Pool B — get ready" with the pool's riders.
8. The **leaderboard** follows the pool of the rider on course. Add `?pool=A` to pin one pool (a pool letter that is not in the round is ignored and it follows the riding pool again), or `?all=1` for the whole round. It shows ten rows a page and cycles pages every eight seconds.
9. If an input ever shows old information, right-click it and choose **Reload**.

Each Web Browser input is a small embedded browser that uses CPU and keeps its own connection open, so only add the overlays you will use.

What each overlay shows in the normal (scoreboard) mode:

- **Scorebug** — top-left: round and pool, the rider on course in large capitals, their team or horse, and a "Now: Pool B · Next: Pool C" tab. When a result is recorded, that rider and a Carried 4 / Struck 2 / Miss 0 chip show for four seconds before it moves on. With a round live but nobody on course yet, it says "Next rider coming up".
- **Lower third** — bottom-left: the rider's name, then team or horse, district and state (never the village), and the attempt when the round has more than one. It slides in each time a new rider comes on course.
- **Leaderboard** — centred standings table as described above.
- **Ticker** — bottom strip cycling the current round's last eight results ("Harpreet Singh — Carried 4 · Pool B") and the announcement message, six seconds each. The list comes from the server, so a reloaded ticker shows the same list as any other, and an undone result drops out at the next update. A new result jumps it back to the start.
- **Pool call-up** — the large "Pool B — get ready" card with the riders in two columns (three when the pool is large or lists team riders) and "Next: Pool C" at the foot.

**Embedding in an iframe is blocked on purpose.** The whole site sends `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` (see `next.config.ts`), so no other website can frame any page of ours. That is what stops a hostile page from laying invisible admin or judge buttons over its own ("clickjacking"). vMix Web Browser inputs and OBS browser sources load the overlay as a top-level page, not inside an iframe, so they are unaffected. A cloud graphics tool that composes web pages inside its own iframe cannot show the overlays; point it at the data feeds instead.

### 3b. OBS Studio (and anything else with a browser source)

In the scene, under **Sources**, press **+** and choose **Browser**; paste an overlay URL; Width `1920`, Height `1080`; untick **Shutdown source when not visible** so the overlay keeps its connection while you switch scenes; clear the **Custom CSS** box completely; OK. Stack several overlays in one scene. To reload a stale source, open its properties and press **Refresh cache of current page**. OBS has no built-in data source for the feeds, so use the overlays. Streamlabs, Wirecast and any other software with a "browser" or "web page" source work the same way: the overlay URL, 1920×1080, no custom CSS.

### 3c. What the screens' mode does

Judges and administrators choose what every screen shows from the **Screens** card on `/admin/scoring` or the **Screens** sheet on `/judge`. The panels label the six modes Scoreboard, Standings (`leaderboard`), Rider, Pool call-up, Message only and Blank; the commentary panel's header shows the current one ("Screens: …", where it calls them Leaderboard and Hidden). The same card or sheet sets the announcement message (up to 200 characters). On `/admin/scoring` the mode and message apply at once and the active mode reads "On screen now"; on `/judge` each change asks for confirmation. Calling a pool switches to Pool call-up, and the first result recorded switches back to Scoreboard (the judges' panel also has **Show scoreboard now**). **Clear Live Round** (on `/admin/scoring`, with confirmation) leaves nothing live, without touching results or start lists.

| Mode | Scorebug | Lower third | Leaderboard overlay | Ticker | Pool call-up | `/live` |
| --- | --- | --- | --- | --- | --- | --- |
| Scoreboard | Rider, result flash, Now/Next | Rider, Now/Next | Standings | Results and message | Nothing | Normal layout |
| Standings (`leaderboard`) | Nothing | Nothing | Standings | Unchanged | Nothing | Standings first, above the rider card |
| Rider | As Scoreboard | As Scoreboard | Nothing | Unchanged | Nothing | The rider card alone; last result and up next hidden; standings behind **Show standings and pools** |
| Pool call-up | Only the Now/Next line | Only the Now/Next line | Nothing | Unchanged | "Pool B — get ready" card | The call-up card in place of the rider card |
| Message only | Message bar only | Message bar only | Message bar only | Message bar only | Message bar only | Normal layout |
| Blank | Nothing | Nothing | Nothing | Nothing | Nothing | Normal layout |

`/live` shows the message at the top in every mode. Every overlay draws the message bar in the same place, so stacking several in message mode shows one bar; in message mode with no message text the overlays are empty. The data feeds are not filtered by mode; they report it.

## 4. Troubleshooting

**An overlay is blank.** In order of likelihood:

1. No round is live. With no live round the overlays draw nothing, on purpose. (With a round live but nobody on course yet, the scorebug shows the round and "Next rider coming up", and the ticker stays empty until the first result.) Open `/live` on a phone to see what is live.
2. The screens are set to **Blank**, or **Message only** with no text, or the mode hides that particular overlay (see the table above). The header of `/admin/scoring` and of the commentary panel shows the current mode.
3. Live scoring is not set up yet. `/live` then says "Live scoring begins on November 11, 2026" and `/api/live/state` answers `"configured": false`. See section 5.
4. The input itself: open the same URL in an ordinary browser tab on the vMix computer. If it shows content there, recheck the input's size (1920×1080) and overlay channel; if the browser cannot load it, it is the network.

**The data is stale.** Right-click the input → **Reload** (OBS: Refresh cache of current page); for a Data Source, check its refresh interval. If everything is stale, compare with `/live` on a phone. `/live` current but vMix stale → the vMix computer's network. `/live` stale too → ask the judges whether results are being recorded; the site may be down.

**Realtime versus polling.** The staff panels and `/live` show a small badge: **Live** (Realtime connected: each change is fetched within about a second), **Updating** (Realtime not connected, polling every 4 seconds), **Offline** (the last request failed; showing the last good data and retrying). The overlays have no badge but behave the same way. Realtime needs a WebSocket from the browser to the Supabase project; if the venue network blocks WebSockets, everything still works by polling, just up to 4 seconds behind. Even with Realtime connected, everything also polls every 20 seconds as a safety net, and refetches when the window becomes visible again or the network comes back.

**A Data Source keeps old values.** The endpoint is answering HTTP 503 (a server problem) and vMix is holding the last good row; it recovers by itself at the next good answer. Open the URL in a browser to see the error. A `404` means the address is wrong, or the site has not been deployed with live scoring yet.

**A feed or the leaderboard is empty.** The round has no start list yet, or `?pool=` / `?round=` names something that does not exist (the leaderboard overlay then follows the riding pool; the feeds return one empty row). Try the same address with `?sample=1` to check the bindings.

**The bridge logs "vMix answered HTTP …" for a field.** The title has no field of that name, or `--input` does not match the input's name or number. Fix it and restart the bridge.

## 5. For the administrator: applying the migrations

The live Supabase project is not connected to development sessions, so these files are applied by hand. Until they are, every live scoring page shows a calm "not set up yet" state rather than an error, but registration (see below) is a different matter.

**Where:** Supabase dashboard → **SQL Editor** → **New query**. Paste the **whole file**, press **Run**, and wait for "Success". One file per run, in this order:

1. `supabase/migrations/20261025100000_rider_parent_names.sql`
2. `supabase/migrations/20261025110000_staff_roles.sql`
3. `supabase/migrations/20261025120000_live_scoring.sql`
4. `supabase/migrations/20261025130000_paper_registrations.sql`
5. `supabase/migrations/20261026100000_scoring_short_location.sql`
6. `supabase/migrations/20261028120000_scoring_rehearsal_feed.sql`: the Graphics Rehearsal Feed switch. Any time after the live scoring file; until it is applied, the card on `/admin/scoring` says "Not set up yet". Check with `select * from public.scoring_rehearsal;`: one row, `solo_sample_enabled` = `false`.

**Each file is idempotent**: running it a second time changes nothing. Each one checks its own preconditions first and stops with a plain-English error if the database is not the shape it expects (for example, the live scoring file refuses to run before the staff roles file, the paper file refuses to run before the parents' names file, and the short location file refuses to run before the live scoring file). The parents' names, paper and short location files also check their own results at the end and fail rather than report success over a partial change; for the staff roles and live scoring files, that is what the verification queries below are for. If a run fails, read the message, fix the cause, and run the same file again.

**The code must not go live before `20261025100000_rider_parent_names.sql` is applied.** The new solo form, the team submit route and `/account` read and write `father_name` and `mother_name`; against a database without those columns, registration and the account page fail. Safest order: apply all five files, then deploy. If that is not possible, apply the first file before the deploy and the rest straight after; in the gap:

- assigning the judge or commentator role on the Staff page fails with "Invalid profile role." until `20261025110000` is applied;
- `/live`, the overlays, the data feeds, `/judge`, `/commentary` and `/admin/scoring` show "Live scoring is not set up yet" (or empty rows) until `20261025120000` is applied, and writes answer 503;
- `/admin/paper` answers "Paper entry is not set up yet" until `20261025130000` is applied.

**The fifth file can be applied any time after `20261025120000_live_scoring.sql`** (before or after the paper file, before or after the deploy). It makes each run's location snapshot district and state only ("Amritsar, Punjab", not "Rehearsal Village, Amritsar, Punjab, India"), and shortens any run already drawn. Until it is applied, every public API response (scoreboard, overlays, data feeds) still shortens the location, but the raw `scoring_runs` table, the `scoring_leaderboard` view and the realtime events, all of which anyone holding the public key can read, carry the rider's full registered address. Apply it before any start list is drawn, rehearsal included: runs drawn earlier are shortened when it runs, but realtime will already have sent their full address to any browser that was open. If `20261025120000_live_scoring.sql` is ever run again, run the fifth file again after it: re-running the live scoring file puts back the original insert trigger, which stores the full address.

Every file ends with `notify pgrst, 'reload schema'`, so the API sees the new columns and functions at once.

### Verification queries

Run these afterwards in the SQL editor; the expected result is under each one.

**Parents' names (20261025100000)**

```sql
-- Both columns on both tables, nullable, with their length checks.
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('solo_registrations', 'team_members')
  and column_name in ('father_name', 'mother_name')
order by table_name, column_name;
--   4 rows, is_nullable = YES

select conrelid::regclass as table_name, conname
from pg_constraint
where conname in (
  'solo_registrations_father_name_length', 'solo_registrations_mother_name_length',
  'team_members_father_name_length', 'team_members_mother_name_length'
);
--   4 rows

-- Riders can read, insert and update them (the column grants).
select t.table_name, c.column_name,
       has_column_privilege('authenticated', 'public.' || t.table_name, c.column_name, 'SELECT') as can_select,
       has_column_privilege('authenticated', 'public.' || t.table_name, c.column_name, 'INSERT') as can_insert,
       has_column_privilege('authenticated', 'public.' || t.table_name, c.column_name, 'UPDATE') as can_update
from (values ('solo_registrations'), ('team_members')) as t(table_name)
cross join (values ('father_name'), ('mother_name')) as c(column_name);
--   4 rows, t | t | t

-- The check-in lookup returns them and is service-role only.
select 'father_name' = any(proargnames) as father,
       'mother_name' = any(proargnames) as mother,
       has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as authenticated,
       has_function_privilege('service_role', oid, 'execute') as service_role
from pg_proc
where oid = 'public.admin_find_rider_by_code(text)'::regprocedure;
--   t | t | f | f | t

-- Admin edits write them.
select position('father_name' in pg_get_functiondef(
  'public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)'::regprocedure
)) > 0 as patched;
--   t
```

**Staff roles (20261025110000)**

```sql
-- The one role CHECK, allowing exactly the four roles.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';
--   profiles_role_check | CHECK ((role = ANY (ARRAY['player'::text, 'judge'::text, 'commentator'::text, 'admin'::text])))

-- has_role is security definer, executable by authenticated only.
select p.prosecdef,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p where p.oid = 'public.has_role(text[])'::regprocedure;
--   t | f | t

-- admin_set_profile_role is service-role only.
select has_function_privilege(
  'authenticated',
  'public.admin_set_profile_role(uuid, text, text, uuid, text, text)'::regprocedure,
  'execute'
);
--   f

-- The read-only staff headshot policy exists.
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'Staff read every headshot';
--   Staff read every headshot | SELECT
```

**Live scoring (20261025120000)** — from the comment block at the end of the migration, plus a check for the auto-void column.

```sql
-- 25 scoring functions: 14 callable by the server, 9 internal helpers, 2 trigger functions.
select count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'scoring\_%';
--   25 (26 once 20261026100000 is applied: it adds the helper scoring_short_location)

-- No scoring function is executable by a client role.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'scoring\_%'
order by p.proname;
--   anon = f and authenticated = f on every row; service_role = t on every row
--   (the two trigger functions included: Supabase's default privileges grant it, which is
--   harmless — service_role already owns every write path, and Postgres refuses to call
--   a trigger function directly)

-- A carry in a multi-attempt Single round records which run voided the rider's other attempts.
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'scoring_runs' and column_name = 'auto_voided_by';
--   auto_voided_by | YES

-- RLS on all four tables, one SELECT policy each and nothing else.
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'scoring\_%' and c.relkind = 'r';
--   4 rows, all t
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename like 'scoring\_%';
--   4 rows, all SELECT to {anon,authenticated}

-- Clients can read and nothing more.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'scoring\_%'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee;
--   only SELECT rows (scoring_advance_overrides is granted by column, so it shows up in
--   information_schema.column_privileges instead: round_id, entrant_key, advanced, updated_at)

-- The view runs with the caller's privileges.
select c.relname, c.reloptions
from pg_class c where c.oid = 'public.scoring_leaderboard'::regclass;
--   {security_invoker=true}

-- Realtime membership.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename like 'scoring\_%'
order by tablename;
--   scoring_live_state, scoring_rounds, scoring_runs

-- The single live-state row exists.
select count(*) from public.scoring_live_state;
--   1
```

**Paper registrations (20261025130000)**

```sql
-- Where a registration came from, on both entry tables.
select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('solo_registrations', 'teams')
  and column_name in ('registration_source', 'entered_by')
order by table_name, column_name;
--   4 rows: entered_by YES (no default); registration_source NO, default 'online'::text

-- A paper rider needs no account.
select attrelid::regclass as table_name, attname, attnotnull
from pg_attribute
where (attrelid = 'public.solo_registrations'::regclass and attname = 'profile_id')
   or (attrelid = 'public.teams'::regclass and attname = 'leader_profile_id');
--   2 rows, attnotnull = f

-- Browsers cannot set where a row came from.
select tgrelid::regclass as table_name, tgname
from pg_trigger
where tgname = 'lock_registration_source' and not tgisinternal;
--   2 rows: solo_registrations, teams

-- Paper entry and its helpers are service-role only.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname = 'admin_create_paper_registration' or p.proname like 'paper\_registration\_%')
order by p.proname;
--   6 rows, f | f | t

-- Signed-in users can still read whole rows (select * would fail without this).
select has_column_privilege('authenticated', 'public.teams', 'registration_source', 'SELECT') as teams,
       has_column_privilege('authenticated', 'public.solo_registrations', 'registration_source', 'SELECT') as solo;
--   t | t
```

**Short location (20261026100000)** — from the comment block at the end of the migration.

```sql
-- The helper: immutable, strict, empty search_path, service-role only.
select p.provolatile, p.proisstrict, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p where p.oid = 'public.scoring_short_location(text)'::regprocedure;
--   i | t | {search_path=""} | f | f | t

-- It agrees with shortLocation in src/lib/scoring/types.ts.
select public.scoring_short_location('Rehearsal Village, Amritsar, Punjab, India') as four_parts,
       public.scoring_short_location('Amritsar, Punjab') as two_parts,
       public.scoring_short_location(' Amritsar ') as one_part,
       public.scoring_short_location(',,') as only_commas,
       public.scoring_short_location('') as blank;
--   Amritsar, Punjab | Amritsar, Punjab | Amritsar | null | null

-- The insert trigger stores the short form.
select position(
  'new.rider_location := public.scoring_short_location(' in
  pg_get_functiondef('public.scoring_runs_before_insert()'::regprocedure)
) > 0 as patched;
--   t

-- No run holds more than district and state.
select count(*) from public.scoring_runs
where rider_location is distinct from public.scoring_short_location(rider_location);
--   0
```

### Checks only the real project can answer

Two things cannot be verified from the repository and have not been verified on the live project yet:

- **Realtime.** The publication query above shows the three tables are members, but whether anonymous visitors actually receive change events depends on the project's Realtime service. Test it: open `/live` on a phone, have an administrator create a throwaway round, draw it, set it live and record one result on `/judge`. The phone's badge should read **Live** and the result should appear within about a second. If it reads **Updating**, Realtime is not reaching the browser; everything still works by polling every 4 seconds. Delete the throwaway round afterwards (the forced delete removes its results; the audit log keeps the record).
- **The staff headshot policy.** Today the commentary panel signs headshot URLs on the server with the service role, so it does not depend on the "Staff read every headshot" policy at all; the policy exists so a staff member's own session could read headshots if a panel ever signs them in the browser. Its effect on the live bucket is untested.

A last smoke test after deploying: `https://www.nezabazipunjab.com/api/live/state` should answer `"configured": true`, `https://www.nezabazipunjab.com/api/live/vmix/current` an array with one row, and `https://www.nezabazipunjab.com/api/live/vmix/rounds?sample=1` two sample rounds.
