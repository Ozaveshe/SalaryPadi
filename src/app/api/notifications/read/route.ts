import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import { decodeApiRpcResult } from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { safeRelativePath } from "@/lib/security/urls";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  // Absent marks everything currently unread, which is what "mark all read"
  // does. A supplied id marks exactly that one.
  id: z.union([z.literal(""), z.uuid()]).optional(),
  redirect_to: z.string().max(300).optional(),
});

const markedCountSchema = z.number().int().nonnegative();

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid notification request.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid notification." }, { status: 400 });
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  const operation = await attemptApiOperation(
    "notifications.mark_read",
    "notification_read_failed",
    "Notifications are temporarily unavailable.",
    async () =>
      await context.supabase.schema("api").rpc("mark_my_notifications_read", {
        p_id: parsed.data.id ? parsed.data.id : null,
      }),
  );
  if (!operation.ok) return operation.response;

  const decoded = decodeApiRpcResult(
    "notifications.mark_read",
    "notification_read_failed",
    operation.value,
    markedCountSchema,
  );

  // The redirect target is whatever the notification pointed at, so it is put
  // through the same relative-path guard the auth flow uses.
  const destination = safeRelativePath(
    parsed.data.redirect_to ?? "",
    "/notifications",
  );
  const url = new URL(destination, getAppOrigin());
  if (!decoded.ok) url.searchParams.set("notifications", "error");
  return noStoreRedirect(url, 303);
}
