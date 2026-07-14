import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  containsProhibitedDocumentField,
  contributionKindSchema,
  contributionSchemas,
} from "@/lib/contributions/schemas";
import { hashContributionNetworkAddress } from "@/lib/contributions/abuse";
import { analyzeContributionPayload } from "@/lib/contributions/moderation";
import { getAppOrigin, getServerEnvironment } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(
  request: Request,
  context: RouteContext<"/api/contributions/[kind]">,
) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;
  const { kind: rawKind } = await context.params;
  const parsedKind = contributionKindSchema.safeParse(rawKind);
  if (!parsedKind.success)
    return noStoreJson(
      { error: "Unknown contribution type." },
      { status: 404 },
    );
  const kind = parsedKind.data;
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;
  const environment = getServerEnvironment();
  if (!environment.SUPABASE_SERVICE_ROLE_KEY) {
    return noStoreJson(
      { error: "Contribution abuse protection is temporarily unavailable." },
      { status: 503 },
    );
  }
  const form = await readApiForm(request, 60_000, {
    invalidMessage: "Invalid contribution form.",
  });
  if (!form.ok) return form.response;
  const formData = form.data;
  if (containsProhibitedDocumentField(formData)) {
    return noStoreJson(
      {
        error:
          "Payslips, documents, work email, and verification evidence are not accepted.",
      },
      { status: 400 },
    );
  }
  const payload = Object.fromEntries(formData.entries());
  const parsed = contributionSchemas[kind].safeParse(payload);
  if (!parsed.success)
    return noStoreRedirect(
      new URL(`/contribute/${kind}?status=error`, getAppOrigin()),
      303,
    );
  const moderationFlags = analyzeContributionPayload(parsed.data);
  const dailyNetworkKeyHash = hashContributionNetworkAddress(
    request,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );
  const contributionPayload = {
    ...parsed.data,
    _intake: {
      flags: moderationFlags,
      daily_network_key_hash: dailyNetworkKeyHash,
      rule_version: "company-intake-v1",
    },
  };
  const operation = await attemptApiOperation(
    "contributions.submit",
    "contribution_submit_failed",
    "Contribution service is temporarily unavailable.",
    () =>
      authenticated.supabase.schema("api").rpc("submit_contribution", {
        contribution_kind: kind,
        contribution_payload: contributionPayload,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "contributions.submit",
    "contribution_submit_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  const destination = new URL(
    result.ok ? "/contribute?status=submitted" : "/contribute?status=error",
    getAppOrigin(),
  );
  if (result.ok) destination.searchParams.set("kind", kind);
  return noStoreRedirect(destination, 303);
}
