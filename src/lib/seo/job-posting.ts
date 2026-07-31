import { COUNTRY_PACKS } from "@/lib/country-packs/registry";
import type { Job, PayPeriod } from "@/lib/jobs/types";
import { isJobCurrentlyPublishable } from "@/lib/jobs/publication";

/*
 * Must match the placeholder constant in api.worker_store_ats_snapshot_batch:
 * ATS records whose policy withheld the provider's description store this
 * sentence instead. A page whose only body copy is this sentinel is a thin
 * page; indexing it (or emitting it as a JobPosting description) would ship
 * boilerplate to search engines, so the sentinel disqualifies indexing even
 * when the source's may_index_jobs right is granted.
 */
export const METADATA_ONLY_DESCRIPTION_SENTINEL =
  "This listing is available as source metadata only. SalaryPadi does not store the provider's full job description; use the application link to review the original posting.";

export function hasIndexableDescription(job: Job): boolean {
  return (
    job.description.trim().length >= 140 &&
    job.description !== METADATA_ONLY_DESCRIPTION_SENTINEL
  );
}

export function canIndexJobDetail(job: Job, now = new Date()): boolean {
  return (
    Boolean(job.databaseId) &&
    job.source.canIndex &&
    hasIndexableDescription(job) &&
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

/**
 * Splits a source location string into the parts Google's JobPosting
 * `jobLocation` expects.
 *
 * Google requires `addressCountry` on a physical job location and will drop
 * the rich result without it; the whole display string was previously being
 * assigned to `addressLocality`, so "Lagos, Nigeria" was published as a
 * locality named "Lagos, Nigeria" and no country at all.
 *
 * The country is only asserted when the source's own location text names it,
 * matched against the configured country packs. An unrecognised location keeps
 * its full text as the locality and states no country, because guessing one
 * would publish a fact the source never provided.
 */
export function parseJobLocationAddress(locationDisplay: string): {
  addressLocality: string;
  addressCountry: string | null;
} | null {
  const trimmed = locationDisplay.trim();
  if (!trimmed) return null;

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1)?.toLowerCase() ?? "";
  const pack = COUNTRY_PACKS.find(
    (entry) =>
      entry.name.toLowerCase() === last ||
      entry.countryCode.toLowerCase() === last ||
      entry.iso3.toLowerCase() === last,
  );

  if (!pack) return { addressLocality: trimmed, addressCountry: null };
  const locality = parts.slice(0, -1).join(", ");
  return {
    // A bare country ("Nigeria") has no locality of its own; repeat the
    // country name rather than emit an empty required field.
    addressLocality: locality || pack.name,
    addressCountry: pack.countryCode,
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
    const address = parseJobLocationAddress(job.locationDisplay);
    if (address) {
      structuredData.jobLocation = {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: address.addressLocality,
          ...(address.addressCountry
            ? { addressCountry: address.addressCountry }
            : {}),
        },
      };
    }
  }

  return structuredData;
}
