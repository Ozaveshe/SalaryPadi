import { describe, expect, it } from "vitest";

import {
  containsLikelyPrivateContact,
  reviewContributionSchema,
  salaryContributionSchema,
} from "./schemas";

describe("contribution validation", () => {
  it.each(["manager@example.com", "+234 803 123 4567"])(
    "detects private contact data: %s",
    (value) => {
      expect(containsLikelyPrivateContact(value)).toBe(true);
    },
  );

  it("accepts a structured salary while preserving original currency and period", () => {
    const result = salaryContributionSchema.parse({
      role: "Product Designer",
      role_family: "Design",
      company: "",
      country: "ng",
      city: "Lagos",
      work_mode: "hybrid",
      employment_type: "full_time",
      arrangement: "employee",
      seniority: "mid",
      years_experience: "4",
      base_salary: "850000",
      currency: "NGN",
      pay_period: "monthly",
      gross_net: "gross",
      bonus: "",
      commission: "",
      equity: "",
      pension: "68000",
      health_cover: "",
      transport: "",
      housing: "",
      lunch: "",
      data_airtime: "",
      power_allowance: "",
      thirteenth_month: "",
      other_benefits: "",
      payment_reliability: "always_on_time",
      foreign_currency_policy: "",
      accuracy_attestation: "on",
    });
    expect(result).toMatchObject({
      country: "NG",
      base_salary: 850000,
      currency: "NGN",
      pay_period: "monthly",
    });
  });

  it("rejects contact details inside a workplace review", () => {
    const result = reviewContributionSchema.safeParse({
      company: "Acme",
      compensation_rating: "3",
      pay_reliability_rating: "3",
      management_rating: "3",
      work_life_rating: "3",
      growth_rating: "3",
      job_security_rating: "3",
      pension_compliance: "unclear",
      health_cover: "unclear",
      leave_quality: "3",
      overtime_expectation: "sometimes",
      weekend_work: "sometimes",
      remote_reality: "",
      support_provided: "",
      inclusion_rating: "3",
      safety_rating: "3",
      pros: "Good team",
      cons: "Call John on +234 803 123 4567",
      advice: "",
      employment_status: "former",
      role_family: "Engineering",
      employment_period: "1_to_2_years",
      anonymity_attestation: "on",
    });
    expect(result.success).toBe(false);
  });
});
