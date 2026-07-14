import { renderSitemapXml, type SitemapKind } from "@/lib/seo/sitemap";
import { loadSitemapData } from "@/lib/seo/sitemap-data";

export async function createSitemapResponse(kind: SitemapKind) {
  const { groups, states } = await loadSitemapData();
  const state = states[kind];
  return new Response(renderSitemapXml(groups[kind]), {
    status: state === "unavailable" ? 503 : 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "X-SalaryPadi-Sitemap-State": state,
      "Cache-Control":
        state === "ready"
          ? "public, max-age=0, s-maxage=900, stale-while-revalidate=3600"
          : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
