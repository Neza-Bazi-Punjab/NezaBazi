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
});

test("the splash shows only in the installed app, never on the website", () => {
  // Hidden by default, shown only inside the standalone (home-screen) media query.
  assert.match(css, /\.app-splash \{\s*display: none;\s*\}/);
  assert.match(
    css,
    /@media \(display-mode: standalone\) \{\s*\.app-splash \{[\s\S]*?display: flex;[\s\S]*?animation: app-splash-out/,
  );
  // Fades out on its own and never blocks taps.
  assert.match(css, /pointer-events: none;/);
  assert.match(css, /@keyframes app-splash-out \{\s*to \{\s*opacity: 0;\s*visibility: hidden;/);
});

test("the splash shows once per app session, not on every page", () => {
  assert.match(splash, /sessionStorage\.getItem\("\$\{SPLASH_SESSION_KEY\}"\)/);
  assert.match(splash, /classList\.add\("app-splash-done"\)/);
  assert.match(css, /\.app-splash-done \.app-splash \{\s*display: none;/);
});

test("the splash shows the logo mark and the name, hidden from screen readers", () => {
  assert.match(splash, /aria-hidden="true"/);
  assert.match(splash, /public\/brand\/logo-mark\.svg/);
  assert.ok(existsSync(new URL("../../public/brand/logo-mark.svg", import.meta.url)));
  assert.match(splash, /NEZA BAZI/);
  assert.match(splash, /PUNJAB/);
  assert.match(splash, /font-display/);
});

test("Android's own launch screen uses the same bronze as the splash", () => {
  assert.match(manifest, /background_color: "#b45817"/);
  assert.match(css, /background-color: var\(--color-bronze\);/);
});
