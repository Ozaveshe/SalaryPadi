/**
 * The single source of truth for page paths that require a signed-in session.
 *
 * Two independent surfaces have to agree about this set. The request proxy
 * enforces it, and robots.txt keeps crawlers away from it. When each kept its
 * own copy they drifted: the proxy already protected `/dashboard`,
 * `/privacy/requests`, `/company-intelligence/requests` and the company
 * claim/respond actions while robots.txt still invited crawlers onto them,
 * spending crawl budget on paths that only ever answer a sign-in redirect.
 *
 * Anything added here is protected and hidden from crawlers together.
 */
export const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/account",
  "/saved",
  "/applications",
  "/alerts",
  "/admin",
  "/post-a-job",
  "/contribute/salary",
  "/contribute/review",
  "/contribute/interview",
  "/contribute/benefits",
  "/contribute/pay-reliability",
  "/privacy/requests",
  "/company-intelligence/requests",
  "/auth/mfa-required",
] as const;

/**
 * Company actions are protected per company, so they cannot be expressed as a
 * static prefix. `/companies/<slug>` and its public evidence tabs stay public.
 */
export const PROTECTED_COMPANY_ACTION_PATTERN =
  /^\/companies\/[^/]+\/(?:claim|respond)\/?$/;

/**
 * The same set expressed as robots.txt path rules. Google, Bing and Yandex all
 * support `*` wildcards in a `Disallow` value, which is how the per-company
 * actions are covered.
 */
export const PROTECTED_CRAWLER_DISALLOW: readonly string[] = [
  ...PROTECTED_PAGE_PREFIXES,
  "/companies/*/claim",
  "/companies/*/respond",
];

/**
 * The same set expressed as Next.js header `source` patterns, for the
 * `private, no-store` cache rules in next.config.ts.
 *
 * This was the third independent copy of the list and had drifted too:
 * /dashboard was protected by the proxy but absent here, so the signed-in
 * workspace shipped without a no-store directive. `:path*` matches zero or
 * more segments, so each entry also covers the bare prefix.
 */
export const PROTECTED_NO_STORE_SOURCES: readonly string[] = [
  ...PROTECTED_PAGE_PREFIXES.map((prefix) => `${prefix}/:path*`),
  // Defence in depth: every contribution route, including any added later.
  "/contribute/:path*",
  "/companies/:slug/claim",
  "/companies/:slug/respond",
];

export function isProtectedPagePath(pathname: string): boolean {
  return (
    PROTECTED_PAGE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) || PROTECTED_COMPANY_ACTION_PATTERN.test(pathname)
  );
}
