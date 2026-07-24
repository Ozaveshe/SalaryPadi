import { discardResponseBody } from "@/lib/http/body";
import { JsonBodyError, readBoundedJson } from "@/lib/http/json";

import { sourceResponseCheckedAt } from "./freshness";
import { normalizeReliefWebJob } from "./normalize";
import { reliefWebResponseSchema } from "./reliefweb-schema";
import type { Job } from "./types";

/**
 * One bounded request against the documented ReliefWeb jobs API, restricted
 * to African duty stations and the registry-permitted fields. The appname is
 * the pre-approved credential ReliefWeb issues per application — without it
 * the adapter refuses to build a request at all, so the connector stays dark
 * until the pending application is granted.
 */
export function reliefWebEndpoint(appName: string): string {
  const url = new URL("https://api.reliefweb.int/v1/jobs");
  url.searchParams.set("appname", appName);
  url.searchParams.set("limit", "200");
  url.searchParams.append("fields[include][]", "title");
  url.searchParams.append("fields[include][]", "url");
  url.searchParams.append("fields[include][]", "date");
  url.searchParams.append("fields[include][]", "source");
  url.searchParams.append("fields[include][]", "country");
  url.searchParams.append("fields[include][]", "type");
  url.searchParams.append("fields[include][]", "career_categories");
  url.searchParams.append("sort[]", "date.created:desc");
  url.searchParams.set("filter[field]", "country.iso3");
  // The reviewed request stays focused on African duty stations; the
  // eligibility gate still classifies every record independently.
  for (const iso3 of RELIEFWEB_AFRICAN_ISO3) {
    url.searchParams.append("filter[value][]", iso3);
  }
  url.searchParams.set("filter[operator]", "OR");
  return url.toString();
}

/** ISO3 codes for the African countries the reviewed request targets. */
export const RELIEFWEB_AFRICAN_ISO3 = [
  "nga",
  "gha",
  "ken",
  "zaf",
  "egy",
  "eth",
  "tza",
  "uga",
  "rwa",
  "sen",
  "civ",
  "cmr",
  "cod",
  "moz",
  "zmb",
  "zwe",
  "mar",
  "tun",
  "dza",
  "ben",
  "bfa",
  "mli",
  "ner",
  "tcd",
  "sdn",
  "ssd",
  "som",
  "mwi",
  "lbr",
  "sle",
  "gmb",
  "gin",
  "tgo",
  "bdi",
  "ago",
  "nam",
  "bwa",
  "lso",
  "swz",
  "mdg",
  "mus",
  "gab",
  "cog",
  "caf",
  "mrt",
  "eri",
  "dji",
  "lby",
] as const;

export const RELIEFWEB_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export const RELIEFWEB_ADAPTER_ERROR_CODES = [
  "reliefweb_appname_missing",
  "reliefweb_request_aborted",
  "reliefweb_request_failed",
  "reliefweb_http_error",
  "reliefweb_invalid_content_type",
  "reliefweb_response_too_large",
  "reliefweb_invalid_json",
  "reliefweb_invalid_payload",
  "reliefweb_normalization_failed",
] as const;

export type ReliefWebAdapterErrorCode =
  (typeof RELIEFWEB_ADAPTER_ERROR_CODES)[number];

export class ReliefWebAdapterError extends Error {
  constructor(
    public readonly code: ReliefWebAdapterErrorCode,
    public readonly status: number | null = null,
  ) {
    super(code);
    this.name = "ReliefWebAdapterError";
  }
}

export type ReliefWebRequestInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

export interface ReliefWebAdapterOptions {
  /** The pre-approved ReliefWeb appname credential. */
  appName?: string | null;
  fetch?: typeof globalThis.fetch;
  requestedAt?: Date;
  signal?: AbortSignal;
  requestInit?: ReliefWebRequestInit;
}

function safeHeaders(init: ReliefWebRequestInit | undefined) {
  const headers = new Headers(init?.headers);
  for (const name of [
    "authorization",
    "cookie",
    "proxy-authorization",
    "x-api-key",
    "apikey",
  ]) {
    headers.delete(name);
  }
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "SalaryPadi/1.0 (+https://salarypadi.com/about)");
  return headers;
}

function isJson(response: Response) {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
  );
}

export async function fetchReliefWebJobs(
  options: ReliefWebAdapterOptions = {},
): Promise<{ jobs: Job[]; checkedAt: string }> {
  const appName = options.appName?.trim();
  if (!appName) {
    throw new ReliefWebAdapterError("reliefweb_appname_missing");
  }
  const requestedAt = new Date(options.requestedAt?.valueOf() ?? Date.now());
  if (!Number.isFinite(requestedAt.valueOf())) {
    throw new ReliefWebAdapterError("reliefweb_request_failed");
  }

  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(
      reliefWebEndpoint(appName),
      {
        ...options.requestInit,
        method: "GET",
        body: null,
        credentials: "omit",
        redirect: "error",
        headers: safeHeaders(options.requestInit),
        signal: options.signal ?? options.requestInit?.signal,
      },
    );
  } catch {
    throw new ReliefWebAdapterError(
      options.signal?.aborted
        ? "reliefweb_request_aborted"
        : "reliefweb_request_failed",
    );
  }

  if (!response.ok) {
    await discardResponseBody(response);
    throw new ReliefWebAdapterError("reliefweb_http_error", response.status);
  }
  if (!isJson(response)) {
    await discardResponseBody(response);
    throw new ReliefWebAdapterError("reliefweb_invalid_content_type");
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, RELIEFWEB_MAX_RESPONSE_BYTES);
  } catch (reason) {
    throw new ReliefWebAdapterError(
      reason instanceof JsonBodyError && reason.code === "too_large"
        ? "reliefweb_response_too_large"
        : "reliefweb_invalid_json",
    );
  }

  const parsed = reliefWebResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ReliefWebAdapterError("reliefweb_invalid_payload");
  }
  const checkedAt = sourceResponseCheckedAt(response.headers, requestedAt);
  try {
    return {
      jobs: parsed.data.data.map((job) =>
        normalizeReliefWebJob(job, checkedAt),
      ),
      checkedAt,
    };
  } catch {
    throw new ReliefWebAdapterError("reliefweb_normalization_failed");
  }
}
