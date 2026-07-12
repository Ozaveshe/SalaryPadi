import { describe, expect, it } from "vitest";

import { buildOfferFromForm } from "./offer-compare-form";

function validForm(): FormData {
  const form = new FormData();
  form.set("a_label", "Lagos role");
  form.set("a_base", "250000");
  form.set("a_currency", " ngn ");
  form.set("a_period", "monthly");
  form.set("a_basis", "gross");
  form.set("a_arrangement", "employee");
  form.set("a_work_mode", "hybrid");
  return form;
}

describe("buildOfferFromForm", () => {
  it("builds a typed offer from validated form values", () => {
    const form = validForm();
    form.set("a_bonus", "100000");
    form.set("a_bonus_guaranteed", "on");
    form.set("a_health", "25000");
    form.set("a_commute", "12000");
    form.set("a_equipment_list", "Laptop, Monitor");

    expect(buildOfferFromForm(form, "a")).toMatchObject({
      id: "a",
      label: "Lagos role",
      basePay: {
        amount: 250000,
        currency: "NGN",
        payPeriod: "monthly",
      },
      payBasis: "gross",
      variablePay: [
        {
          kind: "bonus",
          guaranteed: true,
          value: { amount: 100000, currency: "NGN", payPeriod: "annual" },
        },
      ],
      benefits: [
        {
          kind: "health",
          value: { amount: 25000, currency: "NGN", payPeriod: "monthly" },
        },
      ],
      personalCosts: [
        {
          kind: "commute",
          value: { amount: 12000, currency: "NGN", payPeriod: "monthly" },
        },
      ],
      terms: {
        arrangement: "employee",
        workMode: "hybrid",
        equipmentProvided: ["Laptop", "Monitor"],
      },
    });
  });

  it("distinguishes an unknown deduction from an explicit zero estimate", () => {
    const unknown = buildOfferFromForm(validForm(), "a");
    expect(unknown.estimatedDeductions).toBeUndefined();

    const zeroForm = validForm();
    zeroForm.set("a_deductions", "0");
    expect(buildOfferFromForm(zeroForm, "a").estimatedDeductions).toEqual([]);
  });

  it("rejects missing required amounts instead of silently using zero", () => {
    const form = validForm();
    form.delete("a_base");

    expect(() => buildOfferFromForm(form, "a")).toThrow("a base is required.");
  });

  it("rejects tampered enum values before they reach the API", () => {
    const form = validForm();
    form.set("a_arrangement", "executive_magic");

    expect(() => buildOfferFromForm(form, "a")).toThrow(
      "a arrangement has an invalid value.",
    );
  });
});
