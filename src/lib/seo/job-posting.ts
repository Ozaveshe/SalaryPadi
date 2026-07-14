import type { Job, PayPeriod } from "@/lib/jobs/types";
import { isJobCurrentlyPublishable } from "@/lib/jobs/publication";

export function canIndexJobDetail(job: Job, now = new Date()): boolean {
  return (
    Boolean(job.databaseId) &&
    job.source.canIndex &&
    isJobCurrentlyPublishable(job, now)
  );
}

export function canNotifyGoogleIndexing(job: Job, now = new Date()): boolean {
  return (
    canIndexJobDetail(job, now) && job.source.canUseJobPostingStructuredData
  );
}

const employmentTypes: Record<Job["employmentType"], string | null> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
  freelance: "CONTRACTOR",
  unknown: null,
};

const salaryUnits: Record<PayPeriod, string | null> = {
  hourly: "HOUR",
  daily: "DAY",
  weekly: "WEEK",
  monthly: "MONTH",
  annual: "YEAR",
  unknown: null,
};

function buildSalary(job: Job) {
  const salary = job.salary;
  if (!salary?.currency) return null;

  const minimum = salary.minimum;
  const maximum = salary.maximum;
  const unitText = salaryUnits[salary.payPeriod];
  if (minimum === null && maximum === null) return null;

  const value: Record<string, unknown> = {
    "@type": "QuantitativeValue",
  };
  if (minimum !== null) value.minValue = minimum;
  if (maximum !== null) value.maxValue = maximum;
  if (unitText) value.unitText = unitText;

  return {
    "@type": "MonetaryAmount",
    currency: salary.currency,
    value,
  };
}

function buildApplicantLocations(job: Job) {
  const countries = new Set(job.eligibility.includedCountries);
  if (job.eligibility.nigeria === "eligible") countries.add("Nigeria");

  return [...countries]
    .filter(Boolean)
    .map((name) => ({ "@type": "Country", name }));
}

export function buildJobPostingStructuredData(
  job: Job,
  canonicalUrl: string,
): Record<string, unknown> | null {
  if (
    !job.source.canUseJobPostingStructuredData ||
    !canIndexJobDetail(job) ||
    job.status !== "open"
  ) {
    return null;
  }

  const description = [
    job.description,
    job.requirements ? `Requirements: ${job.requirements}` : null,
    job.benefits ? `Benefits: ${job.benefits}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    datePosted: job.postedAt,
    directApply: false,
    identifier: {
      "@type": "PropertyValue",
      name: job.company.name,
      value: `${job.source.id}:${job.externalId}`,
    },
    hiringOrganization: {
      "@type": "Organization",
      name: job.company.name,
    },
    url: canonicalUrl,
  };

  const employmentType = employmentTypes[job.employmentType];
  if (employmentType) structuredData.employmentType = employmentType;
  if (job.validThrough) structuredData.validThrough = job.validThrough;
  if (job.category) structuredData.industry = job.category;
  if (job.skills.length > 0) structuredData.skills = job.skills.join(", ");

  const salary = buildSalary(job);
  if (salary) structuredData.baseSalary = salary;

  if (job.workMode === "remote") {
    structuredData.jobLocationType = "TELECOMMUTE";
    const applicantLocations = buildApplicantLocations(job);
    if (applicantLocations.length > 0) {
      structuredData.applicantLocationRequirements = applicantLocations;
    }
  } else {
    structuredData.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.locationDisplay,
      },
    };
  }

  return structuredData;
}
