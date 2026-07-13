import { sourceResponseCheckedAt } from "./freshness";
import { normalizeRemotiveJob } from "./normalize";
import { remotiveResponseSchema } from "./remotive-schema";
import type { RemotiveResponse } from "./remotive-schema";
import type { Job } from "./types";

export const REMOTIVE_ENDPOINT = "https://remotive.com/api/remote-jobs";

/**
 * The live Remotive response was about 439 KiB on 2026-07-10. A 2 MiB hard
 * limit leaves more than four times that headroom while keeping an upstream
 * cache or schema failure from consuming unbounded memory.
 */
export const REMOTIVE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const REMOTIVE_ADAPTER_ERROR_CODES = [
  "remotive_invalid_options",
  "remotive_request_aborted",
  "remotive_request_failed",
  "remotive_http_error",
  "remotive_invalid_content_type",
  "remotive_response_too_large",
  "remotive_response_read_failed",
  "remotive_invalid_json",
  "remotive_invalid_payload",
  "remotive_empty",
  "remotive_normalization_failed",
] as const;

export type RemotiveAdapterErrorCode =
  (typeof REMOTIVE_ADAPTER_ERROR_CODES)[number];

const ERROR_MESSAGES = {
  remotive_invalid_options: "The Remotive adapter options are invalid.",
  remotive_request_aborted: "The Remotive request was cancelled.",
  remotive_request_failed: "The Remotive source could not be reached.",
  remotive_http_error: "The Remotive source returned an unsuccessful status.",
  remotive_invalid_content_type:
    "The Remotive source returned an unexpected content type.",
  remotive_response_too_large:
    "The Remotive source response exceeded the allowed size.",
  remotive_response_read_failed:
    "The Remotive source response could not be read.",
  remotive_invalid_json: "The Remotive source returned invalid JSON.",
  remotive_invalid_payload:
    "The Remotive source did not match its documented format.",
  remotive_empty: "The Remotive source returned no jobs.",
  remotive_normalization_failed:
    "A Remotive job could not be normalized safely.",
} satisfies Record<RemotiveAdapterErrorCode, string>;

export class RemotiveAdapterError extends Error {
  readonly code: RemotiveAdapterErrorCode;
  readonly status: number | null;

  constructor(code: RemotiveAdapterErrorCode, status: number | null = null) {
    super(ERROR_MESSAGES[code]);
    this.name = "RemotiveAdapterError";
    this.code = code;
    this.status = status;
  }
}

export type RemotiveFetch = typeof globalThis.fetch;

export type RemotiveRequestInit = RequestInit & {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};

export interface RemotiveAdapterOptions {
  fetch?: RemotiveFetch;
  signal?: AbortSignal;
  requestedAt?: Date;
  /** Total attempts for transient transport/provider failures. */
  maxAttempts?: number;
  /** Base delay between retries. May be set to zero by deterministic tests. */
  retryDelayMs?: number;
  /** May lower, but never raise, the production response limit. */
  maxResponseBytes?: number;
  /**
   * Allows callers to add runtime-specific cache options. The adapter always
   * forces a credential-free GET to the fixed Remotive endpoint.
   */
  requestInit?: RemotiveRequestInit;
}

export interface RemotiveAdapterResult {
  jobs: Job[];
  checkedAt: string;
}

export interface RemotivePayloadResult {
  payload: RemotiveResponse;
  checkedAt: string;
}

function adapterError(
  code: RemotiveAdapterErrorCode,
  status: number | null = null,
) {
  return new RemotiveAdapterError(code, status);
}

function resolveRequestedAt(value: Date | undefined): Date {
  const requestedAt = new Date(value?.valueOf() ?? Date.now());
  if (!Number.isFinite(requestedAt.valueOf())) {
    throw adapterError("remotive_invalid_options");
  }
  return requestedAt;
}

function resolveResponseLimit(value: number | undefined): number {
  if (value === undefined) return REMOTIVE_MAX_RESPONSE_BYTES;
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > REMOTIVE_MAX_RESPONSE_BYTES
  ) {
    throw adapterError("remotive_invalid_options");
  }
  return value;
}

function resolveMaxAttempts(value: number | undefined): number {
  if (value === undefined) return 3;
  if (!Number.isSafeInteger(value) || value < 1 || value > 3) {
    throw adapterError("remotive_invalid_options");
  }
  return value;
}

function resolveRetryDelay(value: number | undefined): number {
  if (value === undefined) return 250;
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_000) {
    throw adapterError("remotive_invalid_options");
  }
  return value;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function waitForRetry(
  delayMs: number,
  attempt: number,
  signal: AbortSignal | null | undefined,
) {
  if (isAborted(signal)) throw adapterError("remotive_request_aborted");
  if (delayMs === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs * attempt);
    const abort = () => {
      clearTimeout(timeout);
      reject(adapterError("remotive_request_aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    timeout.unref?.();
  });
}

function isJsonResponse(response: Response): boolean {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
  );
}

function isAborted(signal: AbortSignal | null | undefined): boolean {
  return signal?.aborted === true;
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal | null | undefined,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw adapterError("remotive_response_too_large");
  }

  const reader = response.body?.getReader();
  if (!reader) throw adapterError("remotive_response_read_failed");

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The bounded read has already failed; cancellation is best effort.
        }
        throw adapterError("remotive_response_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RemotiveAdapterError) throw error;
    throw adapterError(
      isAborted(signal)
        ? "remotive_request_aborted"
        : "remotive_response_read_failed",
    );
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw adapterError("remotive_invalid_json");
  }
}

function safeRequestHeaders(init: RemotiveRequestInit | undefined): Headers {
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
  return headers;
}

/**
 * Fetches and normalizes Remotive's public feed without trusting response
 * metadata as a memory bound. All returned jobs share the source response's
 * checked-at time so cached responses are not relabelled as fresh.
 */
export async function fetchRemotivePayload(
  options: RemotiveAdapterOptions = {},
): Promise<RemotivePayloadResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const requestedAt = resolveRequestedAt(options.requestedAt);
  const maxBytes = resolveResponseLimit(options.maxResponseBytes);
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const retryDelayMs = resolveRetryDelay(options.retryDelayMs);
  const signal = options.signal ?? options.requestInit?.signal;

  let response: Response | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetchImpl(REMOTIVE_ENDPOINT, {
        ...options.requestInit,
        method: "GET",
        body: null,
        credentials: "omit",
        redirect: "error",
        headers: safeRequestHeaders(options.requestInit),
        signal,
      });
    } catch {
      if (isAborted(signal)) throw adapterError("remotive_request_aborted");
      if (attempt === maxAttempts) {
        throw adapterError("remotive_request_failed");
      }
      await waitForRetry(retryDelayMs, attempt, signal);
      continue;
    }

    if (response.ok) break;
    if (attempt === maxAttempts || !isRetryableStatus(response.status)) {
      throw adapterError("remotive_http_error", response.status);
    }
    await response.body?.cancel().catch(() => undefined);
    await waitForRetry(retryDelayMs, attempt, signal);
  }
  if (!response) throw adapterError("remotive_request_failed");
  if (!isJsonResponse(response)) {
    throw adapterError("remotive_invalid_content_type");
  }

  const text = await readBoundedResponse(response, maxBytes, signal);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw adapterError("remotive_invalid_json");
  }

  const parsed = remotiveResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw adapterError("remotive_invalid_payload");
  }
  if (parsed.data.jobs.length === 0) {
    throw adapterError("remotive_empty");
  }

  const checkedAt = sourceResponseCheckedAt(response.headers, requestedAt);
  return { payload: parsed.data, checkedAt };
}

export async function fetchRemotiveJobs(
  options: RemotiveAdapterOptions = {},
): Promise<RemotiveAdapterResult> {
  const { payload, checkedAt } = await fetchRemotivePayload(options);
  try {
    return {
      jobs: payload.jobs.map((job) => normalizeRemotiveJob(job, checkedAt)),
      checkedAt,
    };
  } catch {
    throw adapterError("remotive_normalization_failed");
  }
}
