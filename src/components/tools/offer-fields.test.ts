import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OfferFields } from "./offer-fields";
import { BENEFIT_FIELDS, COST_FIELDS } from "./offer-compare-form";

function renderFields() {
  return renderToStaticMarkup(
    createElement(OfferFields, {
      prefix: "a",
      title: "Offer A",
      defaultCurrency: "NGN",
    }),
  );
}

describe("OfferFields", () => {
  it("keeps the core comparison inputs visible and progressively discloses optional detail", () => {
    const markup = renderFields();
    const firstDetails = markup.indexOf("<details");

    for (const name of [
      "a_label",
      "a_base",
      "a_currency",
      "a_period",
      "a_basis",
      "a_periods_per_year",
    ]) {
      expect(markup.indexOf(`name=\"${name}\"`)).toBeLessThan(firstDetails);
    }

    expect(markup.match(/<details/g)).toHaveLength(4);
    expect(markup).toContain("Add variable pay and deductions (optional)");
    expect(markup).toContain("Add monthly benefit values (optional)");
    expect(markup).toContain("Add monthly personal work costs (optional)");
    expect(markup).toContain("Add work and contract terms (optional)");
    expect(markup).not.toContain('<details open=""');
  });

  it("preserves every named field used by the offer payload builder", () => {
    const markup = renderFields();
    const namedFields = [
      "a_bonus",
      "a_bonus_guaranteed",
      "a_commission",
      "a_deductions",
      "a_arrangement",
      "a_work_mode",
      "a_leave",
      "a_commute_hours",
      "a_contract_months",
      "a_notice_days",
      "a_equipment_list",
      ...BENEFIT_FIELDS.map(([name]) => `a_${name}`),
      ...COST_FIELDS.map(([name]) => `a_${name}`),
    ];

    for (const name of namedFields) {
      expect(markup).toContain(`name=\"${name}\"`);
    }
  });
});
