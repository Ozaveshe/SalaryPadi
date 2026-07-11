import { z } from "zod";

import { atsAdapterError } from "./errors";
import type {
  AshbyEndpointTarget,
  AtsEndpointTarget,
  GreenhouseEndpointTarget,
  LeverEndpointTarget,
} from "./types";

export const ATS_API_HOSTS = [
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.eu.lever.co",
  "api.ashbyhq.com",
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
  return new URL(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(tenant)}`,
  );
}

export function buildAtsEndpoint(target: AtsEndpointTarget): URL {
  switch (target.provider) {
    case "greenhouse":
      return buildGreenhouseEndpoint(target);
    case "lever":
      return buildLeverEndpoint(target);
    case "ashby":
      return buildAshbyEndpoint(target);
    default:
      throw atsAdapterError("ats_invalid_source");
  }
}
