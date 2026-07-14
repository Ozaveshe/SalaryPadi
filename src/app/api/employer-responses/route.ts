import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { containsLikelyPrivateContact } from "@/lib/contributions/schemas";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const schema = z
  .object({
    company_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    response_kind: z.enum(["factual_correction", "right_of_reply"]),
    statement: z.string().trim().min(20).max(3_000),
    source_url: z.preprocess(
      (value) => (value === "" ? undefined : value),
      externalHttpsUrlSchema.optional(),
    ),
    accuracy_attestation: z.literal("on"),
  })
  .superRefine((value, context) => {
    if (containsLikelyPrivateContact(value.statement))
      context.addIssue({
        code: "custom",
        path: ["statement"],
        message: "Remove private contact details.",
      });
  });

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 16_000, {
    invalidMessage: "Invalid employer response form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreJson(
      { error: "Invalid employer response." },
      { status: 400 },
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;
  const operation = await attemptApiOperation(
    "employers.responses.submit",
    "employer_response_submit_failed",
    "Employer response service is temporarily unavailable.",
    () =>
      authenticated.supabase.schema("api").rpc(
        "submit_employer_response" as never,
        {
          p_company_slug: parsed.data.company_slug,
          p_response_kind: parsed.data.response_kind,
          p_statement: parsed.data.statement,
          p_source_url: parsed.data.source_url ?? null,
        } as never,
      ),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "employers.responses.submit",
    "employer_response_submit_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  return noStoreRedirect(
    new URL(
      `/companies/${parsed.data.company_slug}/respond?status=${result.ok ? "submitted" : "error"}`,
      getAppOrigin(),
    ),
    303,
  );
}
