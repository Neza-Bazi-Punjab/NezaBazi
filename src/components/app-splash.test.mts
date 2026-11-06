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
  assert.match(css, /\.app-splash,\s*\.app-splash-edge \{\s*display: none;\s*\}/);
  assert.match(
    css,
    /@media \(display-mode: standalone\) \{\s*\.app-splash,\s*\.app-splash-edge \{\s*position: fixed;/,
  );
  assert.match(css, /\.app-splash \{\s*top: 8px;\s*display: flex;/);
  // Fades out on its own and never blocks taps.
  assert.match(css, /pointer-events: none;/);
  assert.match(css, /@keyframes app-splash-out \{\s*to \{\s*opacity: 0;\s*visibility: hidden;/);
});

test("the splash shows once per app session, not on every page", () => {
  assert.match(splash, /sessionStorage\.getItem\("\$\{SPLASH_SESSION_KEY\}"\)/);
  assert.match(splash, /classList\.add\("app-splash-done"\)/);
  assert.match(css, /\.app-splash-done \.app-splash,/);
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

test("iPhone's status-bar strip turns the page colour before the page shows", () => {
  // A full-screen bronze layer touching the top clears first (0.4 s); the
  // logo screen beneath starts 8px lower and clears in one step at 0.7 s,
  // never fading the bronze.
  assert.match(splash, /<div className="app-splash-edge" aria-hidden="true" \/>/);
  assert.match(css, /\.app-splash-edge \{\s*display: block;\s*animation: app-splash-out 1ms step-end 400ms forwards;/);
  assert.match(css, /\.app-splash \{\s*top: 8px;[\s\S]*?animation: app-splash-out 1ms step-end 700ms forwards;/);
  assert.match(css, /\.app-splash-content \{[\s\S]*?animation: app-splash-fade 200ms ease-out 450ms forwards;/);
  assert.match(css, /\.app-splash-done \.app-splash,\s*\.app-splash-done \.app-splash-edge \{\s*display: none;/);
});

test("the logo is centred on the whole screen, like the iPhone launch image", () => {
  assert.match(splash, /var d=\(screen\.height-innerHeight\)\/2;if\(d>0&&d<80\)/);
  assert.match(css, /transform: translateY\(var\(--app-splash-shift, 0px\)\);/);
  // The script marks <html> before React loads.
  assert.match(layout, /suppressHydrationWarning/);
});

test("every listed iPhone size has a launch image, linked from the layout", async () => {
  const { IOS_SPLASH_SCREENS, iosSplashFile, iosSplashMedia } = await import(
    "../lib/ios-splash-screens.ts"
  );
  assert.ok(IOS_SPLASH_SCREENS.length >= 13);
  for (const screen of IOS_SPLASH_SCREENS) {
    assert.ok(existsSync(new URL(`../../public${iosSplashFile(screen)}`, import.meta.url)));
    assert.match(iosSplashMedia(screen), new RegExp(`device-width: ${screen.width}px\\) and \\(device-height: ${screen.height}px`));
  }
  assert.match(layout, /startupImage: IOS_SPLASH_SCREENS\.map/);
});
