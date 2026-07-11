import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const origin = getAppOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/about",
        "/methodology",
        "/trust-and-safety",
        "/privacy",
        "/terms",
        "/tools/",
        "/guides/",
        "/insights/",
        "/feed.xml",
      ],
      disallow: [
        "/api/",
        "/admin/",
        "/auth/",
        "/saved",
        "/applications",
        "/alerts",
        "/post-a-job",
        "/contribute/salary",
        "/contribute/review",
        "/contribute/interview",
        "/jobs/",
        "/companies/",
        "/salaries/",
      ],
    },
    sitemap: [`${origin}/sitemap.xml`, `${origin}/tools/sitemap.xml`],
    host: origin,
  };
}
