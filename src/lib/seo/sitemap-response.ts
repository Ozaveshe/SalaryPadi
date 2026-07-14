import { renderSitemapXml, type SitemapKind } from "@/lib/seo/sitemap";
import { loadSitemapGroups } from "@/lib/seo/sitemap-data";

export async function createSitemapResponse(kind: SitemapKind) {
  const groups = await loadSitemapGroups();
  return new Response(renderSitemapXml(groups[kind]), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
