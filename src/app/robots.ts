import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/env";
import { PROTECTED_CRAWLER_DISALLOW } from "@/lib/security/protected-paths";

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
      // Every signed-in page comes from the same list the request proxy
      // enforces, so a newly protected route can never stay crawlable.
      disallow: ["/api/", "/auth/", ...PROTECTED_CRAWLER_DISALLOW],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
