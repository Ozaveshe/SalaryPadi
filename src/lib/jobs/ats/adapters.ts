import {
  buildAshbyEndpoint,
  buildGreenhouseEndpoint,
  buildLeverEndpoint,
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
  workableJobSchema,
  workablePayloadSchema,
  type AshbyJob,
  type AshbyPayload,
  type GreenhouseJob,
  type GreenhousePayload,
  type LeverJob,
  type LeverPayload,
  type WorkableJob,
  type WorkablePayload,
} from "./schemas";
import type {
  AtsAuthorizedSource,
  AtsProvider,
  AtsProviderAdapter,
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
    publishedAt: null,
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
    sourceUrl: sourceUrl.toString(),
    applicationUrl: applicationUrl.toString(),
    checkedAt,
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
