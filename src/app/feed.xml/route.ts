import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const origin = getAppOrigin();
  const result = await getPublishedEditorialResult();
  const items = result.data
    .map((article) => {
      const path =
        article.slug === "remote-jobs-open-to-nigerians"
          ? `/guides/${article.slug}`
          : `/insights/${article.slug}`;
      const url = `${origin}${path}`;
      return `<item><title>${escapeXml(article.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><description>${escapeXml(article.description)}</description><pubDate>${new Date(article.published_at).toUTCString()}</pubDate></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>SalaryPadi Editorial</title><link>${escapeXml(origin)}</link><description>Evidence-led job guides and deterministic data briefs.</description><language>en-NG</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "X-SalaryPadi-Editorial-State": result.state,
      "Cache-Control":
        result.state === "ready"
          ? "public, max-age=0, s-maxage=900, stale-while-revalidate=3600"
          : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
