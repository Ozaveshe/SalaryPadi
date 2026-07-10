import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/env";

const routes = [
  "",
  "/about",
  "/methodology",
  "/trust-and-safety",
  "/privacy",
  "/terms",
  "/contribute",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getAppOrigin();
  return routes.map((route, index) => ({
    url: `${origin}${route}`,
    lastModified: "2026-07-10",
    changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
    priority: route === "" ? 1 : index <= 3 ? 0.7 : 0.5,
  }));
}
