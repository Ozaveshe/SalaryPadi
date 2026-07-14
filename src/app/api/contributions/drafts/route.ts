import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getServerEnvironment } from "@/lib/env";
import {
  JsonBodyError,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const kindSchema = z.enum([
  "salary",
  "review",
  "interview",
  "benefits",
  "pay_reliability",
]);
const draftValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(500)).max(50),
]);
const requestSchema = z.object({
  kind: kindSchema,
  payload: z.record(z.string().max(120), draftValueSchema),
});

function hasProhibitedEvidence(payload: Record<string, unknown>) {
  return Object.keys(payload).some((key) =>
    /(?:payslip|pay_slip|document|attachment|verification_evidence|work_email)/i.test(
      key,
    ),
  );
}

export async function GET(request: Request) {
  const kind = kindSchema.safeParse(
    new URL(request.url).searchParams.get("kind"),
  );
  if (!kind.success)
    return noStoreResponse(
      Response.json({ error: "Unknown draft type." }, { status: 400 }),
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return noStoreResponse(authenticated.response);
  const { data, error } = await authenticated.supabase
    .schema("api")
    .rpc("load_contribution_draft" as never, { p_kind: kind.data } as never);
  return noStoreResponse(
    error
      ? Response.json(
          { error: "Draft storage is unavailable." },
          { status: 503 },
        )
      : Response.json({ draft: data ?? null }),
  );
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 70_000)
    return noStoreResponse(
      Response.json({ error: "Draft is too large." }, { status: 413 }),
    );
  let body: unknown;
  try {
    body = await readBoundedJson(request, 70_000);
  } catch (error) {
    const status =
      error instanceof JsonBodyError && error.code === "too_large" ? 413 : 400;
    return noStoreResponse(
      Response.json(
        {
          error: status === 413 ? "Draft is too large." : "Invalid JSON body.",
        },
        { status },
      ),
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success || hasProhibitedEvidence(parsed.data.payload))
    return noStoreResponse(
      Response.json(
        { error: "Documents and work-email evidence are not accepted." },
        { status: 400 },
      ),
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return noStoreResponse(authenticated.response);
  // Database-side checks are authoritative. This read prevents accidentally
  // accepting drafts in a production environment with the secure migration absent.
  getServerEnvironment();
  const { data, error } = await authenticated.supabase
    .schema("api")
    .rpc(
      "save_contribution_draft" as never,
      { p_kind: parsed.data.kind, p_payload: parsed.data.payload } as never,
    );
  return noStoreResponse(
    error
      ? Response.json({ error: "Draft was not saved." }, { status: 503 })
      : Response.json({ id: data, saved: true }),
  );
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const kind = kindSchema.safeParse(
    new URL(request.url).searchParams.get("kind"),
  );
  if (!kind.success)
    return noStoreResponse(
      Response.json({ error: "Unknown draft type." }, { status: 400 }),
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return noStoreResponse(authenticated.response);
  const { error } = await authenticated.supabase
    .schema("api")
    .rpc("delete_contribution_draft" as never, { p_kind: kind.data } as never);
  return noStoreResponse(
    error
      ? Response.json({ error: "Draft was not deleted." }, { status: 503 })
      : Response.json({ deleted: true }),
  );
}
