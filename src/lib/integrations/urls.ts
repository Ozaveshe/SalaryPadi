export const AFROTOOLS_API_ORIGIN = "https://afrotools.com";
export const DEFAULT_AFROTOOLS_API_BASE = `${AFROTOOLS_API_ORIGIN}/api/v1`;

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function getAfroToolsApiBase(
  rawUrl: string,
  { allowLocal = false }: { allowLocal?: boolean } = {},
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("AfroTools API base URL is invalid.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "AfroTools API base URL cannot contain credentials or query data.",
    );
  }

  const normalizedPath = url.pathname.replace(/\/$/, "");
  if (url.origin === AFROTOOLS_API_ORIGIN && normalizedPath === "/api/v1") {
    return DEFAULT_AFROTOOLS_API_BASE;
  }

  const isAllowedLocal =
    allowLocal &&
    loopbackHosts.has(url.hostname) &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    normalizedPath === "/api/v1";
  if (isAllowedLocal) return `${url.origin}/api/v1`;

  throw new Error(
    "AfroTools API credentials may only be sent to afrotools.com.",
  );
}
