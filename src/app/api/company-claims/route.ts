import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  company_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  corporate_domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/,
    ),
  relationship: z.enum(["owner", "employee", "authorised_representative"]),
  job_title: z.string().trim().min(2).max(120),
  evidence_reference: z.string().trim().max(300).default(""),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 12_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid company claim." }, { status: 400 });
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;
  const { error } = await authenticated.supabase.schema("api").rpc(
    "submit_company_claim" as never,
    {
      p_company_slug: parsed.data.company_slug,
      p_corporate_domain: parsed.data.corporate_domain,
      p_relationship: parsed.data.relationship,
      p_job_title: parsed.data.job_title,
      p_evidence_reference: parsed.data.evidence_reference || null,
    } as never,
  );
  return NextResponse.redirect(
    new URL(
      `/companies/${parsed.data.company_slug}/claim?status=${error ? "error" : "submitted"}`,
      getAppOrigin(),
    ),
    303,
  );
}
