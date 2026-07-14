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
import { getJobBySlug } from "@/lib/jobs/repository";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  job_slug: z.string().min(1).max(220),
  status: z
    .enum([
      "saved",
      "applied",
      "assessment",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
    ])
    .default("applied"),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid application form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreJson({ error: "Invalid application." }, { status: 400 });
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
    "applications.create",
    "application_create_failed",
    "Application tracking service is temporarily unavailable.",
    async () =>
      job.databaseId
        ? await context.supabase.schema("api").rpc("upsert_application", {
            p_job_id: job.databaseId,
            p_status: parsed.data.status,
          })
        : await context.supabase
            .schema("api")
            .rpc("record_external_application", {
              source_key: job.source.id,
              external_id: job.externalId,
              job_slug: job.slug,
              job_title: job.title,
              company_name: job.company.name,
              source_url: job.sourceUrl,
              application_status: parsed.data.status,
            }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "applications.create",
    "application_create_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  const url = new URL("/applications", getAppOrigin());
  url.searchParams.set("created", result.ok ? "true" : "error");
  if (result.ok) {
    url.searchParams.set("salary_company", job.company.name);
    url.searchParams.set("salary_role", job.title);
  }
  return noStoreRedirect(url, 303);
}
