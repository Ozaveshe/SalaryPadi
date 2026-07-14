import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  assessCorporateEmail,
  employerJobSubmissionSchema,
} from "@/lib/employers/submission";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 80_000, {
    invalidMessage: "Invalid employer submission form.",
  });
  if (!form.ok) return form.response;
  const parsed = employerJobSubmissionSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success)
    return noStoreJson(
      { error: "Review the required job and eligibility fields." },
      { status: 400 },
    );
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const corporateAssessment = assessCorporateEmail(
    parsed.data.corporate_email,
    parsed.data.company_website,
  );
  const operation = await attemptApiOperation(
    "employers.jobs.submit",
    "employer_job_submit_failed",
    "Employer submission service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("submit_employer_job", {
        submission_payload: parsed.data,
        corporate_domain_matches:
          corporateAssessment.domainMatches &&
          !corporateAssessment.isFreeProvider,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "employers.jobs.submit",
    "employer_job_submit_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  const url = new URL("/post-a-job", getAppOrigin());
  url.searchParams.set("submitted", result.ok ? "true" : "error");
  return noStoreRedirect(url, 303);
}
