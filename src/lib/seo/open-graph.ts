import type { CompanyRating, CompanySummary } from "@/lib/companies/repository";
import type { RepositoryResult } from "@/lib/data/repository-result";
import type { EditorialArticle } from "@/lib/editorial/repository";
import type { Job, PayPeriod } from "@/lib/jobs/types";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

import { canPublishCompanyRating } from "./structured-data";

export const OPEN_GRAPH_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OPEN_GRAPH_IMAGE_CONTENT_TYPE = "image/png" as const;

export type OpenGraphFactTone = "neutral" | "positive" | "warning" | "accent";

export interface OpenGraphFact {
  label: string;
  value: string;
  tone?: OpenGraphFactTone;
}

export interface OpenGraphImageModel {
  eyebrow: string;
  title: string;
  subtitle?: string;
  facts: OpenGraphFact[];
}

const payPeriodLabels: Record<PayPeriod, string | null> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  annual: "year",
  unknown: null,
};

function boundedText(value: string, maximumLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maximumLength) return compact;
  return `${compact.slice(0, maximumLength - 3).trimEnd()}...`;
}

function formatAmount(amount: number, currency: string | null) {
  if (!Number.isFinite(amount)) return null;
  if (!currency) return new Intl.NumberFormat("en-NG").format(amount);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-NG").format(amount)}`;
  }
}

function formatJobSalary(job: Job) {
  const salary = job.salary;
  if (!salary) return null;
  const minimum =
    salary.minimum === null
      ? null
      : formatAmount(salary.minimum, salary.currency);
  const maximum =
    salary.maximum === null
      ? null
      : formatAmount(salary.maximum, salary.currency);
  let value: string | null = null;
  if (minimum && maximum) value = `${minimum} - ${maximum}`;
  else if (minimum) value = `From ${minimum}`;
  else if (maximum) value = `Up to ${maximum}`;
  else if (salary.originalText.trim()) {
    value = boundedText(salary.originalText, 64);
  }
  if (!value) return null;
  const period = payPeriodLabels[salary.payPeriod];
  return period ? `${value} / ${period}` : value;
}

function jobEligibility(job: Job): OpenGraphFact {
  if (job.eligibility.nigeria === "eligible") {
    return {
      label: "Eligibility",
      value: "Open to Nigeria",
      tone: "positive",
    };
  }
  if (job.eligibility.nigeria === "not_eligible") {
    return {
      label: "Eligibility",
      value: "Nigeria excluded",
      tone: "warning",
    };
  }
  return {
    label: "Eligibility",
    value: "Check eligibility",
    tone: "neutral",
  };
}

export function buildJobOpenGraphModel(job: Job): OpenGraphImageModel {
  const salary = formatJobSalary(job);
  return {
    eyebrow: "Source-attributed job",
    title: boundedText(job.title, 100),
    subtitle: boundedText(job.company.name, 72),
    facts: [
      ...(salary
        ? [
            {
              label: "Published salary",
              value: salary,
              tone: "accent" as const,
            },
          ]
        : []),
      jobEligibility(job),
    ],
  };
}

export function buildCompanyOpenGraphModel(
  company: CompanySummary,
  rating: CompanyRating | null,
  minimumRatingSampleSize: number | null,
  activeJobCountIsComplete = true,
): OpenGraphImageModel {
  const activeJobs = company.activeJobs.filter(
    (job) => job.status === "open",
  ).length;
  const canShowRating = canPublishCompanyRating(
    rating,
    minimumRatingSampleSize,
  );
  return {
    eyebrow: "Company intelligence",
    title: boundedText(company.name, 100),
    facts: [
      ...(activeJobCountIsComplete
        ? [
            {
              label: "Active jobs",
              value: `${activeJobs}`,
              tone: "positive" as const,
            },
          ]
        : []),
      ...(canShowRating && rating
        ? [
            {
              label: `${rating.sample_size} published reviews`,
              value: `${rating.overall_rating.toFixed(1)} / 5`,
              tone: "accent" as const,
            },
          ]
        : []),
    ],
  };
}

function countryName(countryCode: string) {
  const normalized = countryCode.toUpperCase();
  const names: Record<string, string> = {
    GH: "Ghana",
    KE: "Kenya",
    NG: "Nigeria",
    ZA: "South Africa",
  };
  return names[normalized] ?? normalized;
}

function primarySalaryAggregate(
  result: RepositoryResult<PublicSalaryAggregate[]>,
) {
  if (result.state !== "ready") return null;
  return (
    result.data.toSorted((a, b) => {
      const sampleDifference = (b.sampleSize ?? 0) - (a.sampleSize ?? 0);
      if (sampleDifference !== 0) return sampleDifference;
      return Date.parse(b.calculatedAt) - Date.parse(a.calculatedAt);
    })[0] ?? null
  );
}

function aggregateSalaryFact(
  aggregate: PublicSalaryAggregate,
): OpenGraphFact | null {
  const percentile25 =
    aggregate.percentile25Annual === null
      ? null
      : formatAmount(aggregate.percentile25Annual, aggregate.currency);
  const percentile75 =
    aggregate.percentile75Annual === null
      ? null
      : formatAmount(aggregate.percentile75Annual, aggregate.currency);
  if (percentile25 && percentile75) {
    return {
      label: "Published annual range",
      value: `${percentile25} - ${percentile75}`,
      tone: "accent",
    };
  }
  return null;
}

export function buildSalaryOpenGraphModel(
  country: string,
  role: string,
  result: RepositoryResult<PublicSalaryAggregate[]>,
): OpenGraphImageModel {
  const aggregate = primarySalaryAggregate(result);
  const roleName = aggregate?.roleFamily ?? role.replace(/-/g, " ");
  const salaryFact = aggregate ? aggregateSalaryFact(aggregate) : null;
  return {
    eyebrow: "Privacy-thresholded salary",
    title: boundedText(roleName, 100),
    subtitle: countryName(country),
    facts: salaryFact ? [salaryFact] : [],
  };
}

export function buildInsightOpenGraphModel(
  article: EditorialArticle,
): OpenGraphImageModel {
  const publishedAt = Date.parse(article.published_at);
  const published = Number.isFinite(publishedAt)
    ? new Intl.DateTimeFormat("en-NG", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(publishedAt))
    : null;
  return {
    eyebrow: "SalaryPadi insight",
    title: boundedText(article.title, 110),
    facts: published
      ? [{ label: "Published", value: published, tone: "neutral" }]
      : [],
  };
}

export function buildSocialImageMetadata(path: string, alt: string) {
  return {
    openGraphImages: [
      {
        url: path,
        width: OPEN_GRAPH_IMAGE_SIZE.width,
        height: OPEN_GRAPH_IMAGE_SIZE.height,
        alt,
        type: OPEN_GRAPH_IMAGE_CONTENT_TYPE,
      },
    ],
    twitterImages: [{ url: path, alt }],
  };
}
