# Neza Bazi Punjab Championship 2026

**The platform behind the 1st open tent-pegging championship in Punjab.**
It ran on 11 November 2026 in Amritsar. It handled online registration, the
check-in desk, live scoring by the judges, the public scoreboard and the
graphics on the live stream.

**Website:** [nezabazipunjab.com](https://www.nezabazipunjab.com)
&nbsp;·&nbsp; **Watch the event:** [YouTube live stream](https://youtube.com/live/XuGGgWDIclw)
&nbsp;·&nbsp; **Results:** [2026 stats](https://www.nezabazipunjab.com/stats)
&nbsp;·&nbsp; [Instagram](https://www.instagram.com/nezabazipanjab/)

---

## The event in numbers

| | |
| --- | --- |
| **5,000** | people watching the live stream at the same time |
| **500K+** | views on YouTube |
| **Millions** | of views across social media |
| **170+** | riders registered, online and on paper |
| **136** | riders checked in on the day |
| **21** | teams of 4 |
| **229** | runs scored live by the judges, across 9 rounds |

## What the site does

<table>
<tr>
<td width="50%" valign="top">

**Before the event**
- Solo and team registration with saved drafts and confirmation codes
- Paper forms typed in by staff, so riders without a phone could enter
- Google sign-in and rider accounts
- Install it on your phone (works as an app on iOS and Android)

**On the day**
- A check-in desk that finds a rider by any detail, takes their photo and
  forms teams on the spot
- An admin dashboard with staff roles and a full audit log (1,700+ actions)

</td>
<td width="50%" valign="top">

**Live scoring**
- Judges score each run from their phones
- A scoring engine with an Automatic mode. It draws the qualifying pools,
  works out who goes through each round and sets up the Final.
  Team rounds have targets of 8, 12 and 16 points.
- A public scoreboard and a commentary screen, both updated in about 1 second

**The broadcast**
- Live data feeds for vMix (JSON / CSV) and on-screen graphics: scorebug,
  rider lower-third with photo, leaderboard and ticker

</td>
</tr>
</table>

## How it's built

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage), hosted on Vercel
- **Database:** 73 Postgres functions and 11 triggers. Row Level Security,
  and every staff action is written to an audit log.
- **Live updates:** Supabase Realtime, with a polling fallback and edge
  caching, so thousands of viewers cost the database about one read a second
- **Tests:** 548 automated tests using Node's built-in test runner

| | |
| --- | --- |
| Built in | about 4 months (July to November 2026) |
| Code | ~58,000 lines of TypeScript, 36 database migrations |
| History | 270 commits, 79 merged pull requests |
| Pages | 46 pages and 50 API routes |
