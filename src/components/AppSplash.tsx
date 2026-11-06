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

export const SPLASH_SESSION_KEY = "nbp-app-splash-shown";

const onceScript = `try{if(sessionStorage.getItem("${SPLASH_SESSION_KEY}")){document.documentElement.classList.add("app-splash-done")}else{sessionStorage.setItem("${SPLASH_SESSION_KEY}","1")}}catch(e){}`;

export default function AppSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: onceScript }} />
      <div className="app-splash" aria-hidden="true">
        <svg viewBox="299 240 502 528" className="app-splash-mark">
          <path d={markPath} fill="currentColor" />
        </svg>
        <span className="mt-6 block font-display text-3xl font-bold tracking-[0.2em]">
          NEZA BAZI
        </span>
        <span className="mt-1.5 block pl-[0.45em] font-display text-sm font-semibold tracking-[0.45em] text-bronze/80">
          PUNJAB
        </span>
      </div>
    </>
  );
}
