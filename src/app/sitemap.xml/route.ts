import { getAppOrigin } from "@/lib/env";
import { loadSitemapGroups } from "@/lib/seo/sitemap-data";
import { renderSitemapIndexXml } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const xml = renderSitemapIndexXml(getAppOrigin(), await loadSitemapGroups());
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
