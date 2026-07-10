export type SalarySubmissionState =
  "approved" | "pending" | "rejected" | "removed";

export interface SalarySubmissionForAggregation {
  id: string;
  contributorId: string;
  companySlug: string | null;
  roleFamily: string;
  countryCode: string;
  seniority: string;
  arrangement: string;
  currency: string;
  grossNet: "gross" | "net";
  annualEquivalent: number;
  approvedAt: string;
  state: SalarySubmissionState;
  superseded: boolean;
}

export interface SalaryPrivacyRule {
  version: string;
  minimumDistinctContributors: number;
  percentileMinimumDistinctContributors: number;
  roundingIncrement: number;
}

export interface SalaryAggregate {
  groupKey: string;
  companySlug: string | null;
  roleFamily: string;
  countryCode: string;
  seniority: string;
  arrangement: string;
  currency: string;
  grossNet: "gross" | "net";
  medianAnnual: number;
  percentile25Annual: number | null;
  percentile75Annual: number | null;
  sampleSize: number;
  submissionMonthStart: string;
  submissionMonthEnd: string;
  confidence: "low" | "medium" | "high";
  ruleVersion: string;
}

export const DEFAULT_SALARY_PRIVACY_RULE: SalaryPrivacyRule = {
  version: "salary-privacy-v1",
  minimumDistinctContributors: 3,
  percentileMinimumDistinctContributors: 5,
  roundingIncrement: 10_000,
};

function groupKey(submission: SalarySubmissionForAggregation) {
  return [
    submission.companySlug ?? "all-companies",
    submission.roleFamily.toLowerCase(),
    submission.countryCode.toUpperCase(),
    submission.seniority.toLowerCase(),
    submission.arrangement.toLowerCase(),
    submission.currency.toUpperCase(),
    submission.grossNet,
  ].join("|");
}

function roundTo(value: number, increment: number) {
  return Math.round(value / increment) * increment;
}

function median(values: number[]) {
  const midpoint = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? ((values[midpoint - 1] ?? 0) + (values[midpoint] ?? 0)) / 2
    : (values[midpoint] ?? 0);
}

function nearestRank(values: number[], percentile: number) {
  const index = Math.max(0, Math.ceil(percentile * values.length) - 1);
  return values[index] ?? values.at(-1) ?? 0;
}

function month(value: string) {
  return value.slice(0, 7);
}

export function aggregateSalaryCell(
  submissions: SalarySubmissionForAggregation[],
  rule: SalaryPrivacyRule = DEFAULT_SALARY_PRIVACY_RULE,
): SalaryAggregate | null {
  const eligible = submissions
    .filter(
      (submission) =>
        submission.state === "approved" &&
        !submission.superseded &&
        Number.isFinite(submission.annualEquivalent) &&
        submission.annualEquivalent >= 0,
    )
    .toSorted((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt));

  const latestByContributor = new Map<string, SalarySubmissionForAggregation>();
  for (const submission of eligible) {
    if (!latestByContributor.has(submission.contributorId)) {
      latestByContributor.set(submission.contributorId, submission);
    }
  }

  const distinct = [...latestByContributor.values()];
  if (distinct.length < rule.minimumDistinctContributors) return null;

  const keys = new Set(distinct.map(groupKey));
  if (keys.size !== 1) {
    throw new Error(
      "A salary aggregate cell cannot mix incompatible dimensions.",
    );
  }

  const values = distinct
    .map((submission) => submission.annualEquivalent)
    .toSorted((a, b) => a - b);
  const example = distinct[0]!;
  const dates = distinct.map((submission) => submission.approvedAt).toSorted();
  const canPublishPercentiles =
    distinct.length >= rule.percentileMinimumDistinctContributors;

  return {
    groupKey: groupKey(example),
    companySlug: example.companySlug,
    roleFamily: example.roleFamily,
    countryCode: example.countryCode.toUpperCase(),
    seniority: example.seniority,
    arrangement: example.arrangement,
    currency: example.currency.toUpperCase(),
    grossNet: example.grossNet,
    medianAnnual: roundTo(median(values), rule.roundingIncrement),
    percentile25Annual: canPublishPercentiles
      ? roundTo(nearestRank(values, 0.25), rule.roundingIncrement)
      : null,
    percentile75Annual: canPublishPercentiles
      ? roundTo(nearestRank(values, 0.75), rule.roundingIncrement)
      : null,
    sampleSize: distinct.length,
    submissionMonthStart: month(dates[0]!),
    submissionMonthEnd: month(dates.at(-1)!),
    confidence:
      distinct.length >= 10 ? "high" : distinct.length >= 5 ? "medium" : "low",
    ruleVersion: rule.version,
  };
}

export function aggregateSalaryGroups(
  submissions: SalarySubmissionForAggregation[],
  rule: SalaryPrivacyRule = DEFAULT_SALARY_PRIVACY_RULE,
) {
  const groups = new Map<string, SalarySubmissionForAggregation[]>();
  for (const submission of submissions) {
    const key = groupKey(submission);
    groups.set(key, [...(groups.get(key) ?? []), submission]);
  }
  return [...groups.values()]
    .map((group) => aggregateSalaryCell(group, rule))
    .filter((aggregate): aggregate is SalaryAggregate => aggregate !== null);
}
