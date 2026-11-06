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

test("the button is for phones only (iPhone and Android), never the installed app", () => {
  assert.match(button, /^"use client";/);
  // iPhone (or iPod), or an Android phone ("Mobile"; Android tablets lack it),
  // with a touch screen: never iPad, Android tablet, laptop or desktop.
  assert.match(button, /\/iPhone\|iPod\/\.test\(userAgent\)/);
  assert.match(button, /\/Android\/\.test\(userAgent\) && \/Mobile\/\.test\(userAgent\)/);
  assert.match(button, /\(pointer: coarse\)/);
  // Opened from the home-screen icon: hidden.
  assert.match(button, /\(display-mode: standalone\)/);
  assert.match(button, /\.standalone === true/);
  // Nothing is drawn until the browser has been checked, so desktop never
  // sees it flash.
  assert.match(button, /useState<Phone \| null>\(null\)/);
  assert.match(button, /if \(!phone\) \{\s*return null;/);
});

test("on Android the button shows Chrome's own install popup when offered", () => {
  // Caught as soon as the file loads, in case Chrome offers before React is
  // ready; Chrome's own bar is held back only where our button will show.
  assert.match(button, /addEventListener\("beforeinstallprompt"/);
  assert.match(button, /detectPhone\(\)\?\.platform !== "android"/);
  assert.match(button, /event\.preventDefault\(\);/);
  // Tapping the button uses the offer once, then hides on "accepted".
  assert.match(button, /await offer\.prompt\(\);/);
  assert.match(button, /outcome === "accepted"/);
  // Installed some other way (Chrome's menu): hide too.
  assert.match(button, /addEventListener\("appinstalled"/);
  // No offer (other browsers, or already used): the menu steps instead.
  assert.match(button, /Tap the <strong>⋮<\/strong> menu at the top right of Chrome/);
  assert.match(button, /<strong>Install app<\/strong>/);
  assert.match(button, /Samsung Internet/);
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
  assert.match(button, /<strong>Open in Chrome<\/strong>/);
  // Agreed: no video until Mani asks for one.
  assert.doesNotMatch(button, /<video|youtube|iframe/i);
});

test("the home-screen icon opens the site full screen, named Neza Bazi", () => {
  assert.match(
    layout,
    /appleWebApp: \{ capable: true, title: "Neza Bazi", statusBarStyle: "black-translucent" \}/
  );
});

test("the web app manifest makes the site installable on iPhone and Android", () => {
  // iPhone: the display mode opens the icon full screen (iOS 18 ignores the
  // meta tag alone). Android: Chrome needs 192 and 512 icons to offer it.
  const manifest = repoFile("src/app/manifest.ts");
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /short_name: "Neza Bazi"/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(manifest, /src: "\/icons\/icon-192\.png", sizes: "192x192"/);
  assert.match(manifest, /src: "\/icons\/icon-512\.png", sizes: "512x512"/);
  assert.match(manifest, /purpose: "maskable"/);
  for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    assert.ok(readFileSync(new URL(`../../public/icons/${icon}`, import.meta.url)).length > 0);
  }
});
