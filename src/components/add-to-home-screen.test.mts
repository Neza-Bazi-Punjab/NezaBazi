import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const button = repoFile("src/components/AddToHomeScreen.tsx");
const home = repoFile("src/app/page.tsx");
const layout = repoFile("src/app/layout.tsx");

const css = repoFile("src/app/globals.css");

test("the home page has the Add to Home Screen button, floating round at the bottom right", () => {
  assert.match(home, /import AddToHomeScreen from "@\/components\/AddToHomeScreen";/);
  assert.match(home, /<AddToHomeScreen \/>\s*<\/>\s*\);\s*\}\s*$/);
  assert.doesNotMatch(home, /<AddToHomeScreen className/);
  // Fixed bottom right, above the home bar; a round 56px bronze button.
  assert.match(button, /fixed right-4 bottom-\[calc\(1\.25rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(button, /h-14 w-14 items-center justify-center rounded-full bg-bronze/);
  assert.match(button, /aria-label="Add Neza Bazi to your Home Screen"/);
});

test("\"Add the app\" shows beside the round button the whole time, and both are one button", () => {
  assert.match(
    button,
    /onClick=\{openSteps\}[\s\S]*?<span className="whitespace-nowrap[^"]*">\s*Add the app\s*<\/span>\s*<span className="flex h-14 w-14/,
  );
  // No slide-out: nothing ever hides the label.
  assert.doesNotMatch(button, /a2hs-label/);
  assert.doesNotMatch(css, /a2hs-label/);
  // It pops in once; reduced motion: no pop-in.
  assert.match(css, /\.a2hs \{\s*animation: a2hs-in 300ms/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.a2hs \{\s*animation: none;/);
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
  assert.match(button, /if \(isInstalledApp\(\)\) \{\s*return null;/);
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

test("it stays there, also after a tap; the × hides it only for this visit", () => {
  // A tap opens the steps (or Chrome's popup) and the button stays.
  assert.match(button, /const openSteps = async \(\) => \{\s*\/\/ Android/);
  assert.doesNotMatch(button, /hideForGood/);
  // The ×: sessionStorage, so it is back once the browser is closed.
  assert.match(button, /aria-label="Hide Add to Home Screen"/);
  assert.match(button, /onClick=\{hideForNow\}/);
  assert.match(button, /sessionStorage\.setItem\(DISMISS_KEY, "1"\)/);
  assert.match(button, /sessionStorage\.getItem\(DISMISS_KEY\) === "1"/);
  assert.doesNotMatch(button, /localStorage\.(get|set)Item\(DISMISS_KEY/);
  assert.equal((button.match(/try \{/g) ?? []).length >= 2, true);
});

test("on Android it never shows once the app is installed", () => {
  // Chrome's own answer, via related_applications in the manifest.
  assert.match(button, /getInstalledRelatedApps/);
  assert.match(button, /found\?\.platform === "android"/);
  const manifest = repoFile("src/app/manifest.ts");
  assert.match(manifest, /related_applications: \[\s*\{ platform: "webapp", url: `\$\{site\.url\}\/manifest\.webmanifest` \},/);
  // Installed right now: hides at once.
  assert.match(button, /const onInstalled = \(\) => setShowButton\(false\);/);
  // Opening the installed app marks the phone; Android's browser shares that storage.
  assert.match(button, /if \(isInstalledApp\(\)\) \{\s*try \{\s*window\.localStorage\.setItem\(INSTALLED_KEY, "1"\);/);
  assert.match(button, /window\.localStorage\.getItem\(INSTALLED_KEY\) === "1"/);
});

test("the panel lists the Safari steps, with an extra one for in-app browsers", () => {
  assert.match(button, /<dialog/);
  assert.match(button, /showModal\(\)/);
  assert.match(button, /aria-labelledby="add-to-home-screen-title"/);
  assert.match(button, /Tap <strong>Share<\/strong>/);
  // Share is in the bottom bar on older Safari, behind ⋯ on iOS 26; and
  // Add to Home Screen can be behind View More.
  assert.match(button, /Don&apos;t see it\? Tap <strong>⋯<\/strong> at the\s+bottom right, then <strong>Share<\/strong>/);
  assert.match(button, /Tap <strong>Add to Home Screen<\/strong>\. Not in the list\? Tap\{" "\}\s*<strong>View More<\/strong>/);
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
