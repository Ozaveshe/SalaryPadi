import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { operatorJobIntakeSchema } from "@/lib/admin/job-intake";

function validPayload() {
  return {
    company_name: "Evidence Company",
    company_website: "https://example.test",
    title: "Platform Engineer",
    country_code: "ng",
    location: "Lagos, Nigeria",
    work_mode: "remote",
    employment_type: "full_time",
    arrangement: "employee",
    experience_level: "senior",
    eligibility_scope: "nigeria",
    eligibility_evidence:
      "The source explicitly accepts applicants in Nigeria.",
    included_countries: "Nigeria",
    excluded_countries: "",
    timezone_overlap: "",
    work_authorization: "",
    visa_sponsorship: "unclear",
    salary_minimum: "900000",
    salary_maximum: "1200000",
    currency: "NGN",
    pay_period: "monthly",
    gross_net: "gross",
    description: "A".repeat(120),
    requirements: "Relevant production engineering experience.",
    benefits: "",
    application_url: "https://example.test/jobs/platform/apply",
    deadline: "2026-09-01",
    source_url: "https://example.test/jobs/platform",
    source_evidence:
      "Employer job page with role, location and eligibility wording.",
    intake_reason: "Direct employer role relevant to Nigerian candidates.",
  };
}

describe("operatorJobIntakeSchema", () => {
  it("normalizes a complete source-backed intake payload", () => {
    const parsed = operatorJobIntakeSchema.parse(validPayload());
    expect(parsed.country_code).toBe("NG");
    expect(parsed.salary_minimum).toBe(900000);
    expect(parsed.excluded_countries).toBeUndefined();
  });

  it("requires currency and an ordered range when salary is supplied", () => {
    const payload = validPayload();
    payload.salary_minimum = "1200000";
    payload.salary_maximum = "900000";
    payload.currency = "";
    const parsed = operatorJobIntakeSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["salary_maximum", "currency"]),
      );
    }
  });

  it("rejects non-HTTPS evidence and unknown fields", () => {
    expect(
      operatorJobIntakeSchema.safeParse({
        ...validPayload(),
        source_url: "http://example.test/jobs/platform",
        invented_status: "published",
      }).success,
    ).toBe(false);
  });
});
