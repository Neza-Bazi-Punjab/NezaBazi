---
title: Event day in plain words
subtitle: The whole day in one short read: what the organisers press, what the judges tap, how solo turns into teams, and how the demo keeps everything safe.
version: 7 November 2026
---

<!--
EDITING NOTES (not printed)

This file is the source of public/documents/organisers-guide.pdf. After
editing it, run `npm run build:guide` and commit both this file and the PDF.
The formatting rules are the staff guide's, described at the top of
docs/superpowers/plans/2026-10-25-staff-guide-outline.md. Plain English,
short sentences, button names exactly as on screen. Never name any
organisation, club or sponsor.
-->

This is the short version. The staff guide has every button; this page has the shape of the day, so you know what happens next before it happens.

# The one idea — every screen follows one pointer

<!-- diagram: pointer -->

The site keeps one record of **who is on course**: which round is live, which pool has been called, which rider is on course, and what the big screens should show. Organisers and judges move it. Every other screen (the scoreboard at {site.url}/live, the commentary panel, the stream graphics) reads it and follows within about a second.

> Nothing happens by itself. A round goes live because someone presses **Set live**. A pool comes to the start because someone presses **Call Pool**. A rider is on course because a judge taps **Start**. If a screen looks wrong, ask: who moved the pointer last?

# Before the day — rounds, check-in, the draw

## 1. Create the rounds (any time before)

On a laptop, open {site.url}/admin/scoring and press **New Round** for each round of the day. The event is either **Single Tent Pegging** (solo riders) or **Section Tent Pegging** (teams of four).

| Name | Event | Attempts | Target | Pool size |
| --- | --- | --- | --- | --- |
| Qualification | Single | 3 | — | 10 |
| Aarhi Round 1, 2, … Final | Single | 1 | — | 10 |
| Section Round 1 | Section | 1 | 8 | 10 |
| Section Round 2 | Section | 1 | 12 | as needed |
| Section Round 3 (Full House) | Section | 1 | 16 | as needed |

## 2. Check-in ({site.checkInDate})

Riders present their code at the desk, at {site.url}/admin/check-in. Only riders who checked in can be drawn into the first round, and a team needs all four. The desk can take each rider's photo, which the commentary panel then shows.

## 3. Draw the start list

On the first Single round press **Draw start list**. The site shuffles every checked-in rider into balanced pools (9, 8 and 8, never 10, 10 and 5) and lays the runs out round by round: Round 1 is Pool A, B, C; then Round 2 is Pool A, B, C; then Round 3. Print the **Pool Sheet** for the notice board. The draw is automatic; pressing the button is the one deliberate step, because it must wait for check-in to close.

# On the day, solo — set live, call, Start, score

<!-- diagram: pools -->

1. **Set live** on the Qualification round. Every screen switches to it. Nobody is on course.
2. **Call Pool A**. The screens show Pool A's riders with "get ready" and the commentator reads the names. Still nobody on course.
3. The first rider reaches the start. The judge taps **Start Harpreet Singh Sandhu**. Now he is on course, on every screen.
4. He rides. The judge taps **CARRIED 4**, **STRUCK 2** or **MISS 0**, then **Confirm**.
5. The rider leaves. Nobody is on course; the screens show his result and "Up next: Gurjeet Singh Brar".
6. The judge taps **Start Gurjeet Singh Brar** when he is ready. Repeat.
7. When Pool A's Round 1 is done, the judge or an organiser presses **Call Pool B**, and the same again.
8. After every pool has ridden Round 1, the calls come round again for Round 2, then Round 3. A rider who carries in the qualification does not ride their remaining attempts; the panel skips them.
9. When the round is complete, the **Aarhi** rounds are drawn from the riders who went through, and the day continues the same way, one attempt each, down to the Final.

> **Mistakes.** **Undo last result** puts the last rider back on course with no result. **Change result** fixes a wrong tap. **Skip run** is for a rider who does not ride. All of it is recorded in the audit log with who did it.

# From solo to teams — it is just the next round

There is no switch from solo to teams. The Section rounds are simply the next rounds in the list, and an organiser makes the first one live when the last Single round has finished.

1. On {site.url}/admin/scoring, **Set live** on **Section Round 1**. Every screen switches to it.
2. **Draw start list**: every team with all four riders checked in, in balanced pools of teams.
3. **Call Pool A**, then the judge taps **Start** for the first rider of the first team, leader first. The four riders of a team ride one after another; their four scores are added up against the round's target (8 in round 1, 12 in round 2, 16 from round 3).
4. Everything else is the same: Start, score, Confirm, next.

# The demo — practise safely, on every device

- **Where:** {site.url}/judge/demo on phones and {site.url}/commentary/demo on a laptop, signed in with any staff account. Everyone is on **one** shared demo: a judge's tap on a phone shows on the laptop within two seconds. **Reset training data** restarts it for everyone.
- **The stream can rehearse too.** The graphics team adds **?sample=demo** to a feed or overlay address and sees exactly what the judges are doing in the demo. The scripted **?sample=solo** loop is still there for testing on their own.
- **It cannot touch the real scores.** The demo keeps its own copy in its own place. The real panels at /judge and /commentary never read it, and the demo never writes to the real results. Every demo page carries an orange TRAINING MODE banner.
- **On event day, close it.** On {site.url}/admin/scoring, press **Close demo**. A forgotten demo page then says "Demo closed for the event" with a button to the live panel, and a forgotten demo feed shows frozen sample rows marked SAMPLE, never anything real. Open it again after the event.

# If something goes wrong — three habits

- **The site is slow or offline.** Judges keep scoring: every tap is saved on the server before the phone confirms it, and the panel says **Offline** in red until it reconnects. If it stays down, use the printed pool sheet, then enter the results in order when it is back.
- **Wrong rider on course.** The judge opens the **Start list**, finds the rider, and presses **Put on course**. Scoring the wrong rider by mistake is fixed with **Undo last result**.
- **Not sure what the screens show.** Look at the top of {site.url}/admin/scoring: it says the live round, the called pool, and the screen mode. The **Screens** card changes what the public sees without touching any result.
