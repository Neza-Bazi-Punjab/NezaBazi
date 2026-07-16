import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

const routes = [
  "",
  "/event",
  "/rules",
  "/register",
  "/login",
  "/players",
  "/rankings",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${site.url}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
