import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z
  .object({
    kind: z.enum([
      "data_export",
      "account_deletion",
      "correction",
      "contribution_deletion",
    ]),
    target_id: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().uuid().optional(),
    ),
    details: z.string().trim().max(1000).default(""),
    confirm: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "contribution_deletion" && !value.target_id) {
      context.addIssue({
        code: "custom",
        path: ["target_id"],
        message: "A contribution ID is required.",
      });
    }
    if (value.kind === "account_deletion" && value.confirm !== "yes") {
      context.addIssue({
        code: "custom",
        path: ["confirm"],
        message: "Account deletion must be explicitly confirmed.",
      });
    }
  });

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const form = await readApiForm(request, 12_000, {
    invalidMessage: "Invalid privacy request form.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success) {
    return noStoreRedirect(
      new URL("/privacy/requests?created=error", getAppOrigin()),
      303,
    );
  }
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const operation = await attemptApiOperation(
    "privacy.request.create",
    "privacy_request_create_failed",
    "Privacy request service is temporarily unavailable.",
    () =>
      context.supabase.schema("api").rpc("request_privacy_action", {
        p_kind: parsed.data.kind,
        ...(parsed.data.target_id
          ? { p_target_id: parsed.data.target_id }
          : {}),
        p_details: parsed.data.details
          ? { request_note: parsed.data.details }
          : {},
      }),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "privacy.request.create",
    "privacy_request_create_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  return noStoreRedirect(
    new URL(
      result.ok
        ? "/privacy/requests?created=true"
        : "/privacy/requests?created=error",
      getAppOrigin(),
    ),
    303,
  );
}
