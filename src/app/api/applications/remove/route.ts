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

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 2_048, {
    invalidMessage: "Invalid application removal form.",
  });
  if (!form.ok) return form.response;
  const parsed = z.string().uuid().safeParse(form.data.get("id"));
  if (!parsed.success)
    return noStoreJson({ error: "Invalid application." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "applications.remove",
    "application_remove_failed",
    "Application tracking service is temporarily unavailable.",
    () =>
      context.supabase
        .schema("api")
        .rpc("remove_application", { application_id: parsed.data }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "applications.remove",
    "application_remove_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );
  const url = new URL("/applications", getAppOrigin());
  url.searchParams.set("removed", result.ok && result.data ? "true" : "error");
  return noStoreRedirect(url, 303);
}
