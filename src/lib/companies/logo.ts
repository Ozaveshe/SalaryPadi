import type { AfricanCompanyCatalogEntry } from "@/lib/companies/catalog";
import { readBoundedBody } from "@/lib/http/body";

const maxLogoBytes = 1024 * 1024;
const acceptedContentTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

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

function fallbackResponse(
  entry: AfricanCompanyCatalogEntry,
  state: "monogram_fallback" | "provider_unavailable",
) {
  return new Response(buildCompanyLogoFallback(entry), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-SalaryPadi-Logo-State": state,
    },
  });
}

export async function resolveCompanyLogo(
  entry: AfricanCompanyCatalogEntry,
  publishableKey: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!publishableKey) return fallbackResponse(entry, "monogram_fallback");

  const providerUrl = new URL(`https://img.logo.dev/${entry.domain}`);
  providerUrl.searchParams.set("token", publishableKey);
  providerUrl.searchParams.set("size", "128");
  providerUrl.searchParams.set("format", "png");
  providerUrl.searchParams.set("theme", "light");
  providerUrl.searchParams.set("fallback", "404");

  try {
    const response = await fetcher(providerUrl, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "image/png,image/jpeg,image/webp" },
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0];
    const declaredLength = Number(
      response.headers.get("content-length") ?? "0",
    );
    if (
      !response.ok ||
      !contentType ||
      !acceptedContentTypes.has(contentType) ||
      (declaredLength > 0 && declaredLength > maxLogoBytes)
    ) {
      await response.body?.cancel().catch(() => undefined);
      return fallbackResponse(entry, "provider_unavailable");
    }
    const bytes = await readBoundedBody(response, maxLogoBytes);
    if (bytes.byteLength === 0 || bytes.byteLength > maxLogoBytes) {
      return fallbackResponse(entry, "provider_unavailable");
    }
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "X-SalaryPadi-Logo-State": "provider_logo",
      },
    });
  } catch {
    return fallbackResponse(entry, "provider_unavailable");
  }
}
