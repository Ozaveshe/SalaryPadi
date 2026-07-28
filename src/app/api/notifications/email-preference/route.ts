import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcBooleanResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { NOTIFICATION_KINDS } from "@/lib/career/notifications";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  // An unchecked box does not arrive at all, which is exactly "email off".
  email: z.literal("on").optional(),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid notification preference.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success) {
    return noStoreJson(
      { error: "Invalid notification preference." },
      { status: 400 },
    );
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  const operation = await attemptApiOperation(
    "notifications.set_email_preference",
    "notification_preference_failed",
    "Notification settings are temporarily unavailable.",
    async () =>
      await context.supabase
        .schema("api")
        .rpc("set_my_notification_email_optout", {
          p_kind: parsed.data.kind,
          p_opted_out: parsed.data.email !== "on",
        }),
  );
  if (!operation.ok) return operation.response;

  const decoded = decodeApiRpcResult(
    "notifications.set_email_preference",
    "notification_preference_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );

  const url = new URL("/notifications", getAppOrigin());
  url.searchParams.set("preference", decoded.ok ? "saved" : "error");
  return noStoreRedirect(url, 303);
}
