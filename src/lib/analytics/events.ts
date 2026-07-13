import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
} from "@/lib/analytics/catalog";
import {
  isGoogleAnalyticsEnabled,
  sendGoogleAnalyticsEvent,
} from "@/lib/analytics/google";

export type { AnalyticsEventName } from "@/lib/analytics/catalog";

type SafeAnalyticsValue = string | number | boolean;
export type AnalyticsProperties = Record<string, SafeAnalyticsValue>;

export function isAnalyticsEventName(
  value: string,
): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
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
  if (!ANALYTICS_EVENT_NAMES.includes(name)) {
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
  if (name !== "page_view" && isGoogleAnalyticsEnabled()) {
    sendGoogleAnalyticsEvent(name);
  }
}
