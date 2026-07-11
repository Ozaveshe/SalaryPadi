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
  | "unconfigured"
  | "unauthorized"
  | "upstream_4xx"
  | "upstream_5xx";

export type AfroToolsOperation = "job_scam_check" | "offer_compare" | "paye";
export type AfroToolsRequestOperation =
  AfroToolsOperation | "catalog_sync" | "fx" | "salary_conversion";

export class AfroToolsApiError extends Error {
  constructor(
    public readonly code: AfroToolsFailureCode,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(`AfroTools provider failure: ${code}.`);
    this.name = "AfroToolsApiError";
  }
}

function errorForStatus(
  status: number,
  retryAfterSeconds: number | null,
): AfroToolsApiError {
  if (status === 401 || status === 403) {
    return new AfroToolsApiError("unauthorized", status, false);
  }
  if (status === 429) {
    return new AfroToolsApiError(
      "rate_limited",
      status,
      true,
      retryAfterSeconds,
    );
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
  operation: AfroToolsRequestOperation,
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
  return requestAfroTools(path, { method: "POST", body: payload });
}

const allowedPaths = new Set(["/tax/paye", "/tax/rates", "/fx/rates"]);

function parseRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(Math.round(seconds), 86_400)
    : null;
}

export async function requestAfroTools(
  path: string,
  options:
    | { method: "POST"; body: unknown }
    | { method: "GET"; query?: Record<string, string | number | undefined> },
): Promise<Record<string, unknown>> {
  if (!allowedPaths.has(path)) {
    throw new AfroToolsApiError("upstream_4xx", 400, false);
  }
  const configuration = getAfroToolsConfig();
  if (!configuration.apiKey) {
    throw new AfroToolsApiError("unconfigured", 503, false);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AFROTOOLS_TIMEOUT_MS);
  try {
    const endpoint = new URL(`${configuration.baseUrl}${path}`);
    if (options.method === "GET") {
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) endpoint.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(endpoint, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.method === "POST"
          ? { "Content-Type": "application/json" }
          : {}),
        "x-api-key": configuration.apiKey,
      },
      ...(options.method === "POST"
        ? { body: JSON.stringify(options.body) }
        : {}),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw errorForStatus(
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }

    if (!response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel().catch(() => undefined);
      throw invalidAfroToolsResponse();
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
