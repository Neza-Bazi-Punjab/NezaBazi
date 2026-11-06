import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const splash = repoFile("src/components/AppSplash.tsx");
const css = repoFile("src/app/globals.css");
const layout = repoFile("src/app/layout.tsx");
const manifest = repoFile("src/app/manifest.ts");

test("the splash is in the root layout, before the page", () => {
  assert.match(layout, /import AppSplash from "@\/components\/AppSplash";/);
  assert.match(layout, /<body[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<AppSplash \/>/);
  // The once-per-session script marks <html> before React loads.
  assert.match(layout, /suppressHydrationWarning/);
});

test("the splash shows only in the installed app, never on the website", () => {
  assert.match(css, /\.app-splash \{\s*display: none;\s*\}/);
  assert.match(
    css,
    /@media \(display-mode: standalone\) \{\s*\.app-splash \{\s*position: absolute;\s*top: 0;\s*left: 0;\s*width: 100%;\s*height: 100lvh;[\s\S]*?display: flex;/,
  );
  assert.match(css, /pointer-events: none;/);
});

test("a full-screen cream holds for 0.5 s, then the whole screen fades away evenly", () => {
  // The page's own cream, with the logo in bronze, so iPhone's strip behind
  // the clock (painted by iOS from the page background) never changes colour.
  assert.match(
    css,
    /\.app-splash \{\s*position: absolute;[\s\S]*?background-color: var\(--background\);\s*color: var\(--color-bronze\);/,
  );
  assert.match(css, /animation: app-splash-out 400ms ease-in-out 500ms forwards;/);
  assert.match(css, /@keyframes app-splash-out \{\s*to \{\s*opacity: 0;\s*visibility: hidden;/);
});

test("the splash is not pinned to the screen, so iPhone never recolours the strip behind the clock", () => {
  // A fixed splash would be what iOS takes the strip's colour from, and the
  // strip would switch colour (late) when it went away.
  const rule = css.match(/@media \(display-mode: standalone\) \{\s*\.app-splash \{[^}]*\}/)?.[0] ?? "";
  assert.ok(rule, "standalone splash rule found");
  assert.doesNotMatch(rule, /position: fixed/);
  assert.doesNotMatch(css, /app-splash-edge/);
});

test("the splash shows once per app session, not on every page", () => {
  assert.match(splash, /sessionStorage\.getItem\("\$\{SPLASH_SESSION_KEY\}"\)/);
  assert.match(splash, /classList\.add\("app-splash-done"\)/);
  assert.match(css, /\.app-splash-done \.app-splash \{\s*display: none;/);
});

test("the splash shows the logo mark and the name in the middle, hidden from screen readers", () => {
  assert.match(splash, /aria-hidden="true"/);
  assert.match(splash, /public\/brand\/logo-mark\.svg/);
  assert.ok(existsSync(new URL("../../public/brand/logo-mark.svg", import.meta.url)));
  assert.match(splash, /NEZA BAZI/);
  assert.match(splash, /PUNJAB/);
  assert.match(css, /align-items: center;\s*justify-content: center;/);
});

test("Android's own launch screen uses the same cream as the splash and page", () => {
  assert.match(manifest, /background_color: "#f7efe4"/);
  assert.match(css, /--background: #f7efe4;/);
});
