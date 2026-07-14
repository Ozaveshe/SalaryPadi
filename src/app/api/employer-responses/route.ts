import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { containsLikelyPrivateContact } from "@/lib/contributions/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z
  .object({
    company_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    response_kind: z.enum(["factual_correction", "right_of_reply"]),
    statement: z.string().trim().min(20).max(3_000),
    source_url: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().startsWith("https://").optional(),
    ),
    accuracy_attestation: z.literal("on"),
  })
  .superRefine((value, context) => {
    if (containsLikelyPrivateContact(value.statement))
      context.addIssue({
        code: "custom",
        path: ["statement"],
        message: "Remove private contact details.",
      });
  });

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 16_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid employer response." },
      { status: 400 },
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;
  const { error } = await authenticated.supabase.schema("api").rpc(
    "submit_employer_response" as never,
    {
      p_company_slug: parsed.data.company_slug,
      p_response_kind: parsed.data.response_kind,
      p_statement: parsed.data.statement,
      p_source_url: parsed.data.source_url ?? null,
    } as never,
  );
  return NextResponse.redirect(
    new URL(
      `/companies/${parsed.data.company_slug}/respond?status=${error ? "error" : "submitted"}`,
      getAppOrigin(),
    ),
    303,
  );
}
