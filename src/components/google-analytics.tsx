"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useState } from "react";

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
  const [ready, setReady] = useState(false);
  const routeAllowed = isGoogleAnalyticsRouteAllowed(pathname);

  useReportWebVitals(reportWebVital);

  useEffect(() => {
    if (!ready) return;
    setGoogleAnalyticsEnabled(measurementId, routeAllowed);
    return () => setGoogleAnalyticsEnabled(measurementId, false);
  }, [measurementId, ready, routeAllowed]);

  useEffect(() => {
    if (ready && routeAllowed) sendGoogleAnalyticsPageView(pathname);
  }, [pathname, ready, routeAllowed]);

  if (!routeAllowed) return null;

  const safeLocation = `window.location.origin + window.location.pathname`;
  const bootstrap = `
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
window.gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500
});
window.gtag('consent', 'update', {
  analytics_storage: 'granted',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});
window.gtag('js', new Date());
window.gtag('config', ${JSON.stringify(measurementId)}, {
  send_page_view: false,
  page_location: ${safeLocation},
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_flags: 'SameSite=Lax;Secure'
});`;

  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: bootstrap }}
        id="salarypadi-google-analytics-bootstrap"
        nonce={nonce ?? undefined}
        strategy="afterInteractive"
      />
      <Script
        id="salarypadi-google-analytics"
        nonce={nonce ?? undefined}
        onReady={() => setReady(true)}
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
    </>
  );
}
