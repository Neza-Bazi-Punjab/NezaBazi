import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/* Web app manifest. On an iPhone, `display: "standalone"` is what makes the
   icon added through Add to Home Screen open the site full screen, like an
   app, instead of as a Safari tab (iOS 18 ignores the plain meta tag), and
   lets src/components/AddToHomeScreen.tsx hide its button once installed.
   The installed app keeps its own sign-in, separate from Safari's.

   Android (Chrome's own "Install app" popup) is the next step: it also needs
   192×192 and 512×512 icons here, which are added with that change. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.title,
    short_name: "Neza Bazi",
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdf8ef",
    theme_color: "#fdf8ef",
    icons: [{ src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
