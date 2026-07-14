"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { GoogleAnalytics } from "@/components/google-analytics";
import { analyticsConsentResponseSchema } from "@/lib/analytics/consent-contract";
import { trackEvent } from "@/lib/analytics/events";
import {
  clearGoogleAnalyticsCookies,
  setGoogleAnalyticsEnabled,
} from "@/lib/analytics/google";
import { discardResponseBody } from "@/lib/http/body";
import { readBoundedJson } from "@/lib/http/json";

const CONSENT_REQUEST_TIMEOUT_MS = 8_000;

type Consent = "granted" | "denied" | null;

export function AnalyticsConsent({
  initialConsent,
  measurementId,
  nonce,
}: {
  initialConsent: Consent;
  measurementId: string | null;
  nonce: string | null;
}) {
  const [consent, setConsent] = useState<Consent>(initialConsent);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (consent === "granted") trackEvent("page_view");
  }, [consent, pathname]);

  async function choose(allowed: boolean) {
    setPending(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/analytics/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.timeout(CONSENT_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        await discardResponseBody(response);
        setErrorMessage("Analytics choices could not be saved. Try again.");
        return;
      }
      const body = await readBoundedJson(response, 1_024);
      const acknowledgement = analyticsConsentResponseSchema.parse(body);
      if (acknowledgement.allowed !== allowed) {
        setErrorMessage("Analytics choices could not be confirmed. Try again.");
        return;
      }
      if (!allowed && measurementId) {
        setGoogleAnalyticsEnabled(measurementId, false);
        clearGoogleAnalyticsCookies();
      }
      setConsent(allowed ? "granted" : "denied");
      setEditing(false);
    } catch {
      setErrorMessage("Analytics choices are temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  const googleAnalytics =
    consent === "granted" && measurementId ? (
      <GoogleAnalytics measurementId={measurementId} nonce={nonce} />
    ) : null;

  if (consent !== null && !editing) {
    return (
      <>
        {googleAnalytics}
        <button
          className="analytics-consent-manage"
          onClick={() => setEditing(true)}
          type="button"
        >
          Analytics choices
        </button>
      </>
    );
  }
  return (
    <>
      {googleAnalytics}
      <aside
        aria-labelledby="analytics-consent-title"
        aria-modal="true"
        className="analytics-consent"
        role="dialog"
      >
        <div>
          <strong id="analytics-consent-title">Optional analytics</strong>
          <p>
            Help improve SalaryPadi with aggregate feature counts and Google
            Analytics on public pages. Google receives coarse page visits,
            browser/device context and performance metrics only after you allow
            it. Private routes, salary values, searches, notes, email addresses
            and free text are excluded. Read the{" "}
            <Link href="/privacy">privacy notice</Link>.
          </p>
        </div>
        <div className="analytics-consent-actions">
          <button
            className="button"
            disabled={pending}
            onClick={() => void choose(true)}
            type="button"
          >
            Allow optional analytics
          </button>
          <button
            className="button button-quiet"
            disabled={pending}
            onClick={() => void choose(false)}
            type="button"
          >
            {consent === "granted" ? "Turn off analytics" : "No thanks"}
          </button>
        </div>
        {errorMessage ? (
          <p className="field-help m-0" role="status" aria-live="polite">
            {errorMessage}
          </p>
        ) : null}
      </aside>
    </>
  );
}
