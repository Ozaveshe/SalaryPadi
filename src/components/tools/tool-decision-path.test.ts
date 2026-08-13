import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToolDecisionPath } from "./tool-decision-path";

const context = {
  slug: "product-lead",
  title: "Product Lead",
  company: "Example Employer",
  companySlug: "example-employer",
  amount: 600_000,
  currency: "NGN",
  period: "monthly" as const,
};

describe("tool decision path", () => {
  it("carries public job context from take-home into offer comparison", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolDecisionPath, { current: "take-home", context }),
    );

    expect(markup).toContain("Continue the decision");
    expect(markup).toContain("/tools/offer-compare?from=product-lead");
    expect(markup).toContain("amount=600000");
    expect(markup).toContain('href="/applications"');
  });

  it("prefills a salary contribution only with context already on the page", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolDecisionPath, { current: "offer-compare", context }),
    );

    expect(markup).toContain(
      "/contribute/salary?role=Product+Lead&amp;company=Example+Employer",
    );
    expect(markup).toContain('href="/applications"');
  });

  it("returns a contextual safety check to its source role", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolDecisionPath, { current: "scam-checker", context }),
    );

    expect(markup).toContain('href="/jobs/product-lead"');
    expect(markup).toContain('href="/trust-and-safety"');
  });
});
