import "server-only";

import { z } from "zod";

import { getServerEnvironment } from "@/lib/env";
import { readBoundedJson } from "@/lib/http/json";
import { getSalaryPadiSupabaseOrigin } from "@/lib/supabase/project";

const claimResponseSchema = z.boolean();

export class SourceFetchBudgetError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SourceFetchBudgetError";
  }
}

export async function claimRemotiveFetchBudget(
  requestKey: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!z.string().uuid().safeParse(requestKey).success) {
    throw new SourceFetchBudgetError("source_fetch_claim_invalid");
  }
  const environment = getServerEnvironment();
  if (
    !environment.NEXT_PUBLIC_SUPABASE_URL ||
    !environment.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new SourceFetchBudgetError("source_fetch_backend_unconfigured");
  }
  const origin = getSalaryPadiSupabaseOrigin(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    { allowLocal: environment.NODE_ENV !== "production" },
  );
  const response = await fetch(
    `${origin}/rest/v1/rpc/worker_claim_remotive_fetch`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "api",
        "Content-Profile": "api",
        apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_request_key: requestKey,
        p_purpose: "next_data_cache_fill",
      }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(4_000)])
        : AbortSignal.timeout(4_000),
    },
  );
  if (!response.ok) {
    throw new SourceFetchBudgetError(`source_fetch_claim_${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(response, 8 * 1024);
  } catch {
    throw new SourceFetchBudgetError("source_fetch_claim_json");
  }
  const parsed = claimResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SourceFetchBudgetError("source_fetch_claim_shape");
  }
  return parsed.data;
}
