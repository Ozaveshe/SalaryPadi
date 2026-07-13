import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { getJobBySlug } from "@/lib/jobs/repository";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";

const schema = z.object({
  job_slug: z.string().min(1).max(220),
  return_to: z.string().optional(),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid job." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { job } = await getJobBySlug(parsed.data.job_slug);
  if (!job)
    return Response.json(
      { error: "Job is no longer available." },
      { status: 404 },
    );
  const { error } = job.databaseId
    ? await context.supabase
        .schema("api")
        .rpc("set_job_saved", { p_job_id: job.databaseId, p_saved: true })
    : await context.supabase.schema("api").rpc("save_external_job", {
        source_key: job.source.id,
        external_id: job.externalId,
        job_slug: job.slug,
        job_title: job.title,
        company_name: job.company.name,
        source_url: job.sourceUrl,
        posted_at: job.postedAt,
        eligibility_evidence: job.eligibility.evidenceText,
      });
  const destination = safeRelativePath(parsed.data.return_to, "/saved");
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("saved", error ? "error" : "true");
  if (!error) {
    url.searchParams.set("salary_company", job.company.name);
    url.searchParams.set("salary_role", job.title);
  }
  return NextResponse.redirect(url, 303);
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const id = new URL(request.url).searchParams.get("id");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success)
    return Response.json({ error: "Invalid saved job." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { error } = await context.supabase
    .schema("api")
    .rpc("remove_saved_job", { saved_job_id: parsed.data });
  return Response.json({ ok: !error }, { status: error ? 400 : 200 });
}
