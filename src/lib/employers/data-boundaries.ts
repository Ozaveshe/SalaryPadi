/**
 * What a verified employer may change, and what no amount of money can buy.
 *
 * SalaryPadi sells employers real things — distribution, integrations,
 * analytics, branded content. It must never sell the thing that makes any of
 * it worth reading: that eligibility, salary and reliability evidence is
 * independent of whoever is paying.
 *
 * The boundary is expressed here as data rather than left to whoever writes
 * the next admin screen, because "can the employer edit this?" is exactly the
 * question that gets answered wrongly under commercial pressure, one field at
 * a time.
 */

export type FieldOwner =
  /** SalaryPadi verified it against a named source. */
  | "salarypadi_verified"
  /** The employer supplied it and it is labelled as theirs. */
  | "employer_provided"
  /** Derived from user contributions above privacy thresholds. */
  | "user_contributed_aggregate"
  /** Nobody has established it. */
  | "unknown";

export const EMPLOYER_EDITABLE_FIELDS = [
  "company_description",
  "careers_information",
  "locations",
  "benefits_statement",
  "hiring_process",
  "work_model",
  "contact_channel",
  "careers_links",
  "brand_assets",
  "response_statement",
] as const;

export type EmployerEditableField = (typeof EMPLOYER_EDITABLE_FIELDS)[number];

/**
 * Everything an employer may never write, with the reason. Each of these has
 * a plausible-sounding commercial argument attached to it, which is why the
 * reason is stored next to the rule.
 */
export const PROTECTED_FIELDS: Record<string, string> = {
  salary_aggregate:
    "Derived from user contributions. An employer editing it would make the figure an employer claim.",
  pay_reliability_aggregate:
    "Reports of late or missing pay are the evidence most damaging to suppress and most valuable to keep.",
  review_aggregate:
    "Employers may respond to review themes; they may not alter them.",
  review_order: "Reordering reviews is suppression with extra steps.",
  interview_aggregate: "Contributed by candidates about their own experience.",
  eligibility_evidence:
    "Eligibility is read from the posting's own wording, not from what an employer would prefer it said.",
  salary_confidence:
    "Confidence reflects evidence quality. Purchasing it would make the score meaningless.",
  verification_badge:
    "A badge means SalaryPadi checked something. Selling it means it means nothing.",
  regulator_status:
    "Read from official registers. An employer cannot edit a regulator's record.",
  organic_rank:
    "Paid placement is available and is labelled Sponsored. Organic order is not for sale.",
  source_receipt:
    "The immutable record of what a source said. Not editable by anyone.",
  contribution_content: "A user's own words about their own experience.",
};

export type BoundaryDecision =
  | { allowed: true; field: EmployerEditableField; label: FieldOwner }
  | { allowed: false; reason: string; appealPath: string | null };

/**
 * Whether a verified employer may write a field.
 *
 * Fails closed: an unrecognised field is refused rather than permitted,
 * because a field nobody has classified is a field nobody has thought about.
 */
export function mayEmployerEdit(field: string): BoundaryDecision {
  if ((EMPLOYER_EDITABLE_FIELDS as readonly string[]).includes(field)) {
    return {
      allowed: true,
      field: field as EmployerEditableField,
      // Everything an employer writes is labelled as theirs. It is never
      // promoted to a SalaryPadi-verified fact by virtue of who typed it.
      label: "employer_provided",
    };
  }

  const reason = PROTECTED_FIELDS[field];
  if (reason) {
    return {
      allowed: false,
      reason,
      appealPath:
        "Employers may dispute a specific record through the documented dispute process, which is reviewed by SalaryPadi.",
    };
  }

  return {
    allowed: false,
    reason: `"${field}" has no employer-permission classification, so it is not editable.`,
    appealPath: null,
  };
}

/** Things an employer might try to buy. */
export const PURCHASABLE = [
  "job_distribution",
  "featured_placement",
  "ats_integration",
  "employer_profile_tools",
  "applicant_analytics",
  "recruitment_workflow",
  "job_description_support",
  "salary_benchmarking",
  "branded_content",
] as const;

export type PurchasableProduct = (typeof PURCHASABLE)[number];

const NOT_FOR_SALE: Record<string, string> = {
  eligibility_verification:
    "Eligibility comes from evidence in the posting, not from a purchase.",
  verification_badge:
    "Verification is earned by passing a check, and the check is the product.",
  negative_information_removal: "Valid evidence is not removable at any price.",
  salary_confidence_boost:
    "Confidence is a property of the evidence, not of the account.",
  review_reordering: "Review order is not a commercial surface.",
  pay_reliability_suppression:
    "Suppressing this is the single most harmful thing money could buy here.",
  organic_ranking:
    "Placement is purchasable and is labelled Sponsored. Organic ranking is not.",
};

export type PurchaseDecision =
  | { sellable: true; product: PurchasableProduct }
  | { sellable: false; reason: string };

/**
 * Whether something may be sold to an employer.
 *
 * Also fails closed. A new commercial idea has to be classified deliberately
 * before it can be sold, which is the point: the awkward conversation happens
 * at design time rather than after a customer has been promised something.
 */
export function maySell(item: string): PurchaseDecision {
  if ((PURCHASABLE as readonly string[]).includes(item)) {
    return { sellable: true, product: item as PurchasableProduct };
  }
  const reason = NOT_FOR_SALE[item];
  return {
    sellable: false,
    reason:
      reason ??
      `"${item}" is not a classified commercial product and may not be sold until it is.`,
  };
}

export type EmployerRole =
  "owner" | "recruiter" | "analyst" | "profile_editor" | "billing_admin";

export type EmployerCapability =
  | "post_job"
  | "close_job"
  | "edit_profile"
  | "view_analytics"
  | "manage_billing"
  | "manage_members"
  | "submit_response";

/** Least privilege: every role holds only what its job requires. */
const ROLE_CAPABILITIES: Record<EmployerRole, readonly EmployerCapability[]> = {
  owner: [
    "post_job",
    "close_job",
    "edit_profile",
    "view_analytics",
    "manage_billing",
    "manage_members",
    "submit_response",
  ],
  recruiter: ["post_job", "close_job", "view_analytics"],
  analyst: ["view_analytics"],
  profile_editor: ["edit_profile", "submit_response"],
  // Billing deliberately grants nothing over jobs, profile or analytics: the
  // person who pays should not thereby gain reach into the content.
  billing_admin: ["manage_billing"],
};

export function roleAllows(
  role: EmployerRole,
  capability: EmployerCapability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * No employer role, including owner, touches moderation or evidence. This is
 * asserted separately from the capability table so that adding a capability
 * cannot accidentally hand one over.
 */
export const EMPLOYER_FORBIDDEN_CAPABILITIES = [
  "moderate_contributions",
  "edit_aggregates",
  "view_contributor_identity",
  "delete_reviews",
  "alter_source_receipts",
] as const;

export function anyEmployerRoleAllows(capability: string): boolean {
  if (
    (EMPLOYER_FORBIDDEN_CAPABILITIES as readonly string[]).includes(capability)
  ) {
    return false;
  }
  return Object.values(ROLE_CAPABILITIES).some((capabilities) =>
    (capabilities as readonly string[]).includes(capability),
  );
}
