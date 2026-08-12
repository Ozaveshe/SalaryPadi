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
import { WORKSPACE_RETENTION_POLICIES } from "@/lib/privacy/workspace-retention";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const formSchema = z
  .object({ policy: z.enum(WORKSPACE_RETENTION_POLICIES) })
  .strict();

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid workspace retention form.",
  });
  if (!form.ok) return form.response;
  const parsed = formSchema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success) {
    return noStoreRedirect(
      new URL("/account?retention=error", getAppOrigin()),
      303,
    );
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "workspace.retention.update",
    "workspace_retention_update_failed",
    "Workspace retention service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("set_my_workspace_retention", {
        p_policy: parsed.data.policy,
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "workspace.retention.update",
    "workspace_retention_update_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );
  return noStoreRedirect(
    new URL(
      `/account?retention=${result.ok ? "saved" : "error"}`,
      getAppOrigin(),
    ),
    303,
  );
}
