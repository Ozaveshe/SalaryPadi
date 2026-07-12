"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";

import {
  isGoogleAnalyticsRouteAllowed,
  sendGoogleAnalyticsPageView,
  setGoogleAnalyticsEnabled,
} from "@/lib/analytics/google";

type WebVitalMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

function reportWebVital(metric: WebVitalMetric) {
  if (
    typeof window === "undefined" ||
    !window.__salarypadiGoogleAnalyticsEnabled ||
    !isGoogleAnalyticsRouteAllowed(window.location.pathname)
  ) {
    return;
  }
  window.gtag?.("event", "web_vital", {
    metric_name: metric.name,
    metric_rating: metric.rating,
    value: Math.round(
      metric.name === "CLS" ? metric.value * 1000 : metric.value,
    ),
    non_interaction: true,
  });
}

export function GoogleAnalytics({
  measurementId,
  nonce,
}: {
  measurementId: string;
  nonce: string | null;
}) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const routeAllowed = isGoogleAnalyticsRouteAllowed(pathname);

  useReportWebVitals(reportWebVital);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!routeAllowed) return;

    window.dataLayer ??= [];
    window.gtag ??= (...args: unknown[]) => window.dataLayer?.push(args);
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500,
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      send_page_view: false,
      page_location: `${window.location.origin}${window.location.pathname}`,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_flags: "SameSite=Lax;Secure",
    });

    document.getElementById("salarypadi-google-analytics")?.remove();
    const script = document.createElement("script");
    script.async = true;
    script.id = "salarypadi-google-analytics";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    if (nonce) script.nonce = nonce;
    script.addEventListener("load", () => {
      setGoogleAnalyticsEnabled(measurementId, true);
      sendGoogleAnalyticsPageView(pathnameRef.current);
    });
    document.head.appendChild(script);

    return () => {
      setGoogleAnalyticsEnabled(measurementId, false);
      script.remove();
    };
  }, [measurementId, nonce, routeAllowed]);

  useEffect(() => {
    if (routeAllowed) sendGoogleAnalyticsPageView(pathname);
  }, [pathname, routeAllowed]);

  return null;
}
