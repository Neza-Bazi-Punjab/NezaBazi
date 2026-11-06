// Android home-screen icons: the NBP hexagon mark (public/brand/logo-mark.svg,
// wordmark cropped out by its viewBox) in cream on a full-bleed bronze square,
// matching src/app/apple-icon.png. Used by src/app/manifest.ts.
// Run from the repo root: node scripts/make-app-icons.mjs
import fs from "node:fs";

import sharp from "sharp";
const mark = fs.readFileSync("public/brand/logo-mark.svg", "utf8");
const d = mark.match(/<path[^>]*\sd="([^"]+)"/)[1];
const [vx, vy, vw, vh] = [299, 240, 502, 528];

// `share` = how much of the icon's width the mark takes. Maskable icons may be
// cut to a circle, so their mark stays inside the middle 80% safe zone.
const build = (share) => {
  const w = 512 * share;
  const h = (w * vh) / vw;
  const x = (512 - w) / 2;
  const y = (512 - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#b45817"/>
<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="hidden">
<path d="${d}" fill="#fdf8ef"/></svg></svg>`;
};

const out = [
  ["public/icons/icon-192.png", build(0.62), 192],
  ["public/icons/icon-512.png", build(0.62), 512],
  ["public/icons/icon-maskable-512.png", build(0.5), 512],
];
await (async () => {
  for (const [file, svg, size] of out) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
    console.log(file, size);
  }
})();
