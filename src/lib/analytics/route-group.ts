const exactRoutes = new Set([
  "/",
  "/about",
  "/methodology",
  "/trust-and-safety",
  "/privacy",
  "/terms",
  "/post-a-job",
]);

const groupedPrefixes = [
  "/jobs",
  "/companies",
  "/salaries",
  "/tools",
  "/auth",
  "/account",
  "/contribute",
] as const;

export function analyticsRouteGroup(pathname: string): string {
  const normalized = pathname.split("?", 1)[0]?.replace(/\/+$/, "") || "/";
  if (exactRoutes.has(normalized)) return normalized;
  return (
    groupedPrefixes.find(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    ) ?? "/other"
  );
}
