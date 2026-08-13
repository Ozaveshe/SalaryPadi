import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScamChecker } from "./scam-checker";

describe("ScamChecker", () => {
  it("starts with vacancy text and progressively discloses structured evidence", () => {
    const markup = renderToStaticMarkup(createElement(ScamChecker));
    const detailsStart = markup.indexOf("<details");
    const detailsEnd = markup.indexOf("</details>");

    expect(markup.indexOf('name="vacancy_text"')).toBeLessThan(detailsStart);
    expect(markup).toContain("Add details for a stronger check (optional)");
    expect(markup.indexOf('name="employer_name"')).toBeGreaterThan(
      detailsStart,
    );
    expect(markup.indexOf('name="processing_acknowledgement"')).toBeGreaterThan(
      detailsEnd,
    );
    expect(markup).not.toContain('<details open=""');
  });

  it("keeps every structured answer field used by the API payload", () => {
    const markup = renderToStaticMarkup(createElement(ScamChecker));
    const names = [
      "employer_name",
      "recruiter_email",
      "official_domain",
      "application_url",
      "interview_channel",
      "fee_purpose",
      "fee_requested",
      "unrealistic_compensation",
      "employer_unclear",
      "instant_offer",
      "banking_requested",
      "identity_requested",
      "crypto_requested",
      "urgency",
      "domain_misspelled",
      "link_unrelated",
    ];

    for (const name of names) {
      expect(markup).toContain(`name=\"${name}\"`);
    }
  });
});
