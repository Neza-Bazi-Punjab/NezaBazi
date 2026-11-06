/* The brief logo screen the installed app shows as it opens, like a native
   app: the bronze NBP mark and "NEZA BAZI / PUNJAB" in the middle of a
   full-screen cream (the page's own background, so iPhone's strip behind
   the clock is the same colour all the way through; see globals.css), for
   half a second, then the whole screen fades into the page.

   Only in the installed app (opened from the home-screen icon, on iPhone or
   Android): the CSS in globals.css shows it under
   `@media (display-mode: standalone)` and hides it everywhere else, so
   ordinary visitors never see it. It is plain HTML and CSS, so it appears
   with the very first paint.

   Once per app session: the small script marks the session, and later full
   page loads in the same session (a sign-in redirect, a pull-to-refresh)
   skip it.

   On Android, Chrome's own launch screen before this uses the manifest's
   background_color (the same cream). iPhone on iOS 26 shows its own black
   screen first; a website cannot change that. */
import { readFileSync } from "node:fs";
import path from "node:path";

/* The mark's outline, read once from the brand file (public/brand/README.md)
   and drawn inline, so the logo appears instantly with no extra download. */
const markPath =
  readFileSync(path.join(process.cwd(), "public/brand/logo-mark.svg"), "utf8").match(
    /<path[^>]*\sd="([^"]+)"/
  )?.[1] ?? "";

/* "NEZA BAZI / PUNJAB" in Oswald, drawn as shapes rather than live text
   (made by scripts/make-splash-wordmark.py), for the same reason: live text
   would show in a fallback font until the web font loads, then swap and
   make the name and logo jump. */
const wordmark = readFileSync(
  path.join(process.cwd(), "public/brand/splash-wordmark.svg"),
  "utf8"
);
const [wordmarkWidth, wordmarkHeight] = (
  wordmark.match(/viewBox="0 0 (\d+) (\d+)"/)?.slice(1) ?? ["0", "0"]
).map(Number);
const [namePath = "", placePath = ""] = [...wordmark.matchAll(/\sd="([^"]+)"/g)].map(
  (m) => m[1]
);

export const SPLASH_SESSION_KEY = "nbp-app-splash-shown";

/* Runs before the splash is drawn. Skips it if already shown this session;
   otherwise records it and sizes the splash to the phone's screen height.
   For its first few frames iPhone lays the page out as if the screen were
   shorter (without the clock area) and then corrects it; a splash sized by
   the page would move its logo down ~30pt mid-splash. The screen height
   never changes, so the logo stays put. (Portrait only; otherwise the CSS
   falls back to the page height.) */
const onceScript = `try{var h=document.documentElement;if(sessionStorage.getItem("${SPLASH_SESSION_KEY}")){h.classList.add("app-splash-done")}else{sessionStorage.setItem("${SPLASH_SESSION_KEY}","1");if(matchMedia("(orientation: portrait)").matches){h.style.setProperty("--app-splash-height",screen.height+"px")}}}catch(e){}`;

export default function AppSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: onceScript }} />
      <div className="app-splash" aria-hidden="true">
        <svg viewBox="299 240 502 528" className="app-splash-mark">
          <path d={markPath} fill="currentColor" />
        </svg>
        {/* NEZA BAZI / PUNJAB */}
        <svg
          viewBox={`0 0 ${wordmarkWidth} ${wordmarkHeight}`}
          width={wordmarkWidth}
          height={wordmarkHeight}
          className="mt-6 block"
        >
          <path d={namePath} fill="currentColor" />
          <path d={placePath} fill="currentColor" fillOpacity={0.8} />
        </svg>
      </div>
    </>
  );
}
