import { classifyDestination } from "@/lib/canonical/application-destination";
import { publicJobDescriptionView } from "@/lib/jobs/description-excerpt";
import { jobPostingAge } from "@/lib/jobs/posting-age";
import type { Job } from "@/lib/jobs/types";
import { publicLocation } from "@/lib/presentation/public-field";

export type JobDecisionState = "ready" | "check" | "optional";
export type JobDecisionAction =
  "source" | "scam_check" | "take_home" | "salary_evidence";

export interface JobDecisionCheck {
  id: "eligibility" | "safety" | "freshness" | "description" | "pay";
  state: JobDecisionState;
  label: string;
  detail: string;
  action: JobDecisionAction | null;
}

export interface JobDecisionPlan {
  checks: JobDecisionCheck[];
  unresolvedCount: number;
  primary: JobDecisionCheck | null;
}

function eligibilityCheck(job: Job): JobDecisionCheck {
  if (job.eligibility.nigeria === "not_eligible") {
    return {
      id: "eligibility",
      state: "check",
      label: "Nigeria eligibility is not supported",
      detail:
        "The recorded source evidence says applicants in Nigeria are not eligible. Confirm the original wording before investing time.",
      action: "source",
    };
  }

  const eligible =
    job.eligibility.nigeria === "eligible" ||
    job.eligibility.africa === "eligible" ||
    job.eligibility.scope === "worldwide";
  const localNigeriaRole =
    job.workMode !== "remote" && /\bnigeria\b/i.test(publicLocation(job) ?? "");
  if (eligible || localNigeriaRole) {
    return {
      id: "eligibility",
      state: "ready",
      label: "Country eligibility evidence is present",
      detail:
        job.eligibility.evidenceText.trim() ||
        "The source identifies Nigeria, Africa or worldwide eligibility.",
      action: null,
    };
  }

  return {
    id: "eligibility",
    state: "check",
    label: "Country eligibility needs confirmation",
    detail:
      "Remote or location wording alone does not prove that an applicant in Nigeria can apply.",
    action: "source",
  };
}

function safetyCheck(job: Job): JobDecisionCheck {
  const destination = classifyDestination(job.applicationUrl);
  const employerPolicyPinsDestination =
    job.source.type === "employer" &&
    job.source.destinationRequirement === "employer_application_url" &&
    !destination.deterministic;
  const warning = (job.riskIndicators ?? []).find(
    (indicator) =>
      indicator.severity === "high" || indicator.severity === "caution",
  );
  if (warning) {
    return {
      id: "safety",
      state: "check",
      label: warning.label,
      detail: warning.explanation,
      action: "scam_check",
    };
  }
  if (
    destination.kind !== "direct_employer" &&
    destination.kind !== "employer_ats" &&
    !employerPolicyPinsDestination
  ) {
    return {
      id: "safety",
      state: "check",
      label: "Application destination needs a closer look",
      detail: destination.reason,
      action: "scam_check",
    };
  }
  return {
    id: "safety",
    state: "ready",
    label: "Application path is employer-controlled",
    detail: employerPolicyPinsDestination
      ? "The reviewed employer source policy requires an employer application destination."
      : destination.reason,
    action: null,
  };
}

function freshnessCheck(job: Job, now: Date): JobDecisionCheck {
  const age = jobPostingAge(job, now);
  if (age.stage === "current") {
    return {
      id: "freshness",
      state: "ready",
      label: "Posting date is within the current window",
      detail: "SalaryPadi has not applied an age warning to this role.",
      action: null,
    };
  }
  return {
    id: "freshness",
    state: "check",
    label: age.label ?? "Posting freshness needs confirmation",
    detail:
      age.note ??
      "Confirm that the original posting still accepts applications.",
    action: "source",
  };
}

function descriptionCheck(job: Job): JobDecisionCheck {
  const description = publicJobDescriptionView(job);
  if (description.kind === "stored") {
    return {
      id: "description",
      state: "ready",
      label: "Role details are readable on SalaryPadi",
      detail:
        "The republishable description is available with its original structure preserved.",
      action: null,
    };
  }
  return {
    id: "description",
    state: "check",
    label: "Full role details are on the source",
    detail:
      "SalaryPadi does not republish this provider's full description. Review responsibilities and requirements on the original listing.",
    action: "source",
  };
}

function payCheck(job: Job): JobDecisionCheck {
  if (job.salary) {
    return {
      id: "pay",
      state: "ready",
      label: "Compensation is disclosed",
      detail:
        "Use the stated currency and period when estimating take-home pay.",
      action: "take_home",
    };
  }
  return {
    id: "pay",
    state: "optional",
    label: "Compensation is not disclosed",
    detail:
      "Check available employer salary evidence before deciding what range to discuss.",
    action: "salary_evidence",
  };
}

/**
 * Prioritises the evidence SalaryPadi already holds; it does not infer fit,
 * invent a score or rewrite the employer's claims. A candidate sees the first
 * unresolved application check in quick view and the complete ledger on the
 * role page.
 */
export function buildJobDecisionPlan(
  job: Job,
  now = new Date(),
): JobDecisionPlan {
  const checks = [
    eligibilityCheck(job),
    safetyCheck(job),
    freshnessCheck(job, now),
    descriptionCheck(job),
    payCheck(job),
  ];
  const unresolved = checks.filter((check) => check.state === "check");
  return {
    checks,
    unresolvedCount: unresolved.length,
    primary:
      unresolved[0] ??
      checks.find((check) => check.state === "optional") ??
      null,
  };
}
