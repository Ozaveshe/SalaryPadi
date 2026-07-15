import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcTimestampResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  candidateProfileFormSchema,
  toCandidateProfilePayload,
} from "@/lib/career/candidate-profile-form";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

function destination(status: "saved" | "error") {
  const url = new URL("/account/candidate-profile", getAppOrigin());
  url.searchParams.set("status", status);
  return url;
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;

  // The summary alone can carry 5,000 characters, so the bound sits above the
  // 4KB used by smaller account forms.
  const form = await readApiForm(request, 16_384, {
    invalidMessage: "Invalid candidate profile form.",
  });
  if (!form.ok) return form.response;

  const parsed = candidateProfileFormSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success) return noStoreRedirect(destination("error"), 303);

  const operation = await attemptApiOperation(
    "career.candidate_profile.save",
    "candidate_profile_save_failed",
    "Profile service is temporarily unavailable.",
    () =>
      authenticated.supabase.schema("api").rpc("save_my_candidate_profile", {
        profile_payload: toCandidateProfilePayload(parsed.data),
      }),
  );
  if (!operation.ok) return operation.response;

  const result = decodeApiRpcResult(
    "career.candidate_profile.save",
    "candidate_profile_save_failed",
    operation.value,
    apiRpcTimestampResultSchema,
  );

  return noStoreRedirect(destination(result.ok ? "saved" : "error"), 303);
}
