"use client";

import { useEffect } from "react";

import {
  isAnalyticsEventName,
  trackEvent,
  type AnalyticsEventName,
} from "@/lib/analytics/events";

/**
 * One delegated listener for every `data-event` control.
 *
 * The 2026-08 audit found `data-event="outbound_apply_click"` decorating the
 * apply links with nothing reading it — the metric the product is judged by
 * was never captured. Elements opt in with the attribute; the name must be in
 * the analytics catalog, and only the name and pathname ever travel (the
 * server stores daily event × route-group totals and checks consent before
 * capturing anything).
 */
export function AnalyticsClickEvents() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const carrier = event.target.closest("[data-event]");
      if (!carrier) return;
      const name = carrier.getAttribute("data-event");
      if (!name || !isAnalyticsEventName(name)) return;
      trackEvent(name);
    }
    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}

/**
 * Records one catalog event when a surface renders — job_view, company_view,
 * salary_search. Rendered by the owning server component so the decision of
 * what counts as a view stays next to the page, not in a route-matching map.
 */
export function TrackView({ event }: { event: AnalyticsEventName }) {
  useEffect(() => {
    trackEvent(event);
  }, [event]);
  return null;
}
