---
title: How the live scoring works
subtitle: For everyone helping on event day: organisers, judges, commentators, the check-in desk and the graphics team.
version: 26 October 2026
---

<!--
EDITING NOTES (not printed)

This file is the source of public/documents/staff-guide.pdf. After editing it,
run `npm run build:guide` and commit both this file and the PDF.

- `# Label — subtitle` starts a new page with a big label, a tab on the page
  edge and an entry in the cover's "Read your section" list. A comment line
  saying same-page just above it lets that section follow on the same page.
- `##` and `###` are headings inside a section. `1.` lists are numbered
  steps, `-` lists are bullets, `>` lines are a highlighted box, `|` lines are
  a table. `**bold**` is bold; web addresses become clickable links.
- {site.email}, {site.url}, {site.eventDate}, {site.checkInDate},
  {site.venue} and {site.title} are filled in from src/lib/site.ts.
- Pictures live in scripts/staff-guide/. A paragraph of `![caption](file.jpg)`
  images is a row of figures (a number in quotes after the file name is the
  widest the picture may be, in points). A "side: file.jpg width=150" comment
  and a "/side" comment put the picture to the right of the text between
  them. An "annotated: file.jpg width=180" comment followed by a list of
  `@0.25 text` items labels a picture: the number is how far down the
  picture (0 = top, 1 = bottom) the label points.
- "diagram: pointer", "diagram: points" and "diagram: pools" comments are
  drawn by the script.
- Plain English, short sentences, button names exactly as on screen. Never
  name any organisation, club or sponsor.
-->

# The one idea — one live pointer, every screen follows it

The site keeps one record of **who is on course**: the live round, the pool that has been called, the rider on course, and what the screens should show. Judges and organisers move it. Every other screen reads it and follows within about a second.

<!-- diagram: pointer -->

Each result is saved on the server before the judge's phone confirms it, so nothing is lost if a phone drops out, and every screen shows the same thing.

## Points

<!-- diagram: points -->

- **Single Tent Pegging:** one carried peg puts a rider through. The qualification gives each rider 3 attempts; every later round (the Aarhi rounds and the final) gives 1.
- **Section Tent Pegging:** teams of four, one run per rider. The four scores are added up. To go through, a team needs 8 points in round 1, 12 in round 2 and 16 (Full House) from round 3.

## How pools work

<!-- diagram: pools -->

- **Balanced and random.** Pools differ by at most one rider (9, 8 and 8, never 10, 10 and 5), and the order is drawn at random.
- **Called one at a time.** All of Pool A rides, then Pool B. Within a pool, everyone rides attempt 1, then attempt 2, then attempt 3. A team's four riders ride one after another, leader first.

# Getting access — your account and your role

Everyone who helps uses their own account. It takes two minutes.

1. Sign up at {site.url}/signup with your own email address. Confirm it from the email you receive.
2. Tell an organiser the email address you used.
3. The organiser gives your account its role: **Judge**, **Commentator** or **Admin**.
4. Reload the site. A new link appears next to **My Account**: **Judge Panel**, **Commentary** or **Admin** (organisers see all three). On a computer it is in the top bar. On a phone, open the menu at the top right.
5. Open your page once, on the phone or laptop you will use on the day, to check that it works.

If your page says **Access Denied**, your role has not been set yet. Ask an organiser.

## Who can open what

| Page | Address | Who can open it |
| --- | --- | --- |
| Public scoreboard | {site.url}/live | Everyone, no login |
| Judges' panel | {site.url}/judge | Judges and organisers |
| Commentary panel | {site.url}/commentary | Commentators, judges and organisers |
| Admin dashboard, scoring, check-in, paper entry | {site.url}/admin | Organisers (the Admin role) |

The check-in desk works in the admin dashboard, so check-in helpers need the **Admin** role too.

> **Keep your login to yourself.** Everything a judge, commentator or organiser does on these pages is recorded with their name. If someone else needs to help, they get their own account.

## On the day, before the first run

- Charge your phone or laptop fully, and bring a charger or power bank.
- Sign in and open your page before the first pool is called.
- Check the connection badge at the top: it should say **Live** (or **Updating**, which also works). See the Judges section for what the badge means.
- Keep this guide to hand: the last page says what to do if something goes wrong.

# Organisers — before the day

Organisers have the **Admin** role. Use a laptop for everything in this section.

## 1. Give staff their roles (a few days before)

1. Each judge, commentator and check-in helper signs up and confirms their email (see Getting access).
2. Open {site.url}/admin, choose the **Profiles** tab, then **Add Staff**.
3. Search by email or name, choose the **Role** (Judge, Commentator, or Admin for another organiser) and confirm.
4. To change a role later, use the **Role** dropdown in their row. **Player** removes staff access. The last administrator cannot be given another role.

## 2. Create the rounds (can be done the day before)

Open {site.url}/admin/scoring (or **Scoring** in the admin tab bar). Press **New Round**, fill in the boxes and press **Create Round**. A typical day:

| Name | Event | Round number | Attempts per rider | Target points | Pool size |
| --- | --- | --- | --- | --- | --- |
| Qualification | Single | 0 | 3 | blank | 10 |
| Aarhi Round 1 | Single | 1 | 1 | blank | 10 |
| Aarhi Round 2, … Final | Single | 2, 3, … | 1 | blank | as needed |
| Section Round 1 | Section | 1 | 1 | 8 | 10 |
| Section Round 2 | Section | 2 | 1 | 12 | as needed |
| Section Round 3 (Full House) | Section | 3 | 1 | 16 | as needed |

- **Pool size** is about how many go in each pool: riders for Single, teams for Section. Leave it blank for one list with no pools.
- **Target points** is for Section rounds only. **Sort order** is the order the rounds are ridden across the day; use each number once.
- Event, attempts and pool size are fixed once a round has a start list. Clear the start list first to change them.

## 3. Check-in ({site.checkInDate}, the day before)

Only riders who check in are drawn into the first rounds, and a team needs all four riders checked in. See the Check-in desk section.

## 4. Paper entries

For riders who will not register online. Print the **Solo Rider Form** or the **Team Form** from {site.url}/register/paper.

1. Open **Paper entry** in the admin tab bar ({site.url}/admin/paper) and choose **Solo rider** or **Team of 4**.
2. Type the fields in the order the sheet prints them. Check the **Possible duplicate** box: it lists registrations that look like the same rider. Email is optional.
3. Press **Save Registration** (or **Save Team**). Write the confirmation code from the next screen in the **Office use only** box, with your name and the date. A rider without email gets the code from you.

# Organisers — on the day

Run the day from {site.url}/admin/scoring on a laptop. The header shows the live round, the called pool and what the screens show. Press **Refresh** at any time.

## Draw the start list

1. Choose the round in the list on the left.
2. Under **Draw Start List**, choose **Who rides**: **Every checked-in solo rider** (Single) or **Every team with all four riders checked in** (Section) for a first round, and **Those marked through in the previous round** for every later round.
3. Read the preview line: how many riders, how many pools and their sizes (for example A 9 · B 8 · C 8), and how many runs.
4. Press **Draw…**, read the question, then press **Draw**. The pools are balanced and the order is random.

You can **Redraw…** as often as you like until the first result of the round is recorded.

## Print the pool sheet

**Pool Sheet** shows a plain list of every pool's riders. **Print Pool Sheet** prints it for the notice board. Print it again after any change.

## Late entrants and changes

- **Add Late Entrant:** search by name, then press **Add to Pool …**. They join the smallest pool and ride last in it. This works even after results have been recorded.
- Only checked-in riders are offered. Tick **Include entrants who have not checked in** to override that; it is recorded.
- In the start list you can move an entrant to another pool (the **Pool** dropdown in their row) or **Remove** them. **Show Running Order** lets you move a run earlier or later within its pool.

## Run the round

1. Press **Set Live** on the round. Every screen switches to it. Nobody is on course yet.
2. Press **Call Pool A** on Pool A's header. Every screen shows Pool A's riders with "get ready", and the first rider of Pool A goes on course.
3. The judges take over from here. The first result returns every screen to the scoreboard.
4. To put a particular rider on course, type their name in **Find a rider**, then press **Put on course** in their row.
5. When a pool has finished, call the next one: here, or from a judge's phone.
6. When every run is done, press **Mark Complete**. Results can still be corrected afterwards.
7. Draw the next round from **Those marked through in the previous round**, press **Set Live** and call its first pool.

## Screens

The **Screens** card chooses what the public scoreboard and the stream graphics show. Changes here apply at once.

| Button | What the screens show |
| --- | --- |
| Scoreboard | The normal view: the rider on course, the last result, the standings |
| Standings | The standings take the screen; the rider graphics step aside |
| Rider | The rider on course alone; the standings step aside |
| Pool call-up | The called pool's riders with "get ready". Calling a pool sets this by itself |
| Message only | Only the message bar on the stream |
| Blank | Every stream graphic hidden, for breaks and ceremonies |

- Type a message of up to 200 characters and press **Set Message**. It shows on the public scoreboard, the commentary panel and the stream. **Clear Message** removes it.
- **Clear Live Round** at the end of the day leaves nothing live. Results and start lists are not touched.

## Who goes through, overrides and the podium

**Standings & Advance Overrides** shows every entrant as **Through**, **Out** or **Undecided**.

- Single: a carried peg puts a rider through at once. Without a carry they are out once all their attempts are ridden.
- Section: a team is through when its four riders' points reach the round's target.
- To overrule the rule for one entrant (a disqualification, a re-run), type a reason if you like and press **Through** or **Out**. **Clear** goes back to the rule. The next round's draw follows the override.
- For the final, choose the **1st place**, **2nd place** and **3rd place** under **Podium** and press **Save Podium**. It shows on the public scoreboard straight away.

## Rider list for the graphics team

Press **Download rider list (CSV)**. It lists every registered rider with team, horse, district, state, experience, check-in and pool, for the name straps. It has no phone numbers, emails, ages, parents' names or confirmation codes. Give it to the graphics team only.

## What is locked once results exist

- **Redraw** is refused once a result is recorded in the round.
- An entrant with a result cannot be moved or removed. Clear their results first.
- **Clear Start List** then asks you to confirm **Clear With Results**: it deletes those results and cannot be undone.
- Event, attempts and pool size stay fixed while the round has a start list.
- A rider who is in a start list cannot have their registration deleted.

# Judges — recording results at the track

Use your phone, fully charged. Sign in and open {site.url}/judge (or tap **Judge Panel** next to My Account). While the panel is open the screen stays awake, on phones that allow it.

<!-- annotated: judge-panel.jpg width=150 -->
- @0.035 **Round, pool and run.** "Run 17 of 24" is this run's place in the start list. The badge on the right shows the connection.
- @0.095 **Start list** (every run), **Round** (switch the live round) and **Screens** (what the public screens show).
- @0.186 **Called and Next.** The pool called to the start and the one after it.
- @0.325 **On course.** The rider to score now, with their horse and attempt.
- @0.57 **Result buttons.** CARRIED 4, STRUCK 2, MISS 0.
- @0.745 **Skip run.** For a rider who does not ride.
- @0.862 **Last result**, with **Change result** and **Undo last result**.
- @0.977 **Next.** Who comes on course after this rider.

## Score a run: two taps

<!-- side: judge-confirm.jpg width=112 caption="Tap, then Confirm" -->
1. Tap **CARRIED 4**, **STRUCK 2** or **MISS 0**.
2. A bar at the bottom asks, for example, "Record Carried (4) for Amandeep Singh Randhawa?". Check the name.
3. Tap **Confirm Carried** (or **Confirm Struck**, **Confirm Miss**). Tap **Cancel** if you chose wrong.
4. A green note says the result was recorded, and the next rider comes on course by themselves.

While a result is being sent the buttons are greyed out. A red message means nothing was changed: read it and tap again.
<!-- /side -->

## Calling the next pool

1. When the called pool has finished, a large **Call Pool B** button appears in the Called and Next box (before then, a smaller **Call Pool B early**).
2. Tap it and confirm. Every screen shows Pool B's riders with "get ready", and Pool B's first rider goes on course.
3. The first result returns the screens to the scoreboard. **Show scoreboard now** ends the call-up early.

## Qualification: one carry is enough

In the qualification one carry puts a rider through, so recording a carry skips their remaining attempts automatically. The start list shows them as "Already qualified — attempt not needed" and the panel never puts them on course. Undo or change the carry and the attempts come back.

## Fixing a mistake

- **Undo last result** removes the last result and puts that rider back on course. Record the right one.
- **Change result** shows the recorded result; choose the correct one and confirm. For an older run: Start list, tap the run, **Change result**.
- **Skip run** is for a rider who does not ride: the run is not scored and the next rider comes on course. **Restore this run** brings it back.
- "This run already has a result. Use Change result to replace it." means another judge recorded it first. Nothing was overwritten; check **Last result**.
- **Not sure a result went through?** If the panel has moved on and Last result is right, it did. If the same rider is still on course, tapping again is safe. Never tap again once the next rider shows: the buttons always score the rider on course.

## The start list

<!-- side: judge-start-list.jpg width=124 caption="Find a rider" -->
1. Tap **Start list**. Every run is listed by pool, with its result.
2. Type in **Find a rider**: a name, team, horse or pool.
3. Tap a run. Choose **Put on course**, **Change result**, **Clear result**, **Skip run** or **Restore run**.
4. **Call Pool …** on a pool's header calls that pool.
5. Tap **Close** to go back.
<!-- /side -->

## The connection badge

| Badge | What it means | What to do |
| --- | --- | --- |
| Live (green) | Updates arrive instantly. | Nothing. |
| Updating (amber) | The instant link has dropped; the panel checks every 4 seconds instead. Nothing is lost. | Carry on. If it stays amber for minutes, refresh the page. |
| Offline (red) | The last request failed. You see the last good information; the panel keeps retrying. | Check your signal. Saved results are safe. Refresh when you are back online. |

> **Never share your login.** Your name is recorded with every result you enter. Do not hand your signed-in phone to anyone.

# Commentators — the commentary panel

Use a laptop, or a tablet held sideways. Sign in and open {site.url}/commentary (or tap **Commentary** next to My Account). The panel follows the judges by itself: there is nothing to press except the standings buttons.

![The commentary panel during a run](commentary.jpg "330")

## What each part shows

- **Top bar:** the round and event, "Now riding: Pool B · Next: Pool C", **Screens:** what the stream shows, and the connection badge with the time of the last update.
- **On course now** (left, largest type): the name, then **Father** and **Mother** (only if the rider gave them), **From** (village, district, state, country), **Age**, **Horse** (name, breed, age), **Riding** (years of experience) and **Team** with a "Team leader" tag. A photo shows if the rider uploaded one.
- **Today:** each run ridden today with its result, **Total today**, the **Rank** in the round and the rank in the pool.
- **Just scored:** a bar with the rider and the result, each time a run is recorded.
- **Up next** (right): the next three riders, with parents' names, horse, district and years riding.
- **Standings:** the current pool, or **Round** for the whole round (a selector looks back at earlier rounds). **Round progress:** runs scored out of the total.
- **Message strip:** along the bottom, when an organiser sets an announcement.

## When a pool is called

<!-- side: commentary-pool-call.jpg width=170 caption="Pool call-up" -->
The left side changes to "Pool B — get ready", with the riders in riding order (team riders listed under their team) and "Next: Pool C".

Read the names out so the riders come to the start. The panel goes back to the rider view with the first result.
<!-- /side -->

> **This panel shows personal details.** Keep it away from the audience and out of camera shots.

# Check-in desk — {site.checkInDate}, the day before

Check-in is in the admin dashboard, so you need the **Admin** role (see Getting access). A laptop is easiest.

1. Open {site.url}/admin and choose the **Check-in** tab.
2. Type the rider's **Confirmation Code** (it looks like NBP-7K4M2Q) and press **Find Rider**.
3. No code? Search by name, email or phone number and pick the rider from the list.
4. Check the details with the rider: name, horse, emergency contact.
5. Press **Confirm Check-in**. **Undo Check-in** reverses it.

- Only checked-in riders are drawn into the first rounds. A team needs all four riders checked in; the panel shows each teammate as **Checked in** or **Waiting**.
- **Paper entries** check in the same way, with the code written in the Office use only box on their paper form.
- **"No email (paper entry)"** means the rider registered on paper without an email address. That is fine. No email is ever sent to them, so they get their code from the organisers, not by email.

## Common questions

- **Lost code.** Search by name, email or phone number instead (step 3).
- **Not registered at all.** An organiser can type in a paper form on the spot at {site.url}/admin/paper. The rider then checks in with the new code.
- **Details are wrong** (a spelling, the horse). Check the rider in, and tell an organiser, who can correct the registration in the admin dashboard.
- **Arrives on event day.** Check them in as usual and tell the organisers: they add the rider to a round with **Add Late Entrant**.

# Graphics team — the public scoreboard and the stream

## The public scoreboard

<!-- side: live-phone.jpg width=128 caption="The public scoreboard" -->
- Anyone can open {site.url}/live on a phone. It is linked as **Live Scores** at the bottom of every page.
- It shows the message, the rider on course, the last result, who is up next and the standings.
- The **Pools** tab lets a rider type their name and find their pool. Tell riders about it at the briefing, and to listen for "Pool … get ready".
- It never shows parents' names, ages or contact details.
- It updates within about a second of each result.
<!-- /side -->

## Stream graphics

- The graphics team has its own handout, **Live scoring data for vMix**: four data feeds that vMix reads directly. It is at {site.url}/documents/vmix-guide.pdf and in the admin tab bar as **vMix guide (PDF)**.
- Ready-made overlays for any streaming software are explained at {site.url}/overlay.
- The overlays follow the **Screens** setting chosen by the organisers and judges, and update within about a second of each result.
- For name straps, an organiser gives you the rider list (CSV).

![Lower third](stream-lower-third.jpg) ![Pool standings](stream-leaderboard.jpg)

# Practising — training mode

Practise on the real panels with sample riders, from home, before the day. Nothing is recorded.

1. Sign in with your staff account. Any staff role can practise.
2. Judges open {site.url}/judge/demo (or tap **Practise on sample riders** at the bottom of the judges' panel). Commentators open {site.url}/commentary/demo.
3. A yellow **TRAINING MODE** banner sits at the top. Everything else works as on the day: two-tap scoring, the skip after a qualifying carry, **Undo last result**, **Change result**, **Skip run**, **Call Pool …**, **Screens** and **Find a rider**.
4. **Reset training data** (in the judges' banner) puts your sample riders back to the start. **Leave practice — open the live panel** takes you back.

- Your practice is yours only: nobody else sees your taps, and it may reset after a few hours without use. The sample riders are invented.
- The commentary practice page follows your own judging practice: open {site.url}/judge/demo on a phone with the same account and score a few runs.
- In training the badge normally says **Updating**. That is expected.
- On the organisers' practice laptop, if they set one up, the pages work without signing in and everyone on it shares one set of sample riders.
- Before event day the whole team runs one dress rehearsal together, on the real system with test riders. The run sheet is the **Rehearsal guide (PDF)**, at {site.url}/documents/rehearsal-guide.pdf.

# If something goes wrong — what to do

| What you see | What to do |
| --- | --- |
| The screen says **Offline** | Results already saved are safe: each is saved before the judge's screen confirms it. The page keeps retrying. Check your signal, then refresh. |
| The badge says **Updating** | Live updates have slowed; polling takes over within seconds. Nothing is lost. Carry on. |
| A wrong result, or the wrong rider scored | **Undo last result**, or **Change result** on each run involved (older runs: Start list, tap the run, **Change result**). |
| A rider is missing from the start list | An organiser uses **Add Late Entrant** at {site.url}/admin/scoring. If their pool has ridden, a judge puts them on course from the start list. |
| The draw was wrong | Before any result, an organiser can **Redraw…** the start list. After results, ask the head organiser: clearing a start list deletes its results. |
| The site cannot be reached | Carry on with pen and paper: on the printed pool sheet, write each rider, result and time. When the site is back, refresh and enter them in order: Start list, tap the run, **Put on course**, record the result. |
| The stream graphics are blank | Usually no round is live, or the screens are set to **Blank**. Check the Screens card. |
| Someone sees **Access Denied** | Their role is not set. An organiser sets it under Admin, Profiles. |
| **Whom to contact** | On the day: the head organiser at the scoring laptop. Before the day: {site.email}. |
