import { createHash } from "node:crypto";

import { classifyEligibilityEvidence } from "./eligibility";
import { buildJobFingerprint } from "./fingerprint";
import { htmlToPlainText, slugify } from "./normalize";
import type { AtsSourceRecord } from "./ats";

const MAX_DESCRIPTION_LENGTH = 100_000;

type AtsWorkArrangement = "remote" | "hybrid" | "onsite" | "unspecified";
type AtsEmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "freelance"
  | "temporary"
  | "internship"
  | "graduate_trainee"
  | "other";
type AtsEngagementType =
  "employee" | "contractor" | "freelance" | "unspecified";
type AtsEligibilityScope =
  | "worldwide"
  | "africa"
  | "emea"
  | "nigeria"
  | "named_countries"
  | "restricted_region"
  | "unclear";

export interface AtsImportPolicy {
  sourceKey: string;
  employerName: string;
  mayStoreFullDescription: boolean;
}

export interface AtsImportJob {
  external_id: string;
  slug: string;
  title: string;
  description_text: string | null;
  raw_payload: Record<string, unknown> | null;
  work_arrangement: AtsWorkArrangement;
  employment_type: AtsEmploymentType;
  engagement_type: AtsEngagementType;
  application_url: string;
  source_url: string;
  posted_at: string | null;
  last_checked_at: string;
  content_hash: string;
  dedup_fingerprint: string;
  eligibility: {
    scope: AtsEligibilityScope;
    evidence_text: string;
    provenance: "source_provided";
    countries: Array<{
      country_code: string;
      rule: "include" | "exclude";
    }>;
  };
  locations: Array<{
    country_code: string | null;
    city: string | null;
    region: string | null;
    is_primary: boolean;
  }>;
}

export type AtsImportQuarantineCode =
  | "description_too_large"
  | "duplicate_external_id"
  | "invalid_record"
  | "source_identity_mismatch";

export interface AtsImportNormalizationResult {
  jobs: AtsImportJob[];
  quarantinedCount: number;
  quarantineCodes: Partial<Record<AtsImportQuarantineCode, number>>;
}

function normalizedPlainText(value: string): string {
  return htmlToPlainText(value).trim();
}

function mapWorkArrangement(value: string | null): AtsWorkArrangement {
  const normalized = value?.toLowerCase().replace(/[\s_-]+/g, "") ?? "";
  if (normalized === "remote") return "remote";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "onsite") return "onsite";
  return "unspecified";
}

function mapEmploymentType(value: string | null): AtsEmploymentType {
  const normalized = value?.toLowerCase().replace(/[\s_-]+/g, "") ?? "";
  if (normalized.includes("fulltime")) return "full_time";
  if (normalized.includes("parttime")) return "part_time";
  if (normalized.includes("graduate") || normalized.includes("trainee")) {
    return "graduate_trainee";
  }
  if (normalized.includes("intern")) return "internship";
  if (normalized.includes("freelance")) return "freelance";
  if (normalized.includes("contract")) return "contract";
  if (normalized.includes("temporary") || normalized.includes("fixedterm")) {
    return "temporary";
  }
  return "other";
}

function mapEngagementType(
  employmentType: AtsEmploymentType,
): AtsEngagementType {
  if (employmentType === "contract") return "contractor";
  if (employmentType === "freelance") return "freelance";
  if (employmentType === "other") return "unspecified";
  return "employee";
}

function mapLocations(
  location: string | null,
  countryCodes: string[],
  checkedAt: string,
): AtsImportJob["locations"] {
  if (countryCodes.length === 0) return [];
  const segments =
    location
      ?.split(/[,;|/]+/)
      .map((part) => part.trim())
      .filter(Boolean) ?? [];
  const possibleCity =
    countryCodes.length === 1 &&
    segments.length > 1 &&
    !/\b(?:remote|hybrid|onsite|on-site)\b/i.test(segments[0]!) &&
    classifyEligibilityEvidence(segments[0], checkedAt).includedCountryCodes
      .length === 0
      ? segments[0]!.slice(0, 160)
      : null;

  return countryCodes.map((countryCode, index) => ({
    country_code: countryCode,
    city: index === 0 ? possibleCity : null,
    region: null,
    is_primary: index === 0,
  }));
}

function stableJobSlug(record: AtsSourceRecord): string {
  const prefix =
    slugify(`${record.employerName}-${record.title}`).slice(0, 72) || "job";
  const identity = createHash("sha256")
    .update(`${record.sourceKey}:${record.externalId}`)
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${identity}`;
}

function incrementCode(
  codes: AtsImportNormalizationResult["quarantineCodes"],
  code: AtsImportQuarantineCode,
) {
  codes[code] = (codes[code] ?? 0) + 1;
}

function normalizeRecord(
  record: AtsSourceRecord,
  policy: AtsImportPolicy,
): AtsImportJob | AtsImportQuarantineCode {
  if (
    record.sourceKey !== policy.sourceKey ||
    record.employerName !== policy.employerName
  ) {
    return "source_identity_mismatch";
  }

  const title = normalizedPlainText(record.title);
  const location = record.location?.trim() || null;
  const description = record.descriptionHtml
    ? normalizedPlainText(record.descriptionHtml)
    : record.descriptionText
      ? normalizedPlainText(record.descriptionText)
      : "";
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return "description_too_large";
  }

  let sourceUrl: URL;
  let applicationUrl: URL;
  try {
    sourceUrl = new URL(record.sourceUrl);
    applicationUrl = new URL(record.applicationUrl);
  } catch {
    return "invalid_record";
  }
  if (
    !record.externalId.trim() ||
    record.externalId.length > 300 ||
    title.length < 2 ||
    title.length > 300 ||
    sourceUrl.protocol !== "https:" ||
    applicationUrl.protocol !== "https:" ||
    record.checkedAt.length > 40
  ) {
    return "invalid_record";
  }

  const workArrangement = mapWorkArrangement(record.workplaceType);
  const employmentType = mapEmploymentType(record.employmentType);
  const engagementType = mapEngagementType(employmentType);
  const eligibilityEvidence =
    location?.slice(0, 2_000) ?? "Location not stated by the employer ATS.";
  const eligibility = classifyEligibilityEvidence(
    eligibilityEvidence,
    record.checkedAt,
  );
  const countryCodes = eligibility.includedCountryCodes;
  const storedDescription =
    policy.mayStoreFullDescription && description.length >= 20
      ? description
      : null;

  const contentFacts = {
    provider: record.provider,
    external_id: record.externalId,
    title,
    location,
    workplace_type: record.workplaceType,
    employment_type: record.employmentType,
    department: record.department,
    team: record.team,
    description,
    published_at: record.publishedAt,
    updated_at: record.updatedAt,
    source_url: sourceUrl.toString(),
    application_url: applicationUrl.toString(),
  };
  const contentHash = createHash("sha256")
    .update(JSON.stringify(contentFacts))
    .digest("hex");

  return {
    external_id: record.externalId.trim(),
    slug: stableJobSlug(record),
    title,
    description_text: storedDescription,
    raw_payload: policy.mayStoreFullDescription ? contentFacts : null,
    work_arrangement: workArrangement,
    employment_type: employmentType,
    engagement_type: engagementType,
    application_url: applicationUrl.toString(),
    source_url: sourceUrl.toString(),
    posted_at: record.publishedAt,
    last_checked_at: record.checkedAt,
    content_hash: contentHash,
    dedup_fingerprint: buildJobFingerprint({
      title,
      company: record.employerName,
      location: location ?? "Location not stated",
      arrangement:
        engagementType === "unspecified" ? "unknown" : engagementType,
      destination: applicationUrl.toString(),
    }),
    eligibility: {
      scope: eligibility.eligibility.scope,
      evidence_text: eligibilityEvidence,
      provenance: "source_provided",
      countries: [
        ...countryCodes.map((countryCode) => ({
          country_code: countryCode,
          rule: "include" as const,
        })),
        ...eligibility.excludedCountryCodes.map((countryCode) => ({
          country_code: countryCode,
          rule: "exclude" as const,
        })),
      ],
    },
    locations: mapLocations(location, countryCodes, record.checkedAt),
  };
}

/**
 * Converts provider records into the bounded database RPC contract. Invalid or
 * duplicate records are quarantined as counts, making the caller mark the
 * snapshot partial so an isolated bad record can never close an existing job.
 */
export function normalizeAtsImportRecords(
  records: readonly AtsSourceRecord[],
  policy: AtsImportPolicy,
): AtsImportNormalizationResult {
  const jobs: AtsImportJob[] = [];
  const quarantineCodes: AtsImportNormalizationResult["quarantineCodes"] = {};
  const seenExternalIds = new Set<string>();

  for (const record of records) {
    const externalId = record.externalId.trim();
    if (seenExternalIds.has(externalId)) {
      incrementCode(quarantineCodes, "duplicate_external_id");
      continue;
    }
    seenExternalIds.add(externalId);

    const normalized = normalizeRecord(record, policy);
    if (typeof normalized === "string") {
      incrementCode(quarantineCodes, normalized);
      continue;
    }
    jobs.push(normalized);
  }

  return {
    jobs,
    quarantinedCount: Object.values(quarantineCodes).reduce(
      (total, count) => total + (count ?? 0),
      0,
    ),
    quarantineCodes,
  };
}
