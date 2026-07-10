import { describe, expect, it } from "vitest";

import {
  assessCorporateEmail,
  employerJobSubmissionSchema,
} from "./submission";

describe("employer submission", () => {
  it("recognises a matching corporate domain", () => {
    expect(
      assessCorporateEmail("jobs@careers.acme.africa", "https://acme.africa"),
    ).toMatchObject({ domainMatches: true, isFreeProvider: false });
  });

  it("never treats a free mailbox as corporate verification", () => {
    expect(
      assessCorporateEmail("hiring@gmail.com", "https://acme.africa")
        .isFreeProvider,
    ).toBe(true);
  });

  it("rejects an inverted salary range", () => {
    const result = employerJobSubmissionSchema.safeParse({
      company_name: "Acme",
      corporate_email: "jobs@acme.africa",
      company_website: "https://acme.africa",
      title: "Engineer",
      description: "A".repeat(120),
      requirements: "Relevant professional experience.",
      benefits: "",
      location: "Lagos",
      work_mode: "hybrid",
      employment_type: "full_time",
      arrangement: "employee",
      experience_level: "mid",
      eligibility_scope: "nigeria",
      included_countries: "Nigeria",
      excluded_countries: "",
      eligibility_evidence: "Applicants must be based in Nigeria.",
      timezone_overlap: "",
      work_authorization: "",
      visa_sponsorship: "no",
      salary_minimum: "900000",
      salary_maximum: "800000",
      currency: "NGN",
      pay_period: "monthly",
      gross_net: "gross",
      application_url: "https://acme.africa/jobs/engineer",
      deadline: "2026-08-01",
      authorization_attestation: "on",
    });
    expect(result.success).toBe(false);
  });
});
