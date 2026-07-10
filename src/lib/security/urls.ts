const relativePathPattern = /^\/(?!\/)[^\u0000-\u001f\u007f]*$/;
const internalUrlBase = new URL("https://salarypadi.invalid");

export function safeRelativePath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    !relativePathPattern.test(value) ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, internalUrlBase);
    if (parsed.origin !== internalUrlBase.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function safeExternalUrl(value: string): URL | null {
  if (value.length > 2_048) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
