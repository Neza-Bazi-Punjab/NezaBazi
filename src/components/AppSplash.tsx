/* The brief logo screen the installed app shows as it opens, like a native
   app: the cream NBP mark and "NEZA BAZI / PUNJAB" on the bronze of the app
   icon, for about half a second, then it clears.

   Only in the installed app (opened from the home-screen icon, on iPhone or
   Android): the CSS in globals.css shows it under
   `@media (display-mode: standalone)` and hides it everywhere else, so
   ordinary visitors never see it. It needs no JavaScript to appear or
   disappear, so it paints with the very first HTML, before the rest of the
   page has loaded.

   Once per app session: the small script marks the session, and later full
   page loads in the same session (a sign-in redirect, a pull-to-refresh)
   skip it.

   Before this page has loaded, the phone shows its own launch screen:
   - iPhone (before iOS 26): the bronze launch images in public/splash/
     (made from this very splash by scripts/make-ios-splash.mjs, listed in
     layout.tsx). The logo sits in the middle of the whole screen there, so
     the script below centres it on the whole screen here too (the page
     itself starts under the status bar), and the hand-over does not jump.
   - iPhone on iOS 26: never downloads launch images (checked in the iOS
     26.5 simulator), and shows black until the page arrives. A website
     cannot change that.
   - Android: Chrome's launch screen uses the manifest's background_color
     (the same bronze) and icon. */
import { readFileSync } from "node:fs";
import path from "node:path";

/* The mark's outline, read once from the brand file (public/brand/README.md)
   and drawn inline, so the logo appears instantly with no extra download. */
const markPath =
  readFileSync(path.join(process.cwd(), "public/brand/logo-mark.svg"), "utf8").match(
    /<path[^>]*\sd="([^"]+)"/
  )?.[1] ?? "";

export const SPLASH_SESSION_KEY = "nbp-app-splash-shown";

/* Runs before the splash is drawn. Skips it if already shown this session;
   otherwise records it, and moves the logo up by half the status bar's
   height (the part of the screen above the page) so it is centred on the
   whole screen, like the iPhone launch image. */
const onceScript = `try{var h=document.documentElement;if(sessionStorage.getItem("${SPLASH_SESSION_KEY}")){h.classList.add("app-splash-done")}else{sessionStorage.setItem("${SPLASH_SESSION_KEY}","1");var d=(screen.height-innerHeight)/2;if(d>0&&d<80){h.style.setProperty("--app-splash-shift",-d+"px")}}}catch(e){}`;

export default function AppSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: onceScript }} />
      {/* Clears first, so iPhone's strip behind the clock turns the page's
          colour before the page shows; see globals.css. */}
      <div className="app-splash-edge" aria-hidden="true" />
      <div className="app-splash" aria-hidden="true">
        <div className="app-splash-content">
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
      </div>
    </>
  );
}
