import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { compareOffers, type OfferInput } from "@/lib/offers";

import { OfferComparisonResults } from "./offer-comparison-results";

function offer(overrides: Partial<OfferInput>): OfferInput {
  return {
    id: "offer",
    label: "Offer",
    basePay: { amount: 500_000, currency: "NGN", payPeriod: "monthly" },
    payBasis: "gross",
    terms: { arrangement: "employee", workMode: "remote" },
    ...overrides,
  };
}

describe("OfferComparisonResults", () => {
  it("labels calculations, estimates and unavailable take-home values truthfully", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: offer({
        id: "a",
        label: "Offer A",
        estimatedDeductions: [
          {
            label: "Entered deduction estimate",
            value: {
              amount: 100_000,
              currency: "NGN",
              payPeriod: "monthly",
            },
          },
        ],
      }),
      offerB: offer({ id: "b", label: "Offer B" }),
    });
    const markup = renderToStaticMarkup(
      createElement(OfferComparisonResults, { result, fxEvidence: [] }),
    );

    expect(markup).toContain("Calculated by SalaryPadi");
    expect(markup).toContain("Estimate");
    expect(markup).toContain("(est.)");
    expect(markup).toContain("Not calculated");
    expect(markup).toContain("Not known");
    expect(markup).not.toContain("Stated by the employer");
  });

  it("discloses how normalized values and user-supplied estimates were made", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: offer({
        id: "a",
        label: "Offer A",
        estimatedDeductions: [],
      }),
      offerB: offer({
        id: "b",
        label: "Offer B",
        payBasis: "net",
      }),
    });
    const markup = renderToStaticMarkup(
      createElement(OfferComparisonResults, { result, fxEvidence: [] }),
    );

    expect(markup).toContain("How these figures were calculated");
    expect(markup).toContain("Estimates and assumptions");
    expect(markup).toContain(
      "SalaryPadi did not estimate tax or statutory deductions",
    );
    expect(markup).toContain(
      "Omitted benefit fields contribute zero to this comparison",
    );
    expect(markup).toContain("Normalization rules and warnings");
  });
});
