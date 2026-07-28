import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import { decodeApiRpcResult } from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({ id: z.uuid() });

/** The row is removed first, and it names the object that must go with it. */
const removedPathSchema = z.string().min(3).max(400).nullable();

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const form = await readApiForm(request, 4_096, {
    invalidMessage: "Invalid CV removal request.",
  });
  if (!form.ok) return form.response;
  const parsed = schema.safeParse(Object.fromEntries(form.data.entries()));
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid CV removal." }, { status: 400 });
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  const operation = await attemptApiOperation(
    "career.cv_delete",
    "cv_delete_failed",
    "CV storage is temporarily unavailable.",
    async () =>
      await context.supabase
        .schema("api")
        .rpc("delete_my_cv", { p_cv_id: parsed.data.id }),
  );
  if (!operation.ok) return operation.response;

  const decoded = decodeApiRpcResult(
    "career.cv_delete",
    "cv_delete_failed",
    operation.value,
    removedPathSchema,
  );

  const url = new URL("/account/candidate-profile", getAppOrigin());
  if (!decoded.ok) {
    url.searchParams.set("cv", "error");
    return noStoreRedirect(url, 303);
  }

  // A null path means no row matched this account, which is already the
  // requested end state rather than a failure.
  if (decoded.data) {
    const removal = await context.supabase.storage
      .from("candidate-cv")
      .remove([decoded.data]);
    if (removal.error) {
      // The record is gone, so nothing points at the object any more. Say the
      // removal was incomplete rather than reporting a clean delete.
      url.searchParams.set("cv", "removed-file-remains");
      return noStoreRedirect(url, 303);
    }
  }

  url.searchParams.set("cv", "removed");
  return noStoreRedirect(url, 303);
}
