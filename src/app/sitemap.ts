import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Public pages only. The staff panels (/judge, /commentary, /admin) and the
// stream overlays (/overlay) are noindex and deliberately left out, and so is
// registration (/register, /register-team), which is for administrators only.
const routes = [
  "",
  "/event",
  "/rules",
  "/champions",
  "/gallery",
  "/stats",
  "/login",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${site.url}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
