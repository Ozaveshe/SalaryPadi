import { discardResponseBody } from "@/lib/http/body";
import { JsonBodyError, readBoundedJson } from "@/lib/http/json";

import { sourceResponseCheckedAt } from "./freshness";
import { himalayasResponseSchema } from "./himalayas-schema";
import { normalizeHimalayasJob } from "./normalize";
import type { Job } from "./types";

export const HIMALAYAS_ENDPOINTS = [
  "https://himalayas.app/jobs/api/search?country=NG&exclude_worldwide=true&sort=recent&page=1",
  "https://himalayas.app/jobs/api/search?country=NG&exclude_worldwide=true&sort=recent&page=2",
  "https://himalayas.app/jobs/api/search?country=NG&exclude_worldwide=true&sort=recent&page=3",
  "https://himalayas.app/jobs/api/search?country=NG&exclude_worldwide=true&sort=recent&page=4",
  "https://himalayas.app/jobs/api/search?country=NG&exclude_worldwide=true&sort=recent&page=5",
  "https://himalayas.app/jobs/api/search?worldwide=true&sort=recent&page=1",
] as const;
export const HIMALAYAS_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const HIMALAYAS_ADAPTER_ERROR_CODES = [
  "himalayas_request_aborted",
  "himalayas_request_failed",
  "himalayas_http_error",
  "himalayas_invalid_content_type",
  "himalayas_response_too_large",
  "himalayas_invalid_json",
  "himalayas_invalid_payload",
  "himalayas_normalization_failed",
] as const;

export type HimalayasAdapterErrorCode =
  (typeof HIMALAYAS_ADAPTER_ERROR_CODES)[number];

export class HimalayasAdapterError extends Error {
  constructor(
    public readonly code: HimalayasAdapterErrorCode,
    public readonly status: number | null = null,
  ) {
    super(code);
    this.name = "HimalayasAdapterError";
  }
}

export type HimalayasRequestInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

export interface HimalayasAdapterOptions {
  fetch?: typeof globalThis.fetch;
  requestedAt?: Date;
  signal?: AbortSignal;
  requestInit?: HimalayasRequestInit;
  /** Gap between paced page requests; tests pass 0. */
  pageDelayMs?: number;
}

function safeHeaders(init: HimalayasRequestInit | undefined) {
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

async function readPage(
  endpoint: string,
  options: HimalayasAdapterOptions,
  requestedAt: Date,
) {
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(endpoint, {
      ...options.requestInit,
      method: "GET",
      body: null,
      credentials: "omit",
      redirect: "error",
      headers: safeHeaders(options.requestInit),
      signal: options.signal ?? options.requestInit?.signal,
    });
  } catch {
    throw new HimalayasAdapterError(
      options.signal?.aborted
        ? "himalayas_request_aborted"
        : "himalayas_request_failed",
    );
  }

  if (!response.ok) {
    await discardResponseBody(response);
    throw new HimalayasAdapterError("himalayas_http_error", response.status);
  }
  if (!isJson(response)) {
    await discardResponseBody(response);
    throw new HimalayasAdapterError("himalayas_invalid_content_type");
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, HIMALAYAS_MAX_RESPONSE_BYTES);
  } catch (reason) {
    throw new HimalayasAdapterError(
      reason instanceof JsonBodyError && reason.code === "too_large"
        ? "himalayas_response_too_large"
        : "himalayas_invalid_json",
    );
  }

  const parsed = himalayasResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HimalayasAdapterError("himalayas_invalid_payload");
  }
  const checkedAt = sourceResponseCheckedAt(response.headers, requestedAt);
  try {
    return {
      jobs: parsed.data.jobs.map((job) =>
        normalizeHimalayasJob(job, checkedAt),
      ),
      checkedAt,
    };
  } catch {
    throw new HimalayasAdapterError("himalayas_normalization_failed");
  }
}

/**
 * Fetches bounded Nigeria-eligible and worldwide pages from Himalayas. Pages
 * are isolated: one failed page yields a degraded source instead of hiding
 * valid jobs returned by the other documented queries.
 */
export async function fetchHimalayasJobs(
  options: HimalayasAdapterOptions = {},
): Promise<{
  jobs: Job[];
  checkedAt: string;
  partial: boolean;
  successfulRequestCount: number;
}> {
  const requestedAt = new Date(options.requestedAt?.valueOf() ?? Date.now());
  if (!Number.isFinite(requestedAt.valueOf())) {
    throw new HimalayasAdapterError("himalayas_request_failed");
  }

  // Pages are fetched one at a time with a short gap to respect the
  // documented one-request-per-second pacing.
  const pages: PromiseSettledResult<Awaited<ReturnType<typeof readPage>>>[] =
    [];
  for (const [index, endpoint] of HIMALAYAS_ENDPOINTS.entries()) {
    if (index > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.pageDelayMs ?? 1_000),
      );
    }
    try {
      pages.push({
        status: "fulfilled",
        value: await readPage(endpoint, options, requestedAt),
      });
    } catch (reason) {
      pages.push({ status: "rejected", reason });
    }
  }
  const successful = pages
    .filter(
      (
        page,
      ): page is PromiseFulfilledResult<Awaited<ReturnType<typeof readPage>>> =>
        page.status === "fulfilled",
    )
    .map((page) => page.value);
  if (successful.length === 0) {
    const firstFailure = pages.find(
      (page): page is PromiseRejectedResult => page.status === "rejected",
    );
    throw firstFailure?.reason instanceof HimalayasAdapterError
      ? firstFailure.reason
      : new HimalayasAdapterError("himalayas_request_failed");
  }

  const byId = new Map<string, Job>();
  for (const page of successful) {
    for (const job of page.jobs) byId.set(job.id, job);
  }
  return {
    jobs: [...byId.values()],
    checkedAt: successful
      .map((page) => page.checkedAt)
      .toSorted()
      .at(0)!,
    partial: successful.length !== HIMALAYAS_ENDPOINTS.length,
    successfulRequestCount: successful.length,
  };
}
