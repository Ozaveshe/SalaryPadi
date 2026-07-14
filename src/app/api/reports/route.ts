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
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";

const schema = z.object({
  target_type: z.enum([
    "job",
    "company",
    "review",
    "interview",
    "salary",
    "benefit",
    "pay_reliability",
    "employer_response",
    "contribution",
    "feed_post",
    "forum_thread",
    "forum_reply",
  ]),
  target_id: z.string().min(1).max(220),
  category: z.enum([
    "expired",
    "fee",
    "impersonation",
    "eligibility",
    "incorrect",
    "privacy",
    "spam",
    "harassment",
    "misinformation",
    "correction",
    "appeal",
    "takedown",
    "deletion",
    "serious_allegation",
    "other",
  ]),
  narrative: z.string().trim().max(2_000).default(""),
  return_to: z.string().optional(),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 8_192, {
    invalidMessage: "Invalid report form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreJson({ error: "Invalid report." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "reports.submit",
    "report_submit_failed",
    "Reporting service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("submit_report", {
        p_target_kind: parsed.data.target_type,
        p_target_id: parsed.data.target_id,
        p_category: parsed.data.category,
        p_narrative: parsed.data.narrative || undefined,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "reports.submit",
    "report_submit_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  const destination = safeRelativePath(
    parsed.data.return_to,
    "/trust-and-safety",
  );
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("reported", result.ok ? "true" : "error");
  return noStoreRedirect(url, 303);
}
