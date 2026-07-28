import type { CompanySummary } from "@/lib/companies/repository";

export type VerificationTone = "success" | "neutral" | "warning";

/**
 * The badge tone for a company's verification state.
 *
 * The heading rendered every company with `status-warning`, so an employer
 * that had passed domain or organization verification carried the same
 * caution colour as one that had never been checked. Badge tone is meaning
 * here, not decoration, so it has to track the state.
 *
 * `source_listed` stays neutral on purpose: a citation proves a source named
 * the company, which is not a claim about the employer's identity.
 */
export function companyVerificationTone(
  verification: CompanySummary["verification"],
): VerificationTone {
  switch (verification) {
    case "employer_verified":
      return "success";
    case "source_listed":
      return "neutral";
    case "unverified":
      return "warning";
  }
}

/** Wording that says what the state means rather than echoing the enum. */
export function companyVerificationLabel(
  verification: CompanySummary["verification"],
): string {
  switch (verification) {
    case "employer_verified":
      return "Employer verified";
    case "source_listed":
      return "Source listed";
    case "unverified":
      return "Not verified";
  }
}
