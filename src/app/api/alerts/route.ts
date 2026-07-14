import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { parseJobSearch, parseStoredJobAlertSearch } from "@/lib/jobs/search";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  keyword: z.string().trim().max(160).default(""),
  location: z.string().trim().max(160).default(""),
  eligibility: z.enum(["nigeria", "africa", "worldwide", "unclear", "all"]),
  cadence: z.enum(["daily", "weekly"]),
  search_query: z.string().max(10_000).optional(),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 16_384, {
    invalidMessage: "Invalid alert form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreJson({ error: "Invalid alert." }, { status: 400 });
  const storedSearch = parseStoredJobAlertSearch(parsed.data.search_query);
  if (!storedSearch) {
    return noStoreJson({ error: "Invalid alert search." }, { status: 400 });
  }
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const query = parseJobSearch({
    ...storedSearch,
    q: parsed.data.keyword,
    location: parsed.data.location,
    eligibility: parsed.data.eligibility,
  });
  const operation = await attemptApiOperation(
    "alerts.create",
    "alert_create_failed",
    "Job-alert service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("create_job_alert", {
        alert_query: query,
        alert_cadence: parsed.data.cadence,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "alerts.create",
    "alert_create_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  const url = new URL("/alerts", getAppOrigin());
  url.searchParams.set("created", result.ok ? "true" : "error");
  return noStoreRedirect(url, 303);
}
