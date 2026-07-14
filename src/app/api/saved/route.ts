import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcBooleanResultSchema,
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { getJobBySlug } from "@/lib/jobs/repository";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";

const schema = z.object({
  job_slug: z.string().min(1).max(220),
  return_to: z.string().optional(),
});
const savedCreateResultSchema = z.union([
  apiRpcBooleanResultSchema,
  apiRpcUuidResultSchema,
]);

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid saved-job form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreJson({ error: "Invalid job." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { feed, job } = await getJobBySlug(parsed.data.job_slug);
  if (!job && feed.state !== "live") {
    return noStoreJson(
      { error: "Job availability could not be confirmed. Try again later." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }
  if (!job)
    return noStoreJson(
      { error: "Job is no longer available." },
      { status: 404 },
    );
  const operation = await attemptApiOperation(
    "saved.create",
    "saved_job_create_failed",
    "Saved-job service is temporarily unavailable.",
    async () =>
      job.databaseId
        ? await context.supabase.schema("api").rpc("set_job_saved", {
            p_job_id: job.databaseId,
            p_saved: true,
          })
        : await context.supabase.schema("api").rpc("save_external_job", {
            source_key: job.source.id,
            external_id: job.externalId,
            job_slug: job.slug,
            job_title: job.title,
            company_name: job.company.name,
            source_url: job.sourceUrl,
            posted_at: job.postedAt,
            eligibility_evidence: job.eligibility.evidenceText,
          }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "saved.create",
    "saved_job_create_failed",
    operation.value,
    savedCreateResultSchema,
  );
  const saved = result.ok && result.data !== false;
  const destination = safeRelativePath(parsed.data.return_to, "/saved");
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("saved", saved ? "true" : "error");
  if (saved) {
    url.searchParams.set("salary_company", job.company.name);
    url.searchParams.set("salary_role", job.title);
  }
  return noStoreRedirect(url, 303);
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const id = new URL(request.url).searchParams.get("id");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success)
    return noStoreJson({ error: "Invalid saved job." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "saved.delete",
    "saved_job_delete_failed",
    "Saved-job service is temporarily unavailable.",
    () =>
      context.supabase
        .schema("api")
        .rpc("remove_saved_job", { saved_job_id: parsed.data }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "saved.delete",
    "saved_job_delete_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );
  const deleted = result.ok && result.data;
  return noStoreJson({ ok: deleted }, { status: deleted ? 200 : 400 });
}
