"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { trackEvent } from "@/lib/analytics/events";

type Consent = "granted" | "denied" | null;

export function AnalyticsConsent({
  initialConsent,
}: {
  initialConsent: Consent;
}) {
  const [consent, setConsent] = useState<Consent>(initialConsent);
  const [pending, setPending] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (consent === "granted") trackEvent("page_view");
  }, [consent, pathname]);

  async function choose(allowed: boolean) {
    setPending(true);
    try {
      const response = await fetch("/api/analytics/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed }),
      });
      if (response.ok) setConsent(allowed ? "granted" : "denied");
    } finally {
      setPending(false);
    }
  }

  if (consent !== null) return null;
  return (
    <aside
      aria-labelledby="analytics-consent-title"
      className="analytics-consent"
      role="dialog"
    >
      <div>
        <strong id="analytics-consent-title">
          Optional, aggregate analytics
        </strong>
        <p>
          Help improve SalaryPadi with page and feature counts. We never send
          salary values, searches, notes, email addresses, free text, IP
          addresses or device identifiers to analytics. Read the{" "}
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
          No thanks
        </button>
      </div>
    </aside>
  );
}
