import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcBooleanResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "saved",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ]),
  private_notes: z.string().trim().max(2_000).optional(),
  next_action_at: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().date().optional(),
  ),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 8_192, {
    invalidMessage: "Invalid application status form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success)
    return noStoreJson({ error: "Invalid status update." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "applications.status.update",
    "application_status_update_failed",
    "Application tracking service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("update_application_status", {
        application_id: parsed.data.id,
        application_status: parsed.data.status,
        ...(parsed.data.private_notes
          ? { notes: parsed.data.private_notes }
          : {}),
        ...(parsed.data.next_action_at
          ? { next_action_date: parsed.data.next_action_at }
          : {}),
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "applications.status.update",
    "application_status_update_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );
  const url = new URL("/applications", getAppOrigin());
  url.searchParams.set("updated", result.ok && result.data ? "true" : "error");
  return noStoreRedirect(url, 303);
}
