import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/env";

const routes = [
  "/tools",
  "/tools/take-home-pay",
  "/tools/salary-converter",
  "/tools/offer-compare",
  "/tools/job-scam-checker",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getAppOrigin();
  return routes.map((route) => ({
    url: `${origin}${route}`,
    changeFrequency: "monthly" as const,
    priority: route === "/tools" ? 0.8 : 0.7,
  }));
}
