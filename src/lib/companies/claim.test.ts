import { describe, expect, it } from "vitest";

import { companyClaimSchema } from "./claim";

const claim = {
  company_slug: "acme-limited",
  corporate_domain: "acme.co.uk",
  relationship: "employee",
  job_title: "Engineering manager",
  evidence_reference: "Public company registry filing 1234",
};

describe("company claim intake", () => {
  it("accepts an apex registrable corporate domain", () => {
    expect(companyClaimSchema.parse(claim)).toEqual(claim);
  });

  it.each(["co.uk", "careers.acme.co.uk", "127.0.0.1", "localhost.local"])(
    "rejects a non-corporate domain boundary: %s",
    (corporate_domain) => {
      expect(
        companyClaimSchema.safeParse({ ...claim, corporate_domain }).success,
      ).toBe(false);
    },
  );

  it.each(["manager@acme.co.uk", "+44 20 7946 0958"])(
    "rejects private contact evidence: %s",
    (evidence_reference) => {
      expect(
        companyClaimSchema.safeParse({ ...claim, evidence_reference }).success,
      ).toBe(false);
    },
  );
});
