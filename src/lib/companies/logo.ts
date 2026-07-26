import type { AfricanCompanyCatalogEntry } from "@/lib/companies/catalog";

const logoDirectory = "/logos";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function initials(name: string) {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function colorForSlug(slug: string) {
  let hash = 0;
  for (const character of slug)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const palette = ["#155e75", "#166534", "#1e3a8a", "#7c2d12", "#581c87"];
  return palette[hash % palette.length] ?? palette[0];
}

export function buildCompanyLogoFallback(entry: AfricanCompanyCatalogEntry) {
  const label = escapeXml(`${entry.name} monogram`);
  const text = escapeXml(initials(entry.name) || "C");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${label}"><rect width="128" height="128" rx="24" fill="${colorForSlug(entry.slug)}"/><text x="64" y="68" fill="#fff" font-family="Arial, sans-serif" font-size="42" font-weight="700" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
}

/**
 * The static path a self-hosted logo is served from, or null when the company
 * carries no logo record. Null is the normal state, not an error: the catalog
 * only names a file once one has been obtained and its provenance recorded.
 */
export function companyLogoStaticPath(entry: AfricanCompanyCatalogEntry) {
  return entry.logo ? `${logoDirectory}/${entry.logo.file}` : null;
}

function fallbackResponse(entry: AfricanCompanyCatalogEntry) {
  return new Response(buildCompanyLogoFallback(entry), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-SalaryPadi-Logo-State": "monogram_fallback",
    },
  });
}

/**
 * Public entry point for `/api/company-logos/{slug}`. In-app rendering reads
 * the static path directly and never reaches this route; it exists so the
 * documented public route keeps working, and so a logo added to or removed
 * from the catalog changes one place. Redirect rather than proxy: the bytes
 * are a CDN static asset, not something a function should carry.
 */
export function resolveCompanyLogo(entry: AfricanCompanyCatalogEntry) {
  const path = companyLogoStaticPath(entry);
  if (!path) return fallbackResponse(entry);
  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      Location: path,
      "X-Content-Type-Options": "nosniff",
      "X-SalaryPadi-Logo-State": "self_hosted_logo",
    },
  });
}
