import {
  buildAshbyEndpoint,
  buildGreenhouseEndpoint,
  buildLeverEndpoint,
  buildSmartRecruitersEndpoint,
  buildWorkableEndpoint,
} from "./endpoints";
import { atsAdapterError } from "./errors";
import {
  ashbyJobSchema,
  ashbyPayloadSchema,
  greenhouseJobSchema,
  greenhousePayloadSchema,
  leverJobSchema,
  leverPayloadSchema,
  smartRecruitersJobSchema,
  smartRecruitersPayloadSchema,
  workableJobSchema,
  workablePayloadSchema,
  type AshbyJob,
  type AshbyPayload,
  type GreenhouseJob,
  type GreenhousePayload,
  type LeverJob,
  type LeverPayload,
  type SmartRecruitersJob,
  type SmartRecruitersPayload,
  type WorkableJob,
  type WorkablePayload,
} from "./schemas";
import type {
  AtsAuthorizedSource,
  AtsProvider,
  AtsProviderAdapter,
  AtsSalaryEvidence,
  AtsSourceRecord,
} from "./types";

const PROVIDER_DESTINATION_HOSTS = {
  greenhouse: [
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "job-boards.eu.greenhouse.io",
  ],
  lever: ["jobs.lever.co", "jobs.eu.lever.co"],
  ashby: ["jobs.ashbyhq.com"],
  workable: ["apply.workable.com"],
  smartrecruiters: ["jobs.smartrecruiters.com"],
} as const satisfies Record<AtsProvider, readonly string[]>;

function pathMatchesPrefix(pathname: string, rawPrefix: string): boolean {
  const prefix = rawPrefix === "/" ? rawPrefix : rawPrefix.replace(/\/+$/g, "");
  return (
    prefix === "/" || pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function normalizedDestination<P extends AtsProvider>(
  raw: string,
  source: AtsAuthorizedSource<P>,
): URL {
  let destination: URL;
  try {
    destination = new URL(raw);
  } catch {
    throw atsAdapterError("ats_normalization_failed", source.provider);
  }

  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    (destination.port && destination.port !== "443")
  ) {
    throw atsAdapterError("ats_normalization_failed", source.provider);
  }

  destination.hash = "";
  destination.port = "";
  destination.hostname = destination.hostname.toLowerCase();

  const providerHosts: readonly string[] =
    source.provider === "lever"
      ? [
          (source as AtsAuthorizedSource<"lever">).region === "eu"
            ? "jobs.eu.lever.co"
            : "jobs.lever.co",
        ]
      : PROVIDER_DESTINATION_HOSTS[source.provider];
  if (providerHosts.includes(destination.hostname)) {
    const firstSegment = destination.pathname.split("/").filter(Boolean)[0];
    // Workable hosts every tenant's postings under opaque /j/<shortcode>
    // paths; the other providers put the tenant slug first.
    const expectedSegment =
      source.provider === "workable" ? "j" : source.tenant.toLowerCase();
    if (firstSegment?.toLowerCase() !== expectedSegment) {
      throw atsAdapterError("ats_normalization_failed", source.provider);
    }
    return destination;
  }

  const allowedDestination = source.authorization.allowedDestinations.find(
    ({ host }) => host.toLowerCase() === destination.hostname,
  );
  if (!allowedDestination) {
    throw atsAdapterError("ats_normalization_failed", source.provider);
  }

  const pathPrefixes = allowedDestination.pathPrefixes;
  if (
    pathPrefixes?.length &&
    !pathPrefixes.some((prefix) =>
      pathMatchesPrefix(destination.pathname, prefix),
    )
  ) {
    throw atsAdapterError("ats_normalization_failed", source.provider);
  }

  return destination;
}

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function greenhouseRecord(
  job: GreenhouseJob,
  source: AtsAuthorizedSource<"greenhouse">,
  checkedAt: string,
): AtsSourceRecord | null {
  if (job.internal_job_id === null) return null;

  const destination = normalizedDestination(job.absolute_url, source);
  // Greenhouse states the offset (e.g. -04:00); restate the same instant in
  // UTC so downstream evidence checks compare timestamps, not formats.
  const publishedAt = job.first_published
    ? new Date(job.first_published).toISOString()
    : null;

  return {
    provider: "greenhouse",
    sourceKey: source.key,
    employerName: source.employerName,
    externalId: String(job.id),
    title: job.title,
    location: optionalText(job.location.name),
    workplaceType: null,
    employmentType: null,
    department: optionalText(job.departments?.[0]?.name),
    team: null,
    descriptionHtml: optionalText(job.content),
    descriptionText: null,
    publishedAt,
    updatedAt: job.updated_at,
    sourceUrl: destination.toString(),
    applicationUrl: destination.toString(),
    checkedAt,
  };
}

function leverWorkplaceType(
  workplaceType: LeverJob["workplaceType"],
): string | null {
  if (workplaceType === "onsite" || workplaceType === "on-site") {
    return "on-site";
  }
  return workplaceType ?? null;
}

function leverRecord(
  job: LeverJob,
  source: AtsAuthorizedSource<"lever">,
  checkedAt: string,
): AtsSourceRecord {
  const sourceUrl = normalizedDestination(job.hostedUrl, source);
  const applicationUrl = normalizedDestination(job.applyUrl, source);
  const publishedAt =
    job.createdAt === undefined ? null : new Date(job.createdAt).toISOString();

  return {
    provider: "lever",
    sourceKey: source.key,
    employerName: source.employerName,
    externalId: job.id,
    title: job.text,
    location: optionalText(job.categories.location),
    workplaceType: leverWorkplaceType(job.workplaceType),
    employmentType: optionalText(job.categories.commitment),
    department: optionalText(job.categories.department),
    team: optionalText(job.categories.team),
    descriptionHtml: optionalText(job.description),
    descriptionText: optionalText(job.descriptionPlain),
    publishedAt,
    updatedAt: null,
    sourceUrl: sourceUrl.toString(),
    applicationUrl: applicationUrl.toString(),
    checkedAt,
  };
}

function ashbyRecord(
  job: AshbyJob,
  source: AtsAuthorizedSource<"ashby">,
  checkedAt: string,
): AtsSourceRecord | null {
  if (!job.isListed) return null;

  const sourceUrl = normalizedDestination(job.jobUrl, source);
  const applicationUrl = normalizedDestination(job.applyUrl, source);
  const derivedId = sourceUrl.pathname.replace(/^\/+|\/+$/g, "");

  if (!job.id && !derivedId) {
    throw atsAdapterError("ats_normalization_failed", "ashby");
  }

  const salary = ashbySalaryEvidence(job);

  return {
    provider: "ashby",
    sourceKey: source.key,
    employerName: source.employerName,
    externalId: job.id ?? derivedId,
    title: job.title,
    location: optionalText(job.location),
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    department: optionalText(job.department),
    team: optionalText(job.team),
    descriptionHtml: optionalText(job.descriptionHtml),
    descriptionText: optionalText(job.descriptionPlain),
    publishedAt: job.publishedAt,
    updatedAt: null,
    salary,
    sourceUrl: sourceUrl.toString(),
    applicationUrl: applicationUrl.toString(),
    checkedAt,
  };
}

const ASHBY_PAY_PERIODS = {
  "1 HOUR": "hourly",
  "1 DAY": "daily",
  "1 WEEK": "weekly",
  "1 MONTH": "monthly",
  "1 YEAR": "annual",
} as const satisfies Record<string, NonNullable<AtsSalaryEvidence["period"]>>;

function ashbySalaryEvidence(job: AshbyJob): AtsSalaryEvidence | null {
  const sourceText =
    job.compensation?.scrapeableCompensationSalarySummary?.trim();
  if (!sourceText) return null;

  const salaryComponents =
    job.compensation?.summaryComponents?.filter(
      (component) => component.compensationType === "Salary",
    ) ?? [];
  if (salaryComponents.length !== 1) {
    return {
      sourceText,
      currency: null,
      minimum: null,
      maximum: null,
      period: null,
      grossNet: "unspecified",
    };
  }

  const component = salaryComponents[0]!;
  const period =
    ASHBY_PAY_PERIODS[component.interval as keyof typeof ASHBY_PAY_PERIODS] ??
    null;
  const hasAmount = component.minValue !== null || component.maxValue !== null;
  if (
    !period ||
    !component.currencyCode ||
    !hasAmount ||
    (component.minValue !== null &&
      component.maxValue !== null &&
      component.maxValue < component.minValue)
  ) {
    return {
      sourceText,
      currency: null,
      minimum: null,
      maximum: null,
      period: null,
      grossNet: "unspecified",
    };
  }

  return {
    sourceText,
    currency: component.currencyCode,
    minimum: component.minValue,
    maximum: component.maxValue,
    period,
    grossNet: "unspecified",
  };
}

function workableLocation(job: WorkableJob): string | null {
  const primary = job.locations?.[0];
  const parts = [
    optionalText(primary?.city) ?? optionalText(job.city),
    optionalText(primary?.region) ?? optionalText(job.state),
    optionalText(primary?.country) ?? optionalText(job.country),
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(", ") : null;
}

function workableRecord(
  job: WorkableJob,
  source: AtsAuthorizedSource<"workable">,
  checkedAt: string,
): AtsSourceRecord {
  const sourceUrl = normalizedDestination(job.url, source);
  const applicationUrl = normalizedDestination(job.application_url, source);

  return {
    provider: "workable",
    sourceKey: source.key,
    employerName: source.employerName,
    externalId: job.shortcode,
    title: job.title,
    location: workableLocation(job),
    workplaceType: job.telecommuting === true ? "remote" : null,
    employmentType: optionalText(job.employment_type),
    department: optionalText(job.department),
    team: null,
    descriptionHtml: null,
    descriptionText: null,
    publishedAt: job.published_on ? `${job.published_on}T00:00:00.000Z` : null,
    updatedAt: null,
    sourceUrl: sourceUrl.toString(),
    applicationUrl: applicationUrl.toString(),
    checkedAt,
  };
}

export const greenhouseAdapter: AtsProviderAdapter<
  "greenhouse",
  GreenhousePayload,
  GreenhouseJob
> = {
  provider: "greenhouse",
  payloadSchema: greenhousePayloadSchema,
  recordSchema: greenhouseJobSchema,
  buildEndpoint: buildGreenhouseEndpoint,
  records: (payload) => payload.jobs,
  providerReportedTotal: (payload) => payload.meta?.total ?? null,
  normalizeRecord: greenhouseRecord,
};

export const leverAdapter: AtsProviderAdapter<"lever", LeverPayload, LeverJob> =
  {
    provider: "lever",
    payloadSchema: leverPayloadSchema,
    recordSchema: leverJobSchema,
    buildEndpoint: buildLeverEndpoint,
    records: (payload) => payload,
    providerReportedTotal: () => null,
    normalizeRecord: leverRecord,
  };

export const ashbyAdapter: AtsProviderAdapter<"ashby", AshbyPayload, AshbyJob> =
  {
    provider: "ashby",
    payloadSchema: ashbyPayloadSchema,
    recordSchema: ashbyJobSchema,
    buildEndpoint: buildAshbyEndpoint,
    records: (payload) => payload.jobs,
    providerReportedTotal: () => null,
    normalizeRecord: ashbyRecord,
  };

export const workableAdapter: AtsProviderAdapter<
  "workable",
  WorkablePayload,
  WorkableJob
> = {
  provider: "workable",
  payloadSchema: workablePayloadSchema,
  recordSchema: workableJobSchema,
  buildEndpoint: buildWorkableEndpoint,
  records: (payload) => payload.jobs,
  providerReportedTotal: () => null,
  normalizeRecord: workableRecord,
};

/**
 * The posting list is the only call this adapter makes, so the destination is
 * derived rather than read: SmartRecruiters serves
 * jobs.smartrecruiters.com/{company}/{id} for every posting and redirects it to
 * the slugged canonical form itself (verified against Visa, Yassir and IHS
 * Towers tenants). The alternative is one detail request per role to read
 * applyUrl, which would spend a source's whole four-call daily budget on the
 * first few postings.
 *
 * The tenant in the URL comes from the posting's own company.identifier and is
 * then checked against the source's allowed destinations, so a payload cannot
 * point applications at a company this source was never authorized for.
 */
function smartRecruitersRecord(
  job: SmartRecruitersJob,
  source: AtsAuthorizedSource<"smartrecruiters">,
  checkedAt: string,
): AtsSourceRecord | null {
  const destination = normalizedDestination(
    `https://jobs.smartrecruiters.com/${encodeURIComponent(job.company.identifier)}/${encodeURIComponent(job.id)}`,
    source,
  );

  const location = job.location ?? {};
  // fullLocation is the employer's own rendering; the parts are only joined when
  // it is missing, so we never invent a format the employer did not publish.
  const place =
    optionalText(location.fullLocation) ??
    optionalText(
      [location.city, location.region, location.country]
        .map((part) => optionalText(part))
        .filter(Boolean)
        .join(", "),
    );

  return {
    provider: "smartrecruiters",
    sourceKey: source.key,
    employerName: source.employerName,
    externalId: job.id,
    title: job.name,
    location: place,
    // "remote: true" is the only workplace signal the list carries. Anything
    // else is unstated rather than on-site, so it stays null.
    workplaceType: location.remote === true ? "Remote" : null,
    employmentType: optionalText(job.typeOfEmployment?.label),
    department: optionalText(job.department?.label),
    team: optionalText(job.function?.label),
    // The list endpoint publishes no description. Every ATS source registers
    // with may_store_full_description false, so one would be discarded anyway.
    descriptionHtml: null,
    descriptionText: null,
    publishedAt: job.releasedDate ?? null,
    updatedAt: null,
    // SmartRecruiters exposes no salary on the posting list, and inferring one
    // would be the exact fabrication this product refuses.
    salary: null,
    sourceUrl: destination.toString(),
    applicationUrl: destination.toString(),
    checkedAt,
  };
}

export const smartRecruitersAdapter: AtsProviderAdapter<
  "smartrecruiters",
  SmartRecruitersPayload,
  SmartRecruitersJob
> = {
  provider: "smartrecruiters",
  payloadSchema: smartRecruitersPayloadSchema,
  recordSchema: smartRecruitersJobSchema,
  buildEndpoint: buildSmartRecruitersEndpoint,
  records: (payload) => payload.content,
  providerReportedTotal: (payload) => payload.totalFound ?? null,
  normalizeRecord: smartRecruitersRecord,
};
