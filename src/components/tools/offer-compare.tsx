"use client";

import type { FormEvent } from "react";

import { trackEvent } from "@/lib/analytics/events";
import { offerComparisonResultResponseSchema } from "@/lib/afrotools/schemas";
import type { OfferComparisonResult } from "@/lib/offers";

import { buildOfferFromForm } from "./offer-compare-form";
import {
  OfferComparisonResults,
  type FxEvidence,
} from "./offer-comparison-results";
import { OfferFields } from "./offer-fields";
import {
  isToolResponseRecord,
  toolResponseError,
  useToolRequest,
} from "./use-tool-request";

function isFxEvidence(value: unknown): value is FxEvidence {
  return (
    isToolResponseRecord(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.rate === "number" &&
    Number.isFinite(value.rate) &&
    typeof value.source === "string" &&
    typeof value.updatedAt === "string" &&
    (value.freshness === "fresh" || value.freshness === "stale")
  );
}

function responseFxEvidence(body: Record<string, unknown>): FxEvidence[] {
  if (body.fxEvidence === undefined) return [];
  if (!Array.isArray(body.fxEvidence) || !body.fxEvidence.every(isFxEvidence)) {
    throw new Error("The comparison returned invalid FX evidence.");
  }
  return body.fxEvidence;
}

interface OfferToolResult {
  comparison: OfferComparisonResult;
  fxEvidence: FxEvidence[];
  providerNotice: string | null;
}

export function OfferCompare() {
  const {
    result: responseResult,
    error,
    loading,
    run,
  } = useToolRequest<OfferToolResult>("Check both offers and FX rates.");
  const result = responseResult?.comparison ?? null;
  const fxEvidence = responseResult?.fxEvidence ?? [];
  const providerNotice = responseResult?.providerNotice ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackEvent("tool_started", { tool_id: "offer_compare" });

    const completed = await run({
      endpoint: "/api/tools/offer-compare",
      createPayload: () => {
        const form = new FormData(event.currentTarget);
        const comparisonCurrency = String(form.get("comparison_currency") ?? "")
          .trim()
          .toUpperCase();
        if (!/^[A-Z]{3}$/.test(comparisonCurrency)) {
          throw new Error(
            "comparison currency must use a three-letter currency code.",
          );
        }

        const providerConsent = form.get("afrotools_consent") === "on";
        if (!providerConsent) {
          throw new Error("Allow the required AfroTools currency request.");
        }

        const offerA = buildOfferFromForm(form, "a");
        const offerB = buildOfferFromForm(form, "b");
        return {
          consent: providerConsent,
          input: { offerA, offerB, comparisonCurrency },
        };
      },
      parseResponse: (response, body) => {
        if (!response.ok) {
          throw new Error(
            toolResponseError(body, "The comparison could not be completed."),
          );
        }
        if (!isToolResponseRecord(body)) {
          throw new Error("The comparison returned an invalid response.");
        }

        const parsedResult = offerComparisonResultResponseSchema.safeParse(
          body.result,
        );
        if (!parsedResult.success) {
          throw new Error("The comparison returned an invalid response.");
        }

        return {
          comparison: parsedResult.data,
          fxEvidence: responseFxEvidence(body),
          providerNotice: typeof body.notice === "string" ? body.notice : null,
        };
      },
    });
    if (completed) {
      trackEvent("tool_completed", { tool_id: "offer_compare" });
    }
  }

  return (
    <div className="tool-workspace">
      <form className="contribution-form" onSubmit={submit}>
        <fieldset>
          <legend>Comparison basis</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="comparison_currency">Comparison currency</label>
              <input
                className="input"
                id="comparison_currency"
                name="comparison_currency"
                defaultValue="NGN"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                required
              />
            </div>
          </div>
          <p className="field-help">
            Required unit FX rates are fetched from AfroTools. SalaryPadi then
            performs the comparison deterministically and shows the rate source
            and timestamp.
          </p>
        </fieldset>
        <div className="offer-grid">
          <OfferFields prefix="a" title="Offer A" defaultCurrency="NGN" />
          <OfferFields prefix="b" title="Offer B" defaultCurrency="USD" />
        </div>
        <label className="checkbox provider-consent">
          <input type="checkbox" name="afrotools_consent" required />
          Allow SalaryPadi to request the required currency pairs from
          AfroTools. Offer amounts and terms are not sent to AfroTools.
        </label>
        <button className="button w-fit" type="submit" disabled={loading}>
          {loading ? "Comparing…" : "Compare offers"}
        </button>
      </form>
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}
      {providerNotice ? (
        <div className="notice notice-warning" role="status">
          {providerNotice}
        </div>
      ) : null}
      <OfferComparisonResults result={result} fxEvidence={fxEvidence} />
    </div>
  );
}
