import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { communityProfileSchema } from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid community profile form.",
  });
  if (!form.ok) return form.response;
  const parsed = communityProfileSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success) {
    return noStoreRedirect(
      new URL("/account?profile=error", getAppOrigin()),
      303,
    );
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "community.profile.update",
    "community_profile_update_failed",
    "Community profile service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("update_community_profile", {
        display_name: parsed.data.display_name,
        state_code: parsed.data.state_code,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "community.profile.update",
    "community_profile_update_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );

  const url = new URL("/account", getAppOrigin());
  url.searchParams.set("profile", result.ok ? "updated" : "error");
  return noStoreRedirect(url, 303);
}
