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
        "/account",
        "/admin/",
        "/auth/",
        "/saved",
        "/applications",
        "/alerts",
        "/post-a-job",
        "/contribute/salary",
        "/contribute/review",
        "/contribute/benefits",
        "/contribute/pay-reliability",
        "/contribute/interview",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
