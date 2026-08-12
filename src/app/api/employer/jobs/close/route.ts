import { z } from "zod";
import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcBooleanResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const closeSchema = z
  .object({
    submission_id: z.string().uuid(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid employer job closure form.",
  });
  if (!form.ok) return form.response;
  const parsed = closeSchema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreRedirect(
      new URL("/employer/jobs?closed=error", getAppOrigin()),
      303,
    );
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "employer.jobs.close",
    "employer_job_close_failed",
    "Employer listing service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("close_my_employer_job", {
        p_submission_id: parsed.data.submission_id,
        p_reason: parsed.data.reason,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "employer.jobs.close",
    "employer_job_close_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );
  return noStoreRedirect(
    new URL(
      `/employer/jobs?closed=${result.ok && result.data ? "true" : "error"}`,
      getAppOrigin(),
    ),
    303,
  );
}
