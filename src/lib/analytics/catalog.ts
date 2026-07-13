export const ANALYTICS_CATALOG = {
  eventNames: [
    "page_view",
    "job_search",
    "job_filter_applied",
    "job_view",
    "outbound_apply_click",
    "job_saved",
    "application_created",
    "application_status_changed",
    "alert_created",
    "salary_search",
    "company_view",
    "tool_started",
    "tool_completed",
    "contribution_started",
    "contribution_submitted",
    "content_reported",
  ],
  routeGroups: {
    exact: [
      "/",
      "/about",
      "/methodology",
      "/trust-and-safety",
      "/privacy",
      "/terms",
      "/post-a-job",
    ],
    prefixes: [
      "/jobs",
      "/companies",
      "/salaries",
      "/tools",
      "/auth",
      "/account",
      "/contribute",
    ],
    fallback: "/other",
  },
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_CATALOG.eventNames)[number];
export type AnalyticsRouteGroup =
  | (typeof ANALYTICS_CATALOG.routeGroups.exact)[number]
  | (typeof ANALYTICS_CATALOG.routeGroups.prefixes)[number]
  | typeof ANALYTICS_CATALOG.routeGroups.fallback;

export const ANALYTICS_EVENT_NAMES = ANALYTICS_CATALOG.eventNames;
export const ANALYTICS_ROUTE_GROUPS = [
  ...ANALYTICS_CATALOG.routeGroups.exact,
  ...ANALYTICS_CATALOG.routeGroups.prefixes,
  ANALYTICS_CATALOG.routeGroups.fallback,
] as const;
