/* The brief logo screen the installed app shows as it opens, like a native
   app: the cream NBP mark and "NEZA BAZI / PUNJAB" on the bronze of the app
   icon, for about half a second, then a quick fade.

   Only in the installed app (opened from the home-screen icon, on iPhone or
   Android): the CSS in globals.css shows it under
   `@media (display-mode: standalone)` and hides it everywhere else, so
   ordinary visitors never see it. It needs no JavaScript to appear or
   disappear, so it paints with the very first HTML, before the rest of the
   page has loaded.

   Once per app session: the small script marks the session, and later full
   page loads in the same session (a sign-in redirect, a pull-to-refresh)
   skip it.

   On Android, Chrome's own launch screen uses the manifest's
   background_color (the same bronze) and icon, so it runs straight into this
   one without a flash. */
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
        <span className="mt-1.5 block pl-[0.45em] font-display text-sm font-semibold tracking-[0.45em] text-cream/80">
          PUNJAB
        </span>
      </div>
    </>
  );
}
