import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
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
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid application." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { job } = await getJobBySlug(parsed.data.job_slug);
  if (!job)
    return Response.json(
      { error: "Job is no longer available." },
      { status: 404 },
    );
  const { error } = await context.supabase
    .schema("api")
    .rpc("record_external_application", {
      source_key: job.source.id,
      external_id: job.externalId,
      job_slug: job.slug,
      job_title: job.title,
      company_name: job.company.name,
      source_url: job.sourceUrl,
      application_status: parsed.data.status,
    });
  const url = new URL("/applications", getAppOrigin());
  url.searchParams.set("created", error ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
