import "server-only";

import { getAfroToolsConfig } from "@/lib/env";
import { JsonBodyError, readBoundedJson } from "@/lib/http/json";

const AFROTOOLS_TIMEOUT_MS = 10_000;
const AFROTOOLS_RESPONSE_MAX_BYTES = 1_000_000;

export type AfroToolsFailureCode =
  | "invalid_response"
  | "network"
  | "rate_limited"
  | "timeout"
  | "unauthorized"
  | "upstream_4xx"
  | "upstream_5xx";

export type AfroToolsOperation = "job_scam_check" | "offer_compare" | "paye";

export class AfroToolsApiError extends Error {
  constructor(
    public readonly code: AfroToolsFailureCode,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(`AfroTools provider failure: ${code}.`);
    this.name = "AfroToolsApiError";
  }
}

function errorForStatus(status: number): AfroToolsApiError {
  if (status === 401 || status === 403) {
    return new AfroToolsApiError("unauthorized", status, false);
  }
  if (status === 429) {
    return new AfroToolsApiError("rate_limited", status, true);
  }
  if (status >= 500) {
    return new AfroToolsApiError("upstream_5xx", status, true);
  }
  return new AfroToolsApiError("upstream_4xx", status, false);
}

export function invalidAfroToolsResponse(): AfroToolsApiError {
  return new AfroToolsApiError("invalid_response", 502, false);
}

function normalizeProviderError(error: unknown): AfroToolsApiError {
  if (error instanceof AfroToolsApiError) return error;
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new AfroToolsApiError("timeout", 504, true);
  }
  return new AfroToolsApiError("network", 503, true);
}

/** Emits only stable provider metadata; request values, URLs and secrets stay out. */
export function logAfroToolsFallback(
  operation: AfroToolsOperation,
  error: unknown,
): void {
  const providerError = normalizeProviderError(error);
  console.warn(
    JSON.stringify({
      event: "provider_fallback",
      provider: "afrotools",
      operation,
      code: providerError.code,
      status: providerError.status,
      retryable: providerError.retryable,
    }),
  );
}

export async function callAfroTools(
  path: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const configuration = getAfroToolsConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AFROTOOLS_TIMEOUT_MS);
  try {
    const response = await fetch(`${configuration.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(configuration.apiKey ? { "x-api-key": configuration.apiKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw errorForStatus(response.status);
    }

    let body: unknown;
    try {
      body = await readBoundedJson(response, AFROTOOLS_RESPONSE_MAX_BYTES);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AfroToolsApiError("timeout", 504, true);
      }
      if (error instanceof JsonBodyError) throw invalidAfroToolsResponse();
      throw error;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw invalidAfroToolsResponse();
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof AfroToolsApiError)) {
      throw new AfroToolsApiError("timeout", 504, true);
    }
    throw normalizeProviderError(error);
  } finally {
    clearTimeout(timeout);
  }
}
