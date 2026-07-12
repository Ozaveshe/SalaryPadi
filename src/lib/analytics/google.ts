import type { AnalyticsEventName } from "@/lib/analytics/events";

const privateRoutePrefixes = [
  "/admin",
  "/alerts",
  "/applications",
  "/auth",
  "/contribute",
  "/post-a-job",
  "/privacy/requests",
  "/saved",
] as const;

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __salarypadiGoogleAnalyticsEnabled?: boolean;
  }
}

export function isGoogleAnalyticsRouteAllowed(pathname: string): boolean {
  return !privateRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function setGoogleAnalyticsEnabled(
  measurementId: string,
  enabled: boolean,
): void {
  if (typeof window === "undefined") return;
  window.__salarypadiGoogleAnalyticsEnabled = enabled;
  Reflect.set(window, `ga-disable-${measurementId}`, !enabled);
  window.gtag?.("consent", "update", {
    analytics_storage: enabled ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

export function clearGoogleAnalyticsCookies(): void {
  if (typeof document === "undefined") return;
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=", 1)[0]?.trim();
    if (name === "_ga" || name?.startsWith("_ga_")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
}

export function sendGoogleAnalyticsEvent(name: AnalyticsEventName): void {
  if (
    typeof window === "undefined" ||
    !window.__salarypadiGoogleAnalyticsEnabled
  ) {
    return;
  }
  window.gtag?.("event", name);
}

export function sendGoogleAnalyticsPageView(pathname: string): void {
  if (
    typeof window === "undefined" ||
    !window.__salarypadiGoogleAnalyticsEnabled ||
    !isGoogleAnalyticsRouteAllowed(pathname)
  ) {
    return;
  }
  window.gtag?.("event", "page_view", {
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
    page_title: document.title,
  });
}
