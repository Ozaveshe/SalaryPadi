import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { companyClaimSchema } from "@/lib/companies/claim";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 12_000, {
    invalidMessage: "Invalid company claim form.",
  });
  if (!form.ok) return form.response;
  const parsed = companyClaimSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success)
    return noStoreJson({ error: "Invalid company claim." }, { status: 400 });
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;
  const operation = await attemptApiOperation(
    "companies.claims.submit",
    "company_claim_submit_failed",
    "Company claim service is temporarily unavailable.",
    () =>
      authenticated.supabase.schema("api").rpc(
        "submit_company_claim" as never,
        {
          p_company_slug: parsed.data.company_slug,
          p_corporate_domain: parsed.data.corporate_domain,
          p_relationship: parsed.data.relationship,
          p_job_title: parsed.data.job_title,
          p_evidence_reference: parsed.data.evidence_reference || null,
        } as never,
      ),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "companies.claims.submit",
    "company_claim_submit_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  return noStoreRedirect(
    new URL(
      `/companies/${parsed.data.company_slug}/claim?status=${result.ok ? "submitted" : "error"}`,
      getAppOrigin(),
    ),
    303,
  );
}
