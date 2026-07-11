import { AfroToolsApiError } from "@/lib/afrotools/client";

export type PublicAfroToolsError = {
  status: number;
  code: string;
  error: string;
  retryAfterSeconds?: number;
};

export function publicAfroToolsError(
  reason: unknown,
  service: string,
): PublicAfroToolsError {
  const failure =
    reason instanceof AfroToolsApiError
      ? reason
      : new AfroToolsApiError("network", 503, true);
  if (failure.code === "rate_limited") {
    return {
      status: 429,
      code: failure.code,
      error: `${service} is rate-limited. Try again later.`,
      ...(failure.retryAfterSeconds === null
        ? {}
        : { retryAfterSeconds: failure.retryAfterSeconds }),
    };
  }
  if (failure.code === "invalid_response") {
    return {
      status: 502,
      code: failure.code,
      error: `${service} returned data SalaryPadi could not verify. No result was produced.`,
    };
  }
  if (failure.code === "timeout") {
    return {
      status: 504,
      code: failure.code,
      error: `${service} timed out. No result was produced.`,
    };
  }
  return {
    status: 503,
    code: failure.code,
    error: `${service} is temporarily unavailable. No result was produced.`,
  };
}
