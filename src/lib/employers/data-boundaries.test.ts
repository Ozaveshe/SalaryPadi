import { describe, expect, it } from "vitest";

import {
  EMPLOYER_EDITABLE_FIELDS,
  EMPLOYER_FORBIDDEN_CAPABILITIES,
  PROTECTED_FIELDS,
  anyEmployerRoleAllows,
  mayEmployerEdit,
  maySell,
  roleAllows,
  type EmployerRole,
} from "./data-boundaries";

describe("employer-editable fields", () => {
  it("lets a verified employer manage its own presentation", () => {
    for (const field of EMPLOYER_EDITABLE_FIELDS) {
      const decision = mayEmployerEdit(field);
      expect(decision.allowed).toBe(true);
    }
  });

  it("labels everything an employer writes as employer-provided", () => {
    // Typing something does not make it a SalaryPadi-verified fact.
    const decision = mayEmployerEdit("company_description");
    expect(decision).toMatchObject({
      allowed: true,
      label: "employer_provided",
    });
  });

  it("refuses every field that carries independent evidence", () => {
    for (const field of Object.keys(PROTECTED_FIELDS)) {
      const decision = mayEmployerEdit(field);
      expect(decision.allowed, `${field} must not be employer-editable`).toBe(
        false,
      );
    }
  });

  it("refuses an unclassified field rather than permitting it", () => {
    // A field nobody has classified is a field nobody has thought about.
    const decision = mayEmployerEdit("some_new_field");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.appealPath).toBeNull();
    }
  });

  it("offers a dispute path for protected fields, not an edit path", () => {
    const decision = mayEmployerEdit("pay_reliability_aggregate");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.appealPath).toMatch(/dispute process/);
    }
  });

  it("never lets an employer touch the immutable source record", () => {
    expect(mayEmployerEdit("source_receipt").allowed).toBe(false);
  });

  it("never lets an employer reorder or delete reviews", () => {
    for (const field of [
      "review_order",
      "review_aggregate",
      "contribution_content",
    ]) {
      expect(mayEmployerEdit(field).allowed).toBe(false);
    }
  });
});

describe("what money cannot buy", () => {
  it("sells the things that are genuinely products", () => {
    for (const product of [
      "job_distribution",
      "featured_placement",
      "ats_integration",
      "applicant_analytics",
      "branded_content",
    ]) {
      expect(maySell(product).sellable).toBe(true);
    }
  });

  it("refuses to sell a verification badge", () => {
    const decision = maySell("verification_badge");
    expect(decision.sellable).toBe(false);
    if (!decision.sellable) {
      expect(decision.reason).toMatch(/the check is the product/);
    }
  });

  it("refuses to sell removal of valid negative information", () => {
    expect(maySell("negative_information_removal").sellable).toBe(false);
  });

  it("refuses to suppress pay-reliability data at any price", () => {
    const decision = maySell("pay_reliability_suppression");
    expect(decision.sellable).toBe(false);
    if (!decision.sellable) {
      expect(decision.reason).toMatch(/most harmful/);
    }
  });

  it("sells placement but not organic ranking", () => {
    expect(maySell("featured_placement").sellable).toBe(true);
    expect(maySell("organic_ranking").sellable).toBe(false);
  });

  it("refuses an unclassified commercial idea until it is classified", () => {
    // The awkward conversation happens at design time, not after a customer
    // has been promised something.
    expect(maySell("priority_eligibility_review").sellable).toBe(false);
  });
});

describe("role-based access", () => {
  it("gives every role only what its job needs", () => {
    expect(roleAllows("recruiter", "post_job")).toBe(true);
    expect(roleAllows("recruiter", "manage_billing")).toBe(false);
    expect(roleAllows("analyst", "view_analytics")).toBe(true);
    expect(roleAllows("analyst", "post_job")).toBe(false);
    expect(roleAllows("profile_editor", "edit_profile")).toBe(true);
    expect(roleAllows("profile_editor", "close_job")).toBe(false);
  });

  it("does not let the person who pays reach into the content", () => {
    const billing: EmployerRole = "billing_admin";
    expect(roleAllows(billing, "manage_billing")).toBe(true);
    for (const capability of [
      "post_job",
      "edit_profile",
      "view_analytics",
      "submit_response",
    ] as const) {
      expect(roleAllows(billing, capability)).toBe(false);
    }
  });

  it("keeps moderation and evidence outside every employer role, owner included", () => {
    for (const capability of EMPLOYER_FORBIDDEN_CAPABILITIES) {
      expect(
        anyEmployerRoleAllows(capability),
        `${capability} must be unreachable from any employer role`,
      ).toBe(false);
    }
  });

  it("never exposes contributor identity to an employer", () => {
    expect(anyEmployerRoleAllows("view_contributor_identity")).toBe(false);
  });

  it("lets an owner respond but never moderate", () => {
    expect(roleAllows("owner", "submit_response")).toBe(true);
    expect(anyEmployerRoleAllows("moderate_contributions")).toBe(false);
  });
});
