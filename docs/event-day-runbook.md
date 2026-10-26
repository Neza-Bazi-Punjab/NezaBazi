# Event-Day Runbook

Step-by-step instructions for the people running the championship on the site: organisers (administrators), judges and commentators. Short steps, in the order they happen. For the stream: the graphics team's handout is [vmix-data-feed.md](vmix-data-feed.md); the fuller setup (data feed, bridge script, overlays, OBS) is [live-stream.md](live-stream.md).

Everything an administrator, judge or commentator does on these pages is recorded in the admin audit log with their name, so mistakes can always be traced and put right.

**Before any of this:** the five database migrations must be applied and the site deployed. Section 5 of [live-stream.md](live-stream.md) has the order and the checks. Until then `/admin/scoring` says "Live scoring is not set up yet".

## Who can open what

| Page | Player | Judge | Commentator | Admin |
| --- | --- | --- | --- | --- |
| `/live` — public scoreboard | ✓ | ✓ | ✓ | ✓ |
| `/judge` — record results (phone) | | ✓ | | ✓ |
| `/commentary` — rider background for the announcer | | ✓ | ✓ | ✓ |
| `/admin`, `/admin/scoring`, `/admin/paper` | | | | ✓ |

Anyone else who opens a staff page sees a "Log in" or "Access denied" page. Roles are checked on the server for every action, not just when the page loads.

## 1. Give staff their roles (a few days before)

1. Each judge and commentator signs up on the site like any rider and confirms their email address.
2. An administrator opens `/admin` → **Profiles** tab → **Add Staff**.
3. Search by email or name, choose the **Role** (Judge, Commentator, or Admin for another organiser), and confirm.
4. To change someone later, use the **Role** dropdown in their row. Choosing **Player** removes their staff access.
5. Ask each of them to sign in and open their page (`/judge` or `/commentary`) on the device they will use on the day.

The last administrator cannot be given another role. If the role picker answers "Invalid profile role.", the staff roles migration has not been applied yet.

## 2. Paper entries (any time before check-in)

Some riders will not register online. They fill in a printed form and an administrator keys it in.

**Print the forms.** Open `/register/paper` and download the **Solo Rider Form** (one page) or the **Team Form** (two pages, team leader first). Both are A4, labelled in English and Punjabi, and can also be typed into on a computer. Handwriting is fine in either language; Punjabi typed into the fillable boxes will not display, so type in English or print and write by hand.

**Key one in.**

1. Open `/admin/paper` (or **Paper entry** in the admin dashboard's tab bar).
2. Choose **Solo rider** or **Team of 4**.
3. Type the fields in the order the sheet prints them. Father's and mother's names are optional, as they are online.
4. Watch the **Possible duplicate** box: while you type a phone number, name or email, the panel lists registrations that look like the same rider — someone who also registered online, or a form already keyed in. Check before saving.
5. **Email is optional.** Leave it blank if the rider has none. The database then stores a made-up address ending in `@paper.nezabazipunjab.com`; no email is ever sent to it, and the dashboard shows it as "No email (paper entry)".
6. Press **Save Registration** (or **Save Team**).
7. The next screen shows the **confirmation code** in large type (four codes for a team). Write it in the **Office use only** box on the paper form, with your name and the date. If the rider gave an email address, the code is also emailed to them; otherwise give it to them yourself — it is what they show at check-in.

The database refuses an entry when:

- the email or phone is already on another entry of the same kind (solo or team);
- the phone is already on an entry of the other kind under a different (or no) email — if it really is the same rider, give both entries the same email so they share one code;
- a team does not have exactly four riders.

The same rider may hold one solo entry and one team place under the same email: both share one confirmation code. Two administrators can key in forms at the same time; the database takes paper entries one at a time so the duplicate checks cannot be raced. Each paper entry appears in the audit log as "Paper Registration Entered".

**A paper rider without email can enter only one event.** If such a rider is already entered (solo or on a team) and also wants the other event, the second entry is refused: their phone number is already on the first entry, and a placeholder address cannot be shared to tie the two together. The rider needs a real email address on both entries: if they have one, put it on the first entry (edit it in the dashboard, as below) and key in the second form with the same address; then both entries share one code.

**Never add mail (MX) records for `paper.nezabazipunjab.com`.** The placeholder addresses are safe only because nobody can receive mail there. A rider's entries are linked to an account by a confirmed email address; if that domain could receive mail, someone could confirm a placeholder address and claim a paper rider's entry.

### When a paper rider later wants an account

- If the form carried their real email, they sign up with that same address and confirm it.
- If it did not, an administrator first edits their registration in the dashboard. For a paper entry without email the email box is empty (it reads "No email (paper entry)"): type their real address and save. Saving with the box still empty keeps the placeholder, and an address on `paper.nezabazipunjab.com` cannot be typed in by hand. Then they sign up with that address.
- Their confirmation code does not change.
- A **team** rider then sees their team on `/account`, matched by email like every team rider.
- A **solo** paper entry has no account attached, so it is claimed instead: when the rider signs in with the confirmed address that matches the entry, the entry is linked to their account (only a paper entry, only one nobody has claimed, and only if they have no solo entry already). It then shows on `/account`, and from then on their account details are copied onto it like any online rider's.

## 3. The day before: check-in

Check-in works as it always has: `/admin` → **Check-in** tab, type the rider's code (or search by name, email or phone), check the record, confirm. Paper riders check in the same way with the code from the office box. Only checked-in riders are drawn into the first rounds, and a team needs all four riders checked in.

## 4. Event day: running the rounds at `/admin/scoring`

Open `/admin/scoring` on a laptop. Its header shows the live round, the called pool and what the screens are showing, and has links to the judges' panel and the public scoreboard. Press **Refresh** at any time. Below it are the **Screens** card (section 4.9) and **Download rider list (CSV)**: every registered rider with team, horse, district and state, experience, check-in and current pool, for the graphics team's name straps. It carries no phone numbers, emails, ages, parents' names or emergency contacts, full addresses or confirmation codes — the code is the rider's check-in credential and never leaves the organisers. Still, give the file to the graphics team only.

### 4.1 Create the rounds (can be done the day before)

Press **New Round** and fill in:

- **Name** — what everyone will see, e.g. "Qualification".
- **Event** — Single Tent Pegging or Section Tent Pegging.
- **Round number** — 0 for the Single qualification, then 1, 2, 3 … Each number once per event.
- **Attempts per rider** — 3 for the Single qualification, 1 for every other round.
- **Target points** — Section rounds only: 8 in round 1, 12 in round 2, 16 (Full House) from round 3. Leave blank for Single rounds, where only a carried peg goes through.
- **Pool size** — about how many entrants per pool (riders for Single, teams for Section). The default is 10. Leave blank to ride the round as one list with no pools.
- **Sort order** — the order rounds are ridden in across the day. Each number once.

A typical day:

| Name | Event | Round number | Attempts | Target | Pool size |
| --- | --- | --- | --- | --- | --- |
| Qualification | Single | 0 | 3 | — | 10 |
| Aarhi Round 1 | Single | 1 | 1 | — | 10 |
| Aarhi Round 2, … Final | Single | 2, … | 1 | — | as needed |
| Section Round 1 | Section | 1 | 1 | 8 | 10 |
| Section Round 2 | Section | 2 | 1 | 12 | as needed |
| Section Round 3 (Full House) | Section | 3 | 1 | 16 | as needed |

Event, attempts and pool size are locked once the round has a start list (every run was laid out from them). Clear the start list first to change them.

### 4.2 Draw the start list

1. Select the round → **Draw Start List** → **Who rides**:
   - **Every checked-in solo rider** (Single) or **Every team with all four riders checked in** (Section) — for the first round.
   - **Those marked through in the previous round** — for every later round. "Previous" means the round of the same event with the next-lowest sort order. Entrants still undecided there are not included.
2. Press **Draw…**. The confirmation says exactly what will happen, for example "Draw 25 riders into 3 pools (A: 9, B: 8, C: 8)?" and "75 runs in a random order." Press **Draw**.

How pools work: the number of pools is the number of entrants divided by the pool size, rounded up, and the pools are balanced so no two differ by more than one — 25 riders at a pool size of 10 make pools of 9, 8 and 8, not 10, 10 and 5. The order is random. Pools ride one after another: all of Pool A, then Pool B. Within a pool everyone rides attempt 1, then everyone rides attempt 2, then attempt 3. A Section team's four riders ride one after another, team leader first.

You can **Redraw** as often as you like until the first result is recorded in the round; after that the draw is refused ("Clear results before redrawing."). The count in the confirmation comes from the latest data and can differ slightly if riders are still checking in.

### 4.3 Adjust the start list

The start list is grouped by pool. For each entrant you can:

- **Move to another pool** — they ride last in their new pool.
- **Remove** them from the round — their runs are deleted and everyone after moves up. Their registration is not touched.
- **Show Running Order** → move a run earlier or later, within the same pool and the same attempt pass.
- **Put on course** — makes that rider the one on course on every screen (judges' panel, commentary, `/live`, overlays) in one click. If the rider is in a round that is not live, it asks first, because every screen switches to that round. **Find a rider** above the start list narrows it by rider, team, horse or pool as you type.

Nobody with a recorded result can be moved or removed; clear their results first.

### 4.4 Add a late entrant

**Add Late Entrant** → search by rider or team name → **Add**. They join the smallest pool (the earliest letter on a tie) and ride last in it, at the end of each attempt pass. This works even after results have been recorded. Normally only checked-in riders are listed; tick **Include entrants who have not checked in** to override that (it is recorded in the audit log). If their pool has already ridden, the judges put them on course from the start list.

### 4.5 Print the pool sheet

**Pool Sheet** shows a plain black-on-white list of every pool's riders; **Print Pool Sheet** prints just that, for the notice board at the venue. Print it again after any change to the pools.

### 4.6 Set the round live and call Pool A

1. **Set live** on the round. The judges' panel, the public scoreboard and the stream overlays all switch to it. Nobody is on course yet.
2. **Call Pool A** on Pool A's header (or let the head judge do it from `/judge`). Every screen — scoreboard, overlays, commentary — switches to Pool A's roster with "get ready", and the first rider of Pool A still to ride goes on course. The commentator reads the names out.
3. The first result recorded returns every screen to the scoreboard.

### 4.7 Finish the round

When every run is done, press **Mark Complete**. Results can still be corrected afterwards. Then draw the next round from "those marked through", set it live and call its first pool. Once another round is live, the public scoreboard lists the completed round under its round selector with its final standings.

### 4.8 Who goes through, overrides and the podium

The **Standings & Advance Overrides** table shows each entrant's rank, pool, points, best result, runs and whether they are **Through**, **Out** or **Undecided**:

- Single: a carried peg puts a rider through at once. Without a carry, they are out once all their attempts are ridden.
- Section: a team is through when the four riders' points reach the round's target, decided once all four have ridden.
- Skipped runs do not count towards "all ridden".

In the qualification (any Single round with more than one attempt) one carried peg is enough, so recording a carry **skips that rider's remaining attempts automatically**, in the same save. The judges' panel moves straight past them and labels them "Already qualified — attempt not needed". If the carry is undone or changed to another result, those attempts come back into the start list by themselves. A judge can still restore one by hand from the start list if the rider is to ride it after all.

To overrule the rule for one entrant (a disqualification, a re-run ordered by the chief judge), use **Mark Through** or **Mark Out** in their row, with an optional note. The next round's draw follows the override. **Remove Override** goes back to the rule. The public scoreboard can tell that an entrant's result was overridden, but the note stays with the staff.

For a final, record the **Podium**: choose 1st, 2nd and 3rd from the round's entrants (each once) and **Save Podium**. It appears on the public scoreboard above that round's standings straight away, whether or not the round is still live. **Clear Podium** removes it.

### 4.9 The screens: what the public scoreboard and stream show

The **Screens** card chooses what `/live` and the stream overlays show. The judges have the same controls in the **Screens** sheet on `/judge`.

- **Scoreboard** — the normal view: rider on course, results, standings.
- **Standings** — the standings take the screen; the rider graphics step aside.
- **Rider** — the rider on course alone; the standings step aside.
- **Pool call-up** — the called pool's roster with "get ready". Calling a pool sets this by itself, and the first result switches back to Scoreboard.
- **Message only** — the stream shows only the message bar.
- **Blank** — every stream graphic is hidden (breaks, ceremonies). `/live` itself keeps its normal layout.

The active mode reads "On screen now". Type a **message** (up to 200 characters) and **Set Message** to show it on `/live`, the commentary panel and the stream's ticker or message bar; **Clear Message** removes it. On `/admin/scoring` these apply at once; on `/judge` they ask for confirmation.

**Clear Live Round** (with confirmation) leaves nothing live: the judges' panel asks for a round, and `/live` and the overlays show no rider until a round is set live again. Results and start lists are not touched. Use it at the end of the day.

## 5. Judges at `/judge`

Use a phone. Sign in with your judge account and open `/judge`. The panel keeps the screen awake while it is open, on phones that allow it.

**What you see:** the round name, the pool and "Run 12 of 48" at the top, with a connection badge (**Live**, **Updating** or **Offline**). Below that the pool call-up box, the rider on course in very large type, the three result buttons, the last result, and who is next. **Start list**, **Round** and **Screens** buttons sit at the top.

**Call a pool.** The call-up box shows the pool **Called** and the **Next** one. When the called pool has finished, a large **Call Pool B** button appears; before then there is a smaller **Call Pool B early**. Confirm. Any pool can also be called from its header in the start list.

**Score a run — two taps.**

1. Tap **CARRIED 4**, **STRUCK 2** or **MISS 0**.
2. A bar asks "Record Carried (4) for Harpreet Singh?" — tap **Confirm Carried** (or Cancel).

The next rider comes on course by themselves. While a request is being sent the buttons are disabled; an error appears as a message and nothing is changed — tap again.

**Undo the last result.** In the **Last result** box, **Undo last result** → confirm. The result is removed and that rider comes back on course so you can record the right one.

**Change a result.** **Change result** in the Last result box, or open the **Start list**, tap the run, **Change result**. The recorded result is shown; choose the correct one and confirm. **Clear result** (in the start list) removes a result without putting the rider back on course.

**Skip a run.** **Skip run** → confirm. The run will not be scored and the next rider comes on course. A skipped run can be brought back with **Restore this run** (or from the start list).

**Put a particular rider on course.** **Start list** → tap the run → **Put on course**. When nobody is on course the panel offers **Put … on course** for the next rider waiting. In the start list, type part of a rider's name, team, horse or pool ("Sandhu", "Pool B") in **Find a rider** to narrow the list as you type.

**Two judges on one run.** If another judge has already recorded the run, you see "This run already has a result. Use Change result to replace it." Nothing was overwritten; look at the last result before changing anything.

**During a pool call** the screens show the roster until the first result. **Show scoreboard now** ends it early.

**Switch round** with the **Round** button — normally the administrator does this from `/admin/scoring`.

**Already qualified.** In the qualification, a carry skips the rider's remaining attempts by itself; they show in the start list as "Already qualified — attempt not needed" and the panel never puts them on course. Undoing or changing the carry brings them back.

**Screens.** The **Screens** button opens the same controls as the administrators' Screens card (section 4.9): the six display modes and the message. Each change asks for confirmation.

## 6. Commentators at `/commentary`

Use a laptop or a tablet held sideways. Sign in and open `/commentary`. It follows the judges by itself; there is nothing to press except the standings toggle.

- **Header:** the round and event, "Now riding: Pool A · Next: Pool B", **Screens:** what the stream is showing (Scoreboard, Leaderboard, Rider, Pool call-up, Message only, or Hidden for Blank), and the connection badge.
- **On course now** (left, largest type): the rider's name, then **Father** and **Mother** (each shown only when the rider gave it — both are optional), **From** (the full home address as registered), **Age**, **Horse** (name, breed, age), **Riding** (years of experience), **Team** with a "Team leader" tag, and the rider's photo if they uploaded one. Below: every run they have ridden today with its result, **Total today**, and their **Rank** in the round and in their pool.
- **Just scored:** a flash with the rider and the result each time a run is recorded.
- **Up next** (right): the next three riders, with parents, district and years riding.
- **Standings:** toggle between the current **Pool** and the whole **Round**; a selector looks back at any round ridden today.
- **Round progress:** runs scored out of the total.
- **Message strip** along the bottom when an announcement is set.
- **Pool call-up mode:** when a pool is called the left side becomes "Pool B — get ready" with the riders in riding order (team riders listed under their team) and "Next: Pool C". Read the names out; it returns to the rider view with the first result.

This page carries personal details. Do not put it on a screen the audience or the cameras can see.

## 7. The public scoreboard at `/live`

Anyone can open `/live` on a phone; it is linked as **Live Scores** in the site footer. It shows the announcement message, the "Pool B — get ready" card during a call-up, the rider on course, the last result, who is up next, the **Standings** (pool tabs, and earlier rounds with their final standings and podium) and a **Pools** tab where a rider can type their name and find their pool. Before scoring is set up it says "Live scoring begins on November 11, 2026". It never shows parents' names, ages or contact details. It updates within about a second of each result, and follows the screens' mode: Standings puts the standings first, Rider shows the rider alone (with a button to open the standings), and Pool call-up shows the call-up card.

Tell riders at the briefing to check the Pools tab for their pool, and to listen for "Pool … get ready".

## 8. When something goes wrong

**The badge says Updating or Offline.** Updating means live updates have dropped and the page is checking every 4 seconds instead; nothing is lost. Offline means the last request failed — the page keeps showing the last good information and keeps retrying. Refresh the page if in doubt.

**A judge is not sure a result went through.** Look at **Last result** and at who is on course before tapping anything. If the panel has moved on to the next rider and Last result shows the right one, it went through. If the same rider is still on course, tapping the result again is safe: if the first one did go through, the panel answers "This run already has a result" and nothing changes. Never re-tap once the next rider is showing — the buttons always score the rider on course.

**The site cannot be reached.** Every result already recorded is safe in the database: each one is saved, with its audit record, before the judge's screen confirms it. Carry on with pen and paper on the printed pool sheet. When the site is back, refresh, then enter the missed results in order: **Start list** → tap the run → **Put on course** → record the result.

**The wrong rider was scored.** **Undo last result**, or **Change result** on each run involved.

**The draw was wrong.** Before any result, **Redraw**. After results, the start list can only be cleared with its results (the page names how many will be deleted); that cannot be undone, though the audit log keeps the record.

**A registration will not delete.** A rider who is in a start list cannot have their registration deleted, so their recorded results cannot vanish with it. Remove them from the round first (or clear the start list), then delete the registration.

**The stream graphics are blank or stale.** See "Troubleshooting" in [live-stream.md](live-stream.md). The usual reason is simply that no round is live, or that the screens have been set to Blank.

**Hiding the overlays, or putting a message on every screen.** Use the **Screens** card on `/admin/scoring` or the **Screens** sheet on `/judge` (section 4.9).

## 9. Training mode: practise before event day

Judges and commentators can rehearse on the real panels with sample riders. Nothing they do in practice touches the real results.

**From home, on the live site.**

1. Sign in with your staff account (judge, commentator or administrator).
2. Open the **Judge Panel** or **Commentary** link, then **Practise on sample riders** at the bottom of the page. Or go straight to `/judge/demo` or `/commentary/demo`.
3. A yellow **TRAINING MODE** banner reads "Practice data — yours only, nothing is recorded; it may reset after a while." The practice is yours alone: two people practising at the same time never see each other's taps.
4. To practise both panels together, open `/judge/demo` on your phone and `/commentary/demo` on a laptop, signed in with the same account. The commentary panel follows your judging within about two seconds.
5. **Reset training data** (in the judges' banner, with a confirmation) starts your practice again from the beginning. It never affects anyone else. Practice data is kept in the server's memory only: it is dropped after six hours unused, and it can also start again by itself when the site restarts.
6. **Leave practice — open the live panel** at the bottom of the page returns to the real panel.

Everyone else gets the same "Log in" or "Access denied" page as `/judge`. The practice pages are hidden from search engines.

**On a practice laptop at the venue (no login).** Add `SCORING_SAMPLE_MODE=1` to `.env.local` on that laptop and start the site with `npm run dev`. **Never set this variable on the live site.** Anyone on the same Wi-Fi can then open `/judge/demo` and `/commentary/demo` at the laptop's network address that `npm run dev` prints. Everyone shares **one** practice session there, and the banner says so. A reset restarts it for everyone. `/live?sample=1` on that laptop shows what the public would see.

**Same as the day, either way.** Two-tap scoring, the automatic skip after a qualifying carry, undo, change, skip, **Call Pool**, **Screens**, and the start list with **Find a rider** all behave exactly as on event day. Nothing is written to the database or the audit log, and the sample riders and their families are invented. The vMix feeds' `?sample=1` keep their fixed rehearsal data and do not follow the practice.

**Dress rehearsal.** Before event day the whole team rehearses together once, on the real system with test riders only; the run sheet is `public/documents/rehearsal-guide.pdf` (served at `/documents/rehearsal-guide.pdf`), built by `npm run build:guide` from [2026-10-26-rehearsal-guide-outline.md](superpowers/plans/2026-10-26-rehearsal-guide-outline.md).
