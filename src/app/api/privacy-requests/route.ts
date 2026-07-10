import { NextResponse } from "next/server";
import { z } from "zod";

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
  if (Number(request.headers.get("content-length") ?? "0") > 12_000) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success) {
    return NextResponse.redirect(
      new URL("/privacy/requests?created=error", getAppOrigin()),
      303,
    );
  }
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { error } = await context.supabase
    .schema("api")
    .rpc("request_privacy_action", {
      p_kind: parsed.data.kind,
      ...(parsed.data.target_id ? { p_target_id: parsed.data.target_id } : {}),
      p_details: parsed.data.details
        ? { request_note: parsed.data.details }
        : {},
    });
  return NextResponse.redirect(
    new URL(
      error
        ? "/privacy/requests?created=error"
        : "/privacy/requests?created=true",
      getAppOrigin(),
    ),
    303,
  );
}
