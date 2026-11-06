import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const button = repoFile("src/components/AddToHomeScreen.tsx");
const home = repoFile("src/app/page.tsx");
const layout = repoFile("src/app/layout.tsx");

test("the home page shows the Add to Home Screen button under the hero buttons", () => {
  assert.match(home, /import AddToHomeScreen from "@\/components\/AddToHomeScreen";/);
  assert.match(home, /Event Details\s*<\/ButtonLink>\s*<\/div>[\s\S]*<AddToHomeScreen /);
});

test("the button is for iPhones only, and never for the installed app", () => {
  assert.match(button, /^"use client";/);
  // iPhone (or iPod) with a touch screen: never iPad, laptop or desktop.
  assert.match(button, /\/iPhone\|iPod\/\.test\(userAgent\)/);
  assert.match(button, /\(pointer: coarse\)/);
  // Opened from the home-screen icon: hidden.
  assert.match(button, /\(display-mode: standalone\)/);
  assert.match(button, /\.standalone === true/);
  // Nothing is drawn until the browser has been checked, so desktop never
  // sees it flash.
  assert.match(button, /useState<Phone \| null>\(null\)/);
  assert.match(button, /if \(!phone\) \{\s*return null;/);
});

test("the × hides the button on that phone, even if storage is blocked", () => {
  assert.match(button, /localStorage\.getItem\(DISMISS_KEY\) === "1"/);
  assert.match(button, /localStorage\.setItem\(DISMISS_KEY, "1"\)/);
  assert.equal((button.match(/try \{/g) ?? []).length >= 2, true);
  assert.match(button, /aria-label="Hide Add to Home Screen"/);
});

test("the panel lists the Safari steps, with an extra one for in-app browsers", () => {
  assert.match(button, /<dialog/);
  assert.match(button, /showModal\(\)/);
  assert.match(button, /aria-labelledby="add-to-home-screen-title"/);
  assert.match(button, /Tap <strong>Share<\/strong>/);
  assert.match(button, /tap <strong>Add to Home Screen<\/strong>/);
  assert.match(button, /Tap <strong>Add<\/strong>/);
  assert.match(button, /Instagram\|FBAN\|FBAV/);
  assert.match(button, /<strong>Open in Safari<\/strong>/);
  // Agreed: no video until Mani asks for one.
  assert.doesNotMatch(button, /<video|youtube|iframe/i);
});

test("the home-screen icon opens the site full screen, named Neza Bazi", () => {
  assert.match(
    layout,
    /appleWebApp: \{ capable: true, title: "Neza Bazi", statusBarStyle: "default" \}/
  );
});

test("the web app manifest makes the iPhone icon open as an app", () => {
  // iOS 18 ignores the meta tag alone; the manifest's display mode is what
  // opens the icon full screen (checked in the iOS Simulator).
  const manifest = repoFile("src/app/manifest.ts");
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /short_name: "Neza Bazi"/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(manifest, /src: "\/apple-icon\.png"/);
});
