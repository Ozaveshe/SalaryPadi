import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  assessCorporateEmail,
  employerJobSubmissionSchema,
} from "@/lib/employers/submission";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 80_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const parsed = employerJobSubmissionSchema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Review the required job and eligibility fields." },
      { status: 400 },
    );
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const corporateAssessment = assessCorporateEmail(
    parsed.data.corporate_email,
    parsed.data.company_website,
  );
  const { error } = await context.supabase
    .schema("api")
    .rpc("submit_employer_job", {
      submission_payload: parsed.data,
      corporate_domain_matches:
        corporateAssessment.domainMatches &&
        !corporateAssessment.isFreeProvider,
    });
  const url = new URL("/post-a-job", getAppOrigin());
  url.searchParams.set("submitted", error ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
