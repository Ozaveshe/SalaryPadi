import { sendGoogleAnalyticsEvent } from "@/lib/analytics/google";

const eventNames = [
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
] as const;

export type AnalyticsEventName = (typeof eventNames)[number];

type SafeAnalyticsValue = string | number | boolean;
export type AnalyticsProperties = Record<string, SafeAnalyticsValue>;

export function isAnalyticsEventName(
  value: string,
): value is AnalyticsEventName {
  return (eventNames as readonly string[]).includes(value);
}

const prohibitedKeyPattern =
  /(salary|amount|review|interview|note|email|phone|name|address|cv|resume|identity|document|text|description)/i;

export function assertPrivacySafeAnalytics(
  properties: AnalyticsProperties,
): void {
  const prohibitedKey = Object.keys(properties).find((key) =>
    prohibitedKeyPattern.test(key),
  );

  if (prohibitedKey) {
    throw new Error(
      `Analytics property "${prohibitedKey}" is prohibited by SalaryPadi privacy policy.`,
    );
  }
}

export function trackEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  if (!eventNames.includes(name)) {
    throw new Error("Unknown analytics event.");
  }
  assertPrivacySafeAnalytics(properties);
  if (typeof window === "undefined") return;
  // Properties are validated at the call site but deliberately never
  // transmitted: the server stores only daily (event, route-group) totals.
  // Do not add them to the body without revisiting the privacy policy.
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: name, path: window.location.pathname }),
    keepalive: true,
  });
  if (name !== "page_view") sendGoogleAnalyticsEvent(name);
}
