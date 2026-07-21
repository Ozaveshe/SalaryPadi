import { discardResponseBody } from "@/lib/http/body";
import { JsonBodyError, readBoundedJson } from "@/lib/http/json";

import { sourceResponseCheckedAt } from "./freshness";
import { jobicyResponseSchema } from "./jobicy-schema";
import { normalizeJobicyJob } from "./normalize";
import type { Job } from "./types";

/**
 * The EMEA geo filter keeps the single permitted request focused on the
 * region that can contain Africa-eligible listings. Jobicy's unfiltered feed
 * is dominated by US-only roles that the eligibility gate must discard, while
 * the EMEA slice carries the EMEA-wide and worldwide ("Anywhere") listings
 * Africans can actually apply for.
 */
export const JOBICY_ENDPOINT =
  "https://jobicy.com/api/v2/remote-jobs?count=100&geo=emea";
export const JOBICY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const JOBICY_ADAPTER_ERROR_CODES = [
  "jobicy_request_aborted",
  "jobicy_request_failed",
  "jobicy_http_error",
  "jobicy_invalid_content_type",
  "jobicy_response_too_large",
  "jobicy_invalid_json",
  "jobicy_invalid_payload",
  "jobicy_normalization_failed",
] as const;

export type JobicyAdapterErrorCode =
  (typeof JOBICY_ADAPTER_ERROR_CODES)[number];

export class JobicyAdapterError extends Error {
  constructor(
    public readonly code: JobicyAdapterErrorCode,
    public readonly status: number | null = null,
  ) {
    super(code);
    this.name = "JobicyAdapterError";
  }
}

export type JobicyRequestInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

export interface JobicyAdapterOptions {
  fetch?: typeof globalThis.fetch;
  requestedAt?: Date;
  signal?: AbortSignal;
  requestInit?: JobicyRequestInit;
}

function safeHeaders(init: JobicyRequestInit | undefined) {
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

/**
 * Reads Jobicy's documented, already delayed public feed. The fixed endpoint,
 * credential stripping, response bound, six-hour cache policy at the caller,
 * and strict schema keep provider data outside the trust boundary.
 */
export async function fetchJobicyJobs(
  options: JobicyAdapterOptions = {},
): Promise<{ jobs: Job[]; checkedAt: string }> {
  const requestedAt = new Date(options.requestedAt?.valueOf() ?? Date.now());
  if (!Number.isFinite(requestedAt.valueOf())) {
    throw new JobicyAdapterError("jobicy_request_failed");
  }

  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(JOBICY_ENDPOINT, {
      ...options.requestInit,
      method: "GET",
      body: null,
      credentials: "omit",
      redirect: "error",
      headers: safeHeaders(options.requestInit),
      signal: options.signal ?? options.requestInit?.signal,
    });
  } catch {
    throw new JobicyAdapterError(
      options.signal?.aborted
        ? "jobicy_request_aborted"
        : "jobicy_request_failed",
    );
  }

  if (!response.ok) {
    await discardResponseBody(response);
    throw new JobicyAdapterError("jobicy_http_error", response.status);
  }
  if (!isJson(response)) {
    await discardResponseBody(response);
    throw new JobicyAdapterError("jobicy_invalid_content_type");
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, JOBICY_MAX_RESPONSE_BYTES);
  } catch (reason) {
    throw new JobicyAdapterError(
      reason instanceof JsonBodyError && reason.code === "too_large"
        ? "jobicy_response_too_large"
        : "jobicy_invalid_json",
    );
  }

  const parsed = jobicyResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new JobicyAdapterError("jobicy_invalid_payload");
  }
  const checkedAt = sourceResponseCheckedAt(response.headers, requestedAt);
  try {
    return {
      jobs: parsed.data.jobs.map((job) => normalizeJobicyJob(job, checkedAt)),
      checkedAt,
    };
  } catch {
    throw new JobicyAdapterError("jobicy_normalization_failed");
  }
}
