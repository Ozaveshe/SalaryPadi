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

  it.each([
    ["jobs@acme.africa", "https://careers.acme.africa"],
    ["jobs@hiring.acme.co.uk", "https://www.acme.co.uk"],
  ])("matches legitimate corporate subdomains", (email, website) => {
    expect(assessCorporateEmail(email, website).domainMatches).toBe(true);
  });

  it("does not match a deceptive suffix domain", () => {
    expect(
      assessCorporateEmail(
        "jobs@evilacme.africa",
        "https://careers.acme.africa",
      ).domainMatches,
    ).toBe(false);
  });

  it("never treats a free mailbox as corporate verification", () => {
    expect(
      assessCorporateEmail("hiring@gmail.com", "https://acme.africa")
        .isFreeProvider,
    ).toBe(true);
  });

  it("recognises a free provider through a mailbox subdomain", () => {
    expect(
      assessCorporateEmail("hiring@mail.gmail.com", "https://gmail.com"),
    ).toMatchObject({ domainMatches: true, isFreeProvider: true });
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

  it.each(["company_website", "application_url"] as const)(
    "rejects credentials embedded in %s",
    (field) => {
      const submission = {
        company_name: "Acme",
        corporate_email: "jobs@acme.africa",
        company_website: "https://acme.africa",
        title: "Engineer",
        description: "A".repeat(120),
        requirements: "Relevant professional experience.",
        location: "Lagos",
        work_mode: "hybrid",
        employment_type: "full_time",
        arrangement: "employee",
        experience_level: "mid",
        eligibility_scope: "nigeria",
        eligibility_evidence: "Applicants must be based in Nigeria.",
        visa_sponsorship: "no",
        relocation_support: "unclear",
        pay_period: "unknown",
        gross_net: "unknown",
        application_url: "https://acme.africa/jobs/engineer",
        authorization_attestation: "on",
      };

      expect(
        employerJobSubmissionSchema.safeParse({
          ...submission,
          [field]: "https://user:secret@acme.africa/private",
        }).success,
      ).toBe(false);
    },
  );
});
