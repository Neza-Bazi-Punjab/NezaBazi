import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/* Web app manifest: what a phone uses when the site is added to its home
   screen (src/components/AddToHomeScreen.tsx).
   - iPhone: `display: "standalone"` makes the icon open the site full screen,
     like an app, instead of as a Safari tab (iOS 18 ignores the plain meta
     tag). The iPhone icon itself is src/app/apple-icon.png.
   - Android: Chrome offers "Install app" only when the manifest has a name,
     start URL, standalone display and 192×192 + 512×512 icons. The maskable
     icon keeps the mark inside the middle of the tile, so Android can cut it
     to a circle or rounded square without clipping the logo.
   Icons are made by scripts/make-app-icons.mjs from public/brand/logo-mark.svg.
   The installed app keeps its own sign-in, separate from the browser's. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.title,
    short_name: "Neza Bazi",
    description: site.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    /* Cream (the page background), like the app's logo screen (AppSplash):
       Android's own launch screen uses it, so the two run together. */
    background_color: "#f7efe4",
    theme_color: "#fdf8ef",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
