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
  id: z.uuid(),
  // An empty selection detaches, which is a valid record of "I did not send
  // one of these" rather than an invalid input.
  cv_id: z.union([z.literal(""), z.uuid()]),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid CV attachment request.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid CV attachment." }, { status: 400 });
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  const operation = await attemptApiOperation(
    "applications.attach_cv",
    "application_cv_failed",
    "Application tracking is temporarily unavailable.",
    async () =>
      await context.supabase.schema("api").rpc("attach_cv_to_my_application", {
        p_application_id: parsed.data.id,
        p_cv_id: parsed.data.cv_id === "" ? null : parsed.data.cv_id,
      }),
  );
  if (!operation.ok) return operation.response;

  const decoded = decodeApiRpcResult(
    "applications.attach_cv",
    "application_cv_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );

  const url = new URL("/applications", getAppOrigin());
  url.searchParams.set(
    "cv_attached",
    decoded.ok && decoded.data ? "true" : "error",
  );
  return noStoreRedirect(url, 303);
}
