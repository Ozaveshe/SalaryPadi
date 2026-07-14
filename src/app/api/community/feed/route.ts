import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { communityWriteStatus, feedPostSchema } from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 20_000, {
    invalidMessage: "Invalid community post form.",
  });
  if (!form.ok) return form.response;
  const parsed = feedPostSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success)
    return noStoreRedirect(new URL("/feed?status=error", getAppOrigin()), 303);

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "community.feed.publish",
    "community_feed_publish_failed",
    "Community publishing is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("publish_feed_post", {
        display_name: parsed.data.display_name,
        state_code: parsed.data.state_code,
        post_category: parsed.data.category,
        post_body: parsed.data.body,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "community.feed.publish",
    "community_feed_publish_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );

  return noStoreRedirect(
    new URL(
      `/feed?status=${communityWriteStatus(operation.value.error, result.ok)}`,
      getAppOrigin(),
    ),
    303,
  );
}
