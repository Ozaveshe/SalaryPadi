import { z } from "zod";

import { atsAdapterError } from "./errors";
import type {
  AshbyEndpointTarget,
  AtsEndpointTarget,
  GreenhouseEndpointTarget,
  LeverEndpointTarget,
  SmartRecruitersEndpointTarget,
  WorkableEndpointTarget,
} from "./types";

export const ATS_API_HOSTS = [
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.eu.lever.co",
  "api.ashbyhq.com",
  "apply.workable.com",
  "api.smartrecruiters.com",
] as const;

const tenantSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

function validTenant(value: string): string {
  const parsed = tenantSchema.safeParse(value);
  if (!parsed.success) throw atsAdapterError("ats_invalid_source");
  return parsed.data;
}

export function buildGreenhouseEndpoint(target: GreenhouseEndpointTarget): URL {
  const tenant = validTenant(target.tenant);
  const endpoint = new URL(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(tenant)}/jobs`,
  );
  endpoint.searchParams.set("content", "true");
  return endpoint;
}

export function buildLeverEndpoint(target: LeverEndpointTarget): URL {
  const tenant = validTenant(target.tenant);
  if (
    target.region !== undefined &&
    !["global", "eu"].includes(target.region)
  ) {
    throw atsAdapterError("ats_invalid_source", "lever");
  }
  const host =
    (target.region ?? "global") === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const endpoint = new URL(
    `https://${host}/v0/postings/${encodeURIComponent(tenant)}`,
  );
  endpoint.searchParams.set("mode", "json");
  return endpoint;
}

export function buildAshbyEndpoint(target: AshbyEndpointTarget): URL {
  const tenant = validTenant(target.tenant);
  const endpoint = new URL(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(tenant)}`,
  );
  endpoint.searchParams.set("includeCompensation", "true");
  return endpoint;
}

/**
 * Workable's widget endpoint omits descriptions unless asked for details.
 *
 * Without this parameter every Workable board imported as title and location
 * only — 51 of the 60 authorized boards and 105 published jobs, none of them
 * carrying a word about the actual role. It was previously recorded that
 * Workable needed a per-posting detail fetch, which would have cost a request
 * per job against a four-a-day budget. It does not: `details=true` returns the
 * description inside the same single account call.
 */
export function buildWorkableEndpoint(target: WorkableEndpointTarget): URL {
  const tenant = validTenant(target.tenant);
  const endpoint = new URL(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(tenant)}`,
  );
  endpoint.searchParams.set("details", "true");
  return endpoint;
}

/**
 * SmartRecruiters paginates, so the page size is pinned here rather than left to
 * the provider's default of 10. One request has to cover a whole board: the
 * per-source budget is four calls a day, and a detail call per posting would
 * exhaust it on the first five roles.
 */
export const SMARTRECRUITERS_PAGE_LIMIT = 100;

export function buildSmartRecruitersEndpoint(
  target: SmartRecruitersEndpointTarget,
): URL {
  const tenant = validTenant(target.tenant);
  const endpoint = new URL(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(tenant)}/postings`,
  );
  endpoint.searchParams.set("limit", String(SMARTRECRUITERS_PAGE_LIMIT));
  return endpoint;
}

export function buildAtsEndpoint(target: AtsEndpointTarget): URL {
  switch (target.provider) {
    case "greenhouse":
      return buildGreenhouseEndpoint(target);
    case "lever":
      return buildLeverEndpoint(target);
    case "ashby":
      return buildAshbyEndpoint(target);
    case "workable":
      return buildWorkableEndpoint(target);
    case "smartrecruiters":
      return buildSmartRecruitersEndpoint(target);
    default:
      throw atsAdapterError("ats_invalid_source");
  }
}
