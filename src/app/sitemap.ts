import type { MetadataRoute } from "next";

import { getPublishedEditorial } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";

const routes = [
  "",
  "/about",
  "/methodology",
  "/trust-and-safety",
  "/privacy",
  "/terms",
  "/contribute",
  "/guides/remote-jobs-open-to-nigerians",
  "/insights",
  "/tools",
  "/tools/take-home-pay",
  "/tools/salary-converter",
  "/tools/offer-compare",
  "/tools/job-scam-checker",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getAppOrigin();
  const articles = await getPublishedEditorial();
  const staticRoutes: MetadataRoute.Sitemap = routes.map((route, index) => ({
    url: `${origin}${route}`,
    lastModified:
      route.startsWith("/guides") || route === "/insights"
        ? "2026-07-11"
        : "2026-07-10",
    changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
    priority: route === "" ? 1 : index <= 3 ? 0.7 : 0.5,
  }));
  const briefs: MetadataRoute.Sitemap = articles
    .filter((article) => article.article_kind === "data_brief")
    .map((article) => ({
      url: `${origin}/insights/${article.slug}`,
      lastModified: article.updated_at,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
  return [...staticRoutes, ...briefs];
}
