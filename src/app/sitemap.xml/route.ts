import { getAppOrigin } from "@/lib/env";
import { loadSitemapData } from "@/lib/seo/sitemap-data";
import { renderSitemapIndexXml } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const { groups, states } = await loadSitemapData();
  const state = Object.values(states).every(
    (inventoryState) => inventoryState === "ready",
  )
    ? "ready"
    : "degraded";
  const xml = renderSitemapIndexXml(getAppOrigin(), groups);
  return new Response(xml, {
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
