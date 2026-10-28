import type { Metadata } from "next";
import Link from "next/link";
import { isSoloSampleOn } from "@/lib/scoring/rehearsal";
import { VMIX_FEEDS, VMIX_SAMPLE_SECTION_ROUND_ID } from "@/lib/scoring/vmix-columns";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Live data feed & overlays",
  description: "Live scoring data for vMix and other graphics systems, plus optional ready-made overlays.",
};

/* Rebuilt at most every 10 seconds, so the moving sample's On / Off line is
   at most that old when the page is opened. It does not update while open. */
export const revalidate = 10;

const overlays = [
  {
    path: "/overlay/scorebug",
    name: "Scorebug",
    looks:
      "A compact dark box in the top-left corner: round and pool on a small line, the rider on course in large capitals, their team or horse beneath, and a bronze “Now: Pool B · Next: Pool C” tab. When a result is recorded the scored rider and a coloured Carried 4 / Struck 2 / Miss 0 chip show for four seconds.",
  },
  {
    path: "/overlay/lower-third",
    name: "Lower third",
    looks:
      "A bar across the bottom-left, above the ticker: the rider's name in large capitals on a dark band with a bronze edge, and a bronze strip with team or horse, district and state, and the attempt. It slides in each time a new rider comes on course.",
  },
  {
    path: "/overlay/leaderboard",
    name: "Leaderboard",
    looks:
      "A centred standings table, ten rows at a time, cycling pages every eight seconds. Follows the pool that is riding.",
    variants: [
      { query: "?pool=A", text: "pin one pool (any label: A, B, C …)" },
      { query: "?all=1", text: "the whole round instead of one pool" },
    ],
  },
  {
    path: "/overlay/ticker",
    name: "Ticker",
    looks:
      "A full-width strip along the bottom cycling the latest results (“Harpreet Singh — Carried 4 · Pool B”) and the announcement message.",
  },
  {
    path: "/overlay/pool-call",
    name: "Pool call-up",
    looks:
      "A large card filling most of the frame — “Pool B — get ready” with the pool's riders in two columns and “Next: Pool C” at the foot. Shown only while a pool is being called; empty and transparent the rest of the time.",
  },
];

/* overflow-wrap: anywhere breaks a long URL on a narrow screen but leaves a
   short token such as ?all=1 whole, which break-all split mid-word. */
const code =
  "[overflow-wrap:anywhere] rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.95em] text-cream";
const heading = "font-display text-3xl font-bold uppercase tracking-wide text-cream";
const subheading = "font-display text-xl font-bold uppercase tracking-wide text-cream";
const steps = "list-decimal space-y-2 pl-6 text-cream/85";
const card = "rounded-2xl border border-cream/15 bg-white/5 p-5";

function ColumnList({ columns }: { columns: readonly string[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {columns.map((column) => (
        <li key={column}>
          <code className={code}>{column}</code>
        </li>
      ))}
    </ul>
  );
}

export default async function OverlayIndexPage() {
  const soloSampleOn = await isSoloSampleOn();
  const liveStateUrl = `${site.url}/api/live/state`;
  const sampleUrl = `${site.url}/api/live/vmix/current?sample=1`;
  const sampleCsvUrl = `${site.url}/api/live/vmix/leaderboard?sample=1&format=csv`;
  const sampleSectionUrl = `${site.url}/api/live/vmix/entrants?sample=1&round=${VMIX_SAMPLE_SECTION_ROUND_ID}`;
  const movingSampleUrl = `${site.url}/api/live/vmix/current?sample=solo`;

  return (
    <div className="min-h-dvh bg-ink text-cream">
      <div className="mx-auto max-w-4xl space-y-14 px-6 py-12 leading-7">
        <header>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-bronze">
            {site.title}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
            Live data feed &amp; overlays
          </h1>
          <p className="mt-4 max-w-2xl text-cream/80">
            Live scoring data for the stream&apos;s graphics team: every result, the rider on
            course, the pools and the standings, updated within a second or two of each judge&apos;s
            tap. Build your own titles from the data feed below; the ready-made overlays further
            down are optional.
          </p>
          <p className="mt-4 text-cream/75">
            <a
              href="/documents/vmix-guide.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-bronze underline-offset-4 hover:underline"
            >
              Handout (PDF)
            </a>{" "}
            — the feeds, every column, rehearsal and an event-day checklist, to print or pass on.
          </p>
        </header>

        {/* 1. Data feed: the graphics team's titles are built on this. --- */}
        <section aria-labelledby="vmix-data" className="space-y-8">
          <h2 id="vmix-data" className={heading}>
            Data feed for vMix
          </h2>

          <div className="space-y-4">
            <h3 className={subheading}>Set up a Data Source</h3>
            <ol className={steps}>
              <li>
                <strong>Settings</strong> → <strong>Data Sources</strong> → <strong>Add</strong> →{" "}
                <strong>JSON</strong> (or <strong>CSV</strong>).
              </li>
              <li>
                Paste one of the feed URLs below and set the refresh to every{" "}
                <strong>1–2 seconds</strong>. The feed is cached for one second at the edge, so a
                faster refresh gains nothing.
              </li>
              <li>
                In the <strong>GT Title Designer</strong>, bind a text field to a column. For
                feeds with many rows, use the Data Source row controls on the Title input to step
                through them.
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className={subheading}>Options</h3>
            <ul className="list-disc space-y-2 pl-6 text-cream/85">
              <li>
                <code className={code}>?format=csv</code> — CSV with a header row instead of JSON
                (add it with <code className={code}>&amp;</code> after another option, e.g.{" "}
                <code className={code}>?pool=A&amp;format=csv</code>).
              </li>
              <li>
                <code className={code}>?pool=A</code> — the leaderboard for one pool, ranked within
                it. <code className={code}>?limit=10</code> caps the rows.
              </li>
              <li>
                <code className={code}>?round=&lt;round_id&gt;</code> — entrants of another round;
                the ids are in the rounds feed.
              </li>
              <li>
                Every column is always present, as text or a number — never missing, never null.
                With nothing to show (before the event, between rounds) a feed returns one row of
                empty values, so your bindings keep working.
              </li>
            </ul>
          </div>

          <div className={`${card} space-y-3`}>
            <h3 className={subheading}>Rehearsal: sample data</h3>
            <p className="text-cream/85">
              Until event day the feeds are empty. Add <code className={code}>?sample=1</code> to
              any feed for realistic rehearsal rows — a qualification round with Pools A and B
              part-ridden and a rider on course, and a Section round of four-rider sides. Sample
              rows never touch the live database and never change between refreshes.
            </p>
            <p>
              <code className={code}>{sampleUrl}</code>
            </p>
            <p>
              <code className={code}>{sampleCsvUrl}</code>
            </p>
            <p className="text-cream/80">
              Every row has a <code className={code}>sample</code> column: <code className={code}>Yes</code>{" "}
              for rehearsal rows, <code className={code}>No</code> for live ones. Bind it to a
              &ldquo;SAMPLE&rdquo; badge so rehearsal data can never go to air unnoticed. A
              Section round&apos;s entrants, with each side&apos;s four riders in{" "}
              <code className={code}>members</code>:
            </p>
            <p>
              <code className={code}>{sampleSectionUrl}</code>
            </p>
            <p className="text-cream/85">
              To see your titles react to results, use <code className={code}>?sample=solo</code>{" "}
              instead: a scripted qualification that moves on every 8 seconds, on a loop of about
              four minutes — pools called, results in, a result changed and one undone, a run
              skipped, the screens switching. The organisers switch it on for you; while it is
              off it answers like <code className={code}>?sample=1</code>.
            </p>
            <p className="text-cream/85">
              Moving sample right now:{" "}
              <strong className="text-cream">
                {soloSampleOn ? "On" : "Off"}
              </strong>{" "}
              <span className="text-cream/60">(refresh this page to check again)</span>
            </p>
            <p>
              <code className={code}>{movingSampleUrl}</code>
            </p>
          </div>

          <div className="space-y-4">
            <h3 className={subheading}>The four feeds</h3>
            <ul className="space-y-4">
              {VMIX_FEEDS.map((feed) => (
                <li key={feed.path} className={card}>
                  <p className="font-display text-lg font-bold uppercase tracking-wide">{feed.title}</p>
                  <p className="mt-1">
                    <code className={code}>{`${site.url}${feed.path}${feed.example}`}</code>
                  </p>
                  <p className="mt-2 text-cream/80">{feed.rows}</p>
                  <p className="mt-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream/75">
                    Columns
                  </p>
                  <ColumnList columns={feed.columns} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2. Pushing values into titles. -------------------------------- */}
        <section aria-labelledby="vmix-bridge" className="space-y-2">
          <h2 id="vmix-bridge" className={heading}>
            Pushing values with the vMix API
          </h2>
          <p className="text-cream/85">
            Prefer vMix titles to be updated for you? A small local bridge script polls the current
            feed and pushes each changed value into a title through the vMix API — see{" "}
            <code className={code}>docs/live-stream.md</code>.
          </p>
        </section>

        {/* 3. Ready-made overlays: optional. ------------------------------ */}
        <section aria-labelledby="overlays" className="space-y-8">
          <div className="space-y-2">
            <h2 id="overlays" className={heading}>
              Ready-made overlays (optional)
            </h2>
            <p className="text-cream/80">
              Optional, if the graphics team prefers not to build their own: finished graphics
              in the website&apos;s style. Each overlay is a web page with a transparent
              background, designed for 1920 × 1080 and equally readable at 1280 × 720.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className={subheading}>In vMix: Web Browser inputs</h3>
            <ol className={steps}>
              <li>
                <strong>Add Input</strong> → <strong>More</strong> → <strong>Web Browser</strong>.
              </li>
              <li>Paste the overlay URL (see the list below).</li>
              <li>
                Set <strong>Width</strong> to <code className={code}>1920</code> and{" "}
                <strong>Height</strong> to <code className={code}>1080</code>, then press OK.
              </li>
              <li>
                The page background is transparent, so vMix keys it automatically — there is
                nothing to set up for keying.
              </li>
              <li>
                Put the input on an <strong>Overlay channel (1–4)</strong> with the overlay
                buttons on the input. Do not cut to it as a main input.
              </li>
              <li>
                Make <strong>one input per overlay</strong> — scorebug, lower third, leaderboard,
                ticker and pool call-up — so you can switch each one on and off on its own.
              </li>
              <li>
                The pool call-up overlay is empty except while a pool is being called, so it can
                stay on an overlay channel all day and appear by itself.
              </li>
              <li>
                The leaderboard follows the pool that is riding. Add{" "}
                <code className={code}>?pool=A</code> to the end of its URL to pin one pool, or{" "}
                <code className={code}>?all=1</code> for the whole round.
              </li>
              <li>
                If an input ever shows old information, right-click it and choose{" "}
                <strong>Reload</strong>.
              </li>
            </ol>
          </div>

          <div className="space-y-6">
            <h3 id="overlay-urls" className={subheading}>
              Overlay URLs
            </h3>
            <ul className="space-y-6">
              {overlays.map((overlay) => (
                <li key={overlay.path} className={card}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-lg font-bold uppercase tracking-wide">{overlay.name}</p>
                    <Link
                      href={overlay.path}
                      className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-bronze underline-offset-4 hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                  <p className="mt-2">
                    <code className={code}>{`${site.url}${overlay.path}`}</code>
                  </p>
                  <p className="mt-3 text-cream/80">{overlay.looks}</p>
                  {overlay.variants && (
                    <ul className="mt-3 space-y-1 text-cream/80">
                      {overlay.variants.map((variant) => (
                        <li key={variant.query}>
                          <code className={code}>{`${site.url}${overlay.path}${variant.query}`}</code>{" "}
                          — {variant.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 id="control" className={subheading}>
              What the judges control
            </h3>
            <p className="text-cream/85">
              The judges and administrators choose what every screen shows (the{" "}
              <code className={code}>display_mode</code> column of the current feed):
            </p>
            <ul className="list-disc space-y-2 pl-6 text-cream/85">
              <li>
                <strong>Scoreboard</strong> — the normal view: rider on course, results, standings.
              </li>
              <li>
                <strong>Standings</strong> (<code className={code}>leaderboard</code>) — the
                leaderboard overlay alone; the scorebug and lower third step aside.
              </li>
              <li>
                <strong>Rider</strong> (<code className={code}>rider</code>) — the rider on course
                alone; the leaderboard overlay steps aside.
              </li>
              <li>
                <strong>Pool call-up</strong> shows the pool call-up card; the scorebug and lower
                third shrink to their “Now / Next” line and the leaderboard steps aside until the
                first result of that pool.
              </li>
              <li>
                <strong>Message</strong> shows only the message bar along the bottom.
              </li>
              <li>
                <strong>Blank</strong> hides every overlay (breaks, ceremonies).
              </li>
            </ul>
            <p className="text-cream/75">
              When no round is live the overlays are simply transparent — that is expected, not a
              fault. Open any overlay URL in an ordinary browser tab to check it.
            </p>
          </div>
        </section>

        {/* Other graphics systems: the full state. ------------------------- */}
        <section aria-labelledby="feed" className="space-y-4">
          <h2 id="feed" className={heading}>
            Full JSON feed
          </h2>
          <p className="text-cream/85">
            Singular.live, CasparCG templates or your own graphics can read the complete live state
            from:
          </p>
          <p>
            <code className={code}>{liveStateUrl}</code>
          </p>
          <p className="text-cream/80">
            It includes <code className={code}>live.display_mode</code>,{" "}
            <code className={code}>live.message</code>, <code className={code}>current_round</code>,{" "}
            <code className={code}>current_run</code> (rider name, horse, team, home district),{" "}
            <code className={code}>last_scored_run</code>, <code className={code}>recent_results</code>,{" "}
            <code className={code}>up_next</code>, <code className={code}>leaderboard</code>,{" "}
            <code className={code}>pools</code>, <code className={code}>pool_rosters</code> and{" "}
            <code className={code}>next_pool_label</code>. Polling it every one or two seconds is
            fine. Before live scoring is set up it answers{" "}
            <code className={code}>{`"configured": false`}</code>.
          </p>
        </section>

        {/* OBS and the rest, last. ---------------------------------------- */}
        <section aria-labelledby="obs" className="space-y-4">
          <h2 id="obs" className={heading}>
            OBS Studio and other software
          </h2>
          <ol className={steps}>
            <li>
              In the scene, under <strong>Sources</strong>, press <strong>+</strong> and choose{" "}
              <strong>Browser</strong>.
            </li>
            <li>
              Paste an overlay URL into <strong>URL</strong>.
            </li>
            <li>
              Set <strong>Width</strong> to <code className={code}>1920</code> and{" "}
              <strong>Height</strong> to <code className={code}>1080</code>.
            </li>
            <li>
              Untick <strong>Shutdown source when not visible</strong>, so the overlay keeps its
              connection while you switch scenes.
            </li>
            <li>
              Clear the <strong>Custom CSS</strong> box completely (leave it blank).
            </li>
            <li>Press OK. Stack several overlays in one scene; they are laid out not to overlap.</li>
          </ol>
          <p id="other" className="text-cream/85">
            Streamlabs, Wirecast and any software with a “browser” or “web page” source work the
            same way: the overlay URL, 1920 × 1080, no custom CSS.
          </p>
          <p className="border-t border-cream/15 pt-6 text-cream/70">
            The overlays cannot be embedded in another site&apos;s iframe — that is blocked
            deliberately for security. vMix Web Browser inputs and OBS browser sources are not
            iframes, so they are unaffected.
          </p>
        </section>
      </div>
    </div>
  );
}
