import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcBooleanResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { removeCommunityContentSchema } from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid removal form.",
  });
  if (!form.ok) return form.response;
  const parsed = removeCommunityContentSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success)
    return noStoreJson({ error: "Invalid removal request." }, { status: 400 });

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "community.content.remove",
    "community_content_remove_failed",
    "Community removal is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("remove_my_community_content", {
        content_kind: parsed.data.content_kind,
        content_id: parsed.data.content_id,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "community.content.remove",
    "community_content_remove_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );

  const destination = safeRelativePath(parsed.data.return_to, "/feed");
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set(
    "status",
    result.ok && result.data ? "removed" : "error",
  );
  return noStoreRedirect(url, 303);
}
