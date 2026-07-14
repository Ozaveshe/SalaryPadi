import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";

import { getServerEnvironment } from "@/lib/env";
import {
  fetchRemotivePayload,
  RemotiveAdapterError,
} from "@/lib/jobs/remotive-adapter";
import {
  claimRemotiveFetchBudget,
  SourceFetchBudgetError,
} from "@/lib/jobs/source-fetch-budget";
import { openSupplyAdapter } from "@/lib/jobs/supply/adapters";
import { AdapterPolicyError } from "@/lib/jobs/supply/policy";
import { isValidInternalBearer } from "@/lib/security/internal-bearer";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const environment = getServerEnvironment();
  const expected = environment.JOB_SOURCE_SYNC_TOKEN;
  if (!isValidInternalBearer(request, expected)) {
    return noStoreJson({ error: "unauthorized" }, 401);
  }
  try {
    openSupplyAdapter("remotive");
  } catch (reason) {
    unstable_rethrow(reason);
    const code =
      reason instanceof AdapterPolicyError
        ? `remotive_${reason.code}`
        : "remotive_policy_invalid";
    return noStoreJson({ error: code }, 503);
  }
  if (!environment.REMOTIVE_SOURCE_ENABLED) {
    return noStoreJson({ error: "remotive_environment_disabled" }, 503);
  }

  try {
    const claimed = await claimRemotiveFetchBudget(
      randomUUID(),
      request.signal,
    );
    if (!claimed) {
      return noStoreJson({ error: "remotive_fetch_budget_exhausted" }, 429);
    }
    const result = await fetchRemotivePayload({
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      requestInit: {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "SalaryPadi/1.0 (+https://salarypadi.com/about)",
        },
      },
    });
    return Response.json(result.payload, {
      headers: {
        "Cache-Control": "no-store",
        Date: new Date(result.checkedAt).toUTCString(),
      },
    });
  } catch (reason) {
    unstable_rethrow(reason);
    if (reason instanceof RemotiveAdapterError) {
      return noStoreJson({ error: reason.code }, 502);
    }
    if (reason instanceof SourceFetchBudgetError) {
      return noStoreJson({ error: reason.code }, 503);
    }
    return noStoreJson({ error: "remotive_source_proxy_failed" }, 503);
  }
}
