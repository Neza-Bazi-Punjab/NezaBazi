---
title: Rehearse the live scoring
subtitle: How to practise on your own, and how the whole team runs one dress rehearsal before event day.
version: 26 October 2026
---

<!--
EDITING NOTES (not printed)

This file is the source of public/documents/rehearsal-guide.pdf. After
editing it, run `npm run build:guide` and commit both this file and the PDF.
The formatting rules are the staff guide's, described at the top of
docs/superpowers/plans/2026-10-25-staff-guide-outline.md. Pictures come from
the staff guide's folder, scripts/staff-guide/.

- Only characters the PDF's built-in fonts carry: no arrows (write ›).
- Button names exactly as on screen; check them against the panels
  (ScoringAdmin.tsx, JudgePanel.tsx, CommentaryPanel.tsx, LiveBoard.tsx,
  PaperEntryPanel.tsx) when they change.
- Do not repeat the staff guide: point to its sections by name.
- Never name any organisation, club or sponsor.
-->

There are two ways to rehearse. **On your own**, any time: ten minutes on the practice pages with invented riders, and nothing is recorded. **All together**, once, about a week before {site.eventDate}: a 45-minute dress rehearsal on the real system, the real database and real phones, with test riders only.

This guide says what to try and what you should see. How each screen works is in the staff guide, {site.url}/documents/staff-guide.pdf.

# Practise alone — any time, ten minutes, nothing recorded

<!-- side: judge-confirm.jpg width=104 caption="Tap, then Confirm" -->
1. Sign in with your own staff account, on the device you will use on the day. **Access Denied** means your role is not set (staff guide, Getting access).
2. Judges open {site.url}/judge/demo, commentators {site.url}/commentary/demo. A commentator drives their practice from /judge/demo on a phone, signed in with the same account.
3. A yellow **TRAINING MODE** banner sits at the top. The riders are invented, your practice is yours only, and the public scoreboard never shows it.
4. The badge says **Updating** in training. That is expected.
<!-- /side -->

## Try these on the judges' practice page

| Try this | You should see |
| --- | --- |
| **Start list**, type part of a name in **Find a rider**, tap a waiting run, **Put on course** | That rider **On course**. |
| **STRUCK 2**, then **Confirm Struck** | A green note, **Last result** filled in, the next rider on course. |
| **MISS 0**, then **Cancel** | Nothing recorded; the same rider on course. |
| **CARRIED 4**, then **Confirm Carried**, for a rider with attempts left | Their later attempts skipped: "Already qualified — attempt not needed" in the start list. |
| **Undo last result**, then **Undo result** | The carry gone, the rider back on course, their attempts back. |
| **Change result**, another result, then **Change to …** | **Last result** shows the new result. |
| **Skip run**, then **Skip run**. In **Start list**, tap that run, **Restore run** | The next rider on course; then the run back in the list. |
| **Start list**, **Call Pool B** on Pool B's header, then **Call Pool B** | "Screens show the Pool B call-up" until the next result. |
| **Screens**: **Standings**, **Switch screens**. A message, **Set message**, **Show message**. Then **Scoreboard** | **On screen now** follows your choice; the commentary page shows the mode and the message. |
| {site.url}/commentary/demo open on a second device, same account | It follows each tap within about two seconds. |
| **Reset training data** in the yellow banner, then **Reset training data** | Your sample riders back at the start. |

> **If your practice jumps back to the start**, the server restarted or your phone reached a different server: practice lives in the server's memory, not the database. That is the practice store, not the scoring system. Press **Reset training data** and carry on.

# Dress rehearsal — all together, about 45 minutes, once

Once, about a week before {site.eventDate} and before check-in day, with everyone in one place or on one call. This is the real system: the real database, real phones on the real mobile network, the real public scoreboard. Only the riders are not real.

## Why test riders only

{site.url}/live and the data feeds are public. A round drawn from the real registrations would show real riders' names, with made-up results, to anyone who opens the site. So the rehearsal round holds only eight test riders, entered as paper entries the day before. The draw takes only checked-in riders, so the organiser checks the test riders in too, which rehearses the check-in desk as well.

> **Rehearse before check-in day ({site.checkInDate}).** If any real rider is already checked in, do not draw at all: add the test riders one by one with **Add Late Entrant** (the box after the run sheet), so no real rider lands in the rehearsal round.

## Who does what

| Who | Device | Opens |
| --- | --- | --- |
| Organiser | Laptop | {site.url}/admin/scoring |
| Judge 1 and Judge 2 | Phones | {site.url}/judge |
| Commentator | Tablet or laptop | {site.url}/commentary |
| Spectators: everyone else | Phones, on mobile data | {site.url}/live |
| Graphics (optional) | vMix | The real feeds, without `?sample=1` (see the vMix guide) |

## The day before (head organiser, 20 minutes)

1. **Accounts.** Under Admin › **Profiles**, check that every judge, commentator and organiser taking part has their role (see the staff guide, Getting access). Ask each to open their page once.
2. **Eight test riders.** At {site.url}/admin/paper choose **Solo rider** and enter `TEST Rider 1` to `TEST Rider 8`: horse `Test Horse 1` to `Test Horse 8`, any district, ages 20 to 40, phone numbers `9000000001` to `9000000008` (each must differ). Give a few of them a father's and mother's name (such as `Test Father 1`) so the commentator can check those lines. Fill the other required boxes with anything plausible.
3. **No email.** There is no "no email" box: leave **Email (if you have one)** blank. No email is sent, and the registrations list shows "No email (paper entry)". The **Possible duplicate** box may list the other test riders as you type; that is fine.
4. **Write down each code.** Press **Save Registration**, then copy the confirmation code from the next screen: the registrations list does not show it.
5. **Check them in.** Admin › **Check-in**: type each code, **Find Rider**, **Confirm Check-in**. All eight must be checked in.

# Run sheet — twelve steps, in order

**Before step 1:** everyone signs in and opens their page; the badges read **Live**. The organiser types `Rehearsal in progress — not real results` in the Screens card's **Message (up to 200 characters)** box and presses **Set Message**, leaving the screens on **Scoreboard**. From step 1, {site.url}/live carries that line.

Do the steps in order. After each one, everyone checks the right-hand column aloud and the organiser ticks it. Each change should reach every screen within a few seconds.

| Who | Does | Everyone should see |
| --- | --- | --- |
| **1.** Organiser | **New Round**: Name `REHEARSAL — DELETE ME`, Event **Single Tent Pegging**, Round number 0 (if the page says there is already a Single round 0, use 50), Attempts per rider 3, Target points blank, Pool size 3, Sort order 99 (or any number no other round uses). **Create Round**. Under **Draw Start List**, **Who rides**: **Every checked-in solo rider**. Read the preview line. Only if it starts "8 solo riders checked in" and all eight test riders were checked in, press **Draw…**, then **Draw**. | Preview: "… 3 pools: A 3 · B 3 · C 2 · 24 runs"; the question: "Draw 8 riders into 3 pools (A: 3, B: 3, C: 2)?". Any number but 8 means a real rider is checked in: do not draw (see the box after this table). Then the round card says "pools of ~3" and the start list holds the eight test riders and nobody else. /live shows the rehearsal message. |
| **2.** Organiser | **Print Pool Sheet** (or **Pool Sheet** on screen). **Set Live** on the round, then **Set Live** in the bar. | Judges: the round name and "Nobody on course". On /live, the **Pools** tab shows Pools A, B and C with the same riders as the pool sheet. The standings already rank everyone, 1 to 8 in name order: read nothing into ranks until results exist. Graphics: the rounds feed shows the round with `is_live` Yes, `pool_count` 3 and `entrants` 8. |
| **3.** Organiser | **Call Pool A** on Pool A's header, then **Call Pool A** in the bar. | /live and the commentary panel: "Pool A — get ready" with its three riders. Judges: **Called** Pool A, **Next** Pool B, and Pool A's first rider on course by themselves. Graphics: `pool_label` A, `display_mode` `pool_call`. |
| **4.** Judge 1 | **Show scoreboard now** (in the judges' call-up box), then **Show scoreboard**. Then **Start list**, find Pool A's second rider (**Find a rider**), tap their attempt 1 run, **Put on course**. Then put Pool A's first rider back on course the same way. | The call-up card gives way to the rider everywhere. Each switch of rider reaches both judges, the commentary panel and /live within a few seconds; the badges read **Live**. Commentator: name, **Father** and **Mother** (for riders given them), **From**, **Age**, **Horse**, **Riding**. Graphics: `rider_name`. |
| **5.** Judge 1 | **STRUCK 2**, then **Confirm Struck**. | The result on /live and in **Just scored** on the commentary panel. Judge 2's phone shows the same next rider on course as Judge 1's. The standings follow. |
| **6.** Judge 2 | **CARRIED 4**, then **Confirm Carried**, for that next rider. | Everyone sees the carry. That rider's later attempts drop out of **Up next** on /live and the commentary panel, and the judges' start list marks them "Already qualified — attempt not needed" and Skipped. The standings show the rider **Through** with 4 points. |
| **7.** Judge 1 | **MISS 0**, **Confirm Miss**. Then **Undo last result**, **Undo result**. Then **MISS 0**, **Confirm Miss** again. | The miss appears everywhere, vanishes with the undo (the rider comes back on course and the standings follow), then appears again. |
| **8.** Commentator | Reads the three names under **Up next** aloud. | The same riders, in the same order, as the next runs in the judges' **Start list**; the first is the judges' **Next**. |
| **9.** Organiser | Screens card: **Standings**, then **Message only**, then **Scoreboard**. | **Standings**: /live puts the standings first; commentary "Screens: Leaderboard"; the lower-third overlay empties. **Message only**: the overlays show only the message bar; /live looks normal; commentary "Screens: Message only". **Scoreboard**: the lower third shows the rider again (the message stays set until step 12). Graphics: the current feed's `display_mode` reads `leaderboard`, `message`, `scoreboard`, with `message` filled in each time. |
| **10.** Organiser, then judges | **Call Pool B** on Pool B's header, then **Call Pool B**. The judges record one result in Pool B. Judge 2 turns their phone to flight mode; Judge 1 records a second result; ten seconds later Judge 2 turns flight mode off. | "Pool B — get ready" everywhere until the first result. Judge 2's badge turns **Offline** (or **Updating**), then **Live** again, and the phone shows the result Judge 1 recorded meanwhile. Nothing is lost. |
| **11.** Organiser | **Mark Complete**, then **Mark Complete**. Under **Podium**, choose **1st place**, **2nd place** and **3rd place**, then **Save Podium** and **Save Podium**. | **Standings & Advance Overrides**: the carried rider **Through**, the rest **Undecided** (attempts still to ride). On /live, the podium above the round's standings. Graphics: `status` complete in the rounds feed. |
| **12.** Organiser | Clean up, in this order: (a) **Delete** on the round, then **Delete With Results**. The round goes first: a registration still in a start list cannot be deleted. (b) Admin › **Solo Registrations**, search `TEST`, and for each test rider **Delete**, then **Confirm Delete**. (c) Screens card: **Scoreboard** (if it is not on already), then **Clear Message**. | The delete question states the counts, such as "its 24 runs and 6 recorded results". Then judges: "No live round". /live says "Live scoring begins on {site.eventDate}" (or, if the real rounds already exist, "No round is being ridden right now"), with no test name and no message. {site.url}/api/live/vmix/rounds returns one row of empty values (or only the real rounds). |

The public pages and feeds are now exactly as they were before the rehearsal. The audit log keeps every step under the organiser's or judge's name, from "Paper Registration Entered" to the deletions. That is correct: leave it.

> **If the preview does not say 8, or a real rider is checked in, do not draw.** Drawing would put real riders in the round. Use **Add Late Entrant**, further down the page, instead: search `TEST`, then for each test rider **Add to Pool A** and **Add Entrant**. (Test riders who are not checked in are listed once **Include entrants who have not checked in** is ticked; the audit log records that.) All eight join Pool A. Then, in the start list's **Pool** column, choose **Move to B (new)** for three of them and **Move to C (new)** for two, confirming each move. Carry on from step 2, and tell the head organiser which real rider is checked in.

# Pass checklist — and what to report

| The rehearsal passes when | If not |
| --- | --- |
| Everyone opened their page without **Access Denied** | Their role is not set: Admin › **Profiles** (staff guide, Getting access). |
| The draw held exactly the eight test riders, in pools of 3, 3 and 2 | Do not draw: use the box on the run sheet. |
| Every pool call reached /live, the commentary panel and the judges | Reload the page that missed it, and report. |
| Every result was on /live within a few seconds | Not there after five seconds: check the badge, reload, report. |
| Both judges' phones always showed the same rider on course | Reload the phone that differs. |
| A qualifying carry skipped that rider's later attempts | Report it: this is a fault. |
| **Undo last result** removed the result from every screen | Reload, check **Last result**, report. |
| Every Screens change reached /live, the commentary panel and the graphics | Reload the page that missed it. A blank overlay or panel: reload it once. Graphics: take `?sample=1` off the address. |
| The badges read **Live**, and came back after flight mode with nothing lost | **Updating** means polling: still fine, but tell the organiser. **Offline**: check the signal, then reload. |
| After cleanup, no test name or message anywhere | Repeat the cleanup steps in order. |

## What to report back

The head organiser sends one email to {site.email} within a day, with:

- each step that failed: its number, the device and browser, what the screen showed, and the time to the minute, with a screenshot if possible;
- any button or label that differs from this guide or the staff guide;
- the phones and networks used, and how long the rehearsal took.
