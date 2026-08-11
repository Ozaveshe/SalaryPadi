import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { operatorJobIntakeSchema } from "@/lib/admin/job-intake";
import { getStaffApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 140_000, {
    invalidMessage: "Invalid operator job intake form.",
  });
  if (!form.ok) return form.response;
  const parsed = operatorJobIntakeSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success)
    return noStoreJson(
      { error: "Review the source, job and eligibility evidence fields." },
      { status: 400 },
    );
  const context = await getStaffApiContext(["data_quality", "admin"]);
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "admin.job_intake.create",
    "job_intake_create_failed",
    "Job intake is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc(
        "admin_submit_job_intake" as never,
        {
          p_payload: parsed.data,
        } as never,
      ),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "admin.job_intake.create",
    "job_intake_create_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  if (!result.ok)
    return noStoreJson(
      { error: "Job intake could not be confirmed." },
      { status: 503 },
    );
  const url = new URL(`/admin/jobs/intake/${result.data}`, getAppOrigin());
  url.searchParams.set("submitted", "true");
  return noStoreRedirect(url, 303);
}
