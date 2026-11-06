// iPhone launch images (public/splash/), listed in src/lib/ios-splash-screens.ts.
// Each is a screenshot of the real splash (src/components/AppSplash.tsx) at
// one iPhone screen size, taken in Chrome, so the launch image and the splash
// that follows it match pixel for pixel (same logo, same Oswald lettering).
//
// Run from the repo root with the site running (npm run dev) and Google
// Chrome installed. Re-run after changing the splash's look:
//   node scripts/make-ios-splash.mjs [http://localhost:3000]
// Set CHROME=/path/to/chrome if Chrome is not in the usual macOS place.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { IOS_SPLASH_SCREENS, iosSplashFile } from "../src/lib/ios-splash-screens.ts";

const siteUrl = process.argv[2] ?? "http://localhost:3000";
const chromePath =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nbp-splash-"));
const chrome = spawn(
  chromePath,
  [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "about:blank"],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let target;
  for (let tries = 0; !target && tries < 50; tries++) {
    await sleep(200);
    target = await fetch(`http://localhost:${port}/json/new?about:blank`, { method: "PUT" })
      .then((response) => response.json())
      .catch(() => undefined);
  }
  if (!target) throw new Error(`Chrome did not start (${chromePath})`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    // Only replies to our own numbered requests; Chrome's other messages
    // (events) have no id and are ignored.
    if (!Number.isInteger(message.id) || !pending.has(message.id)) return;
    const settle = pending.get(message.id);
    pending.delete(message.id);
    if (typeof settle === "function") settle(message);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) =>
        message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)
      );
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  // Show the splash as the installed app would (headless Chrome cannot pretend
  // to be an installed app, so its "installed app only" rule is switched on),
  // held still with the logo centred on the whole screen, and without the
  // Next.js dev badge.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${() => {
      // The splash shows once per session; start every screenshot fresh.
      sessionStorage.clear();
      const showSplash = () => {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.media?.mediaText.includes("display-mode")) rule.media.mediaText = "all";
            }
          } catch {
            // A stylesheet from another site: not ours, skip it.
          }
        }
      };
      window.__nbpShowSplash = showSplash;
      document.addEventListener("DOMContentLoaded", () => {
        showSplash();
        const style = document.createElement("style");
        style.textContent =
          "html{--app-splash-shift:0px!important}" +
          ".app-splash,.app-splash-edge,.app-splash-content{animation:none!important}" +
          "nextjs-portal{display:none!important}";
        document.head.append(style);
      });
    }})()`,
  });

  const outDir = "public/splash";
  fs.mkdirSync(outDir, { recursive: true });

  for (const screen of IOS_SPLASH_SCREENS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: screen.width,
      height: screen.height,
      deviceScaleFactor: screen.ratio,
      mobile: true,
    });
    await send("Page.navigate", { url: siteUrl });
    await sleep(1500);
    await send("Runtime.evaluate", {
      expression: "window.__nbpShowSplash(); document.fonts.ready.then(() => true)",
      awaitPromise: true,
    });
    await sleep(300);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join("public", iosSplashFile(screen));
    // Flat bronze and a logo: a 256-colour PNG keeps it sharp and small.
    await sharp(Buffer.from(data, "base64"))
      .png({ palette: true, colours: 256, compressionLevel: 9 })
      .toFile(file);
    console.log(`${file}  (${screen.phones})`);
  }

  socket.close();
} finally {
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
