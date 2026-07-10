import { getAppOrigin } from "@/lib/env";

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;

  try {
    // Some same-site browser fetches omit Origin. Referer is an acceptable
    // exact-origin fallback only when Origin is absent; a conflicting Origin
    // is never rescued by a same-site Referer.
    const requestOrigin = new URL(origin ?? referer ?? "");
    const appOrigin = new URL(getAppOrigin());
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
    if (requestOrigin.origin === appOrigin.origin) return true;

    // Production-mode Playwright builds use a reserved .test canonical origin
    // while the local server is reached over loopback HTTP. This exception is
    // impossible for salarypadi.com and keeps the production CSRF rule intact.
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const requestUrlOrigin = new URL(request.url);
    return (
      appOrigin.hostname.endsWith(".test") &&
      loopbackHosts.has(requestOrigin.hostname) &&
      requestOrigin.protocol === "http:" &&
      loopbackHosts.has(requestUrlOrigin.hostname) &&
      requestUrlOrigin.protocol === "http:" &&
      requestOrigin.origin === requestUrlOrigin.origin
    );
  } catch {
    return false;
  }
}

export function rejectCrossOriginRequest(request: Request): Response | null {
  if (isSameOriginRequest(request)) return null;

  return Response.json(
    { error: "The request origin could not be verified." },
    { status: 403 },
  );
}
