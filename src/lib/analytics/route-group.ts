import {
  ANALYTICS_CATALOG,
  type AnalyticsRouteGroup,
} from "@/lib/analytics/catalog";

const exactRoutes = ANALYTICS_CATALOG.routeGroups.exact;
const groupedPrefixes = ANALYTICS_CATALOG.routeGroups.prefixes;

export function analyticsRouteGroup(pathname: string): AnalyticsRouteGroup {
  const normalized = pathname.split("?", 1)[0]?.replace(/\/+$/, "") || "/";
  const exactRoute = exactRoutes.find((route) => route === normalized);
  if (exactRoute) return exactRoute;
  return (
    groupedPrefixes.find(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    ) ?? ANALYTICS_CATALOG.routeGroups.fallback
  );
}
