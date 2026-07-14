import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  communityWriteStatus,
  forumThreadSchema,
} from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 30_000, {
    invalidMessage: "Invalid forum thread form.",
  });
  if (!form.ok) return form.response;
  const parsed = forumThreadSchema.safeParse(
    Object.fromEntries(form.data.entries()),
  );
  if (!parsed.success)
    return noStoreRedirect(
      new URL("/forums?status=error", getAppOrigin()),
      303,
    );

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "community.threads.publish",
    "community_thread_publish_failed",
    "Community publishing is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("publish_forum_thread", {
        display_name: parsed.data.display_name,
        state_code: parsed.data.state_code,
        topic_slug: parsed.data.topic_slug,
        thread_title: parsed.data.title,
        thread_body: parsed.data.body,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "community.threads.publish",
    "community_thread_publish_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );

  const destination = result.ok ? `/forums/${result.data}` : "/forums";
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set(
    "status",
    communityWriteStatus(operation.value.error, result.ok),
  );
  return noStoreRedirect(url, 303);
}
