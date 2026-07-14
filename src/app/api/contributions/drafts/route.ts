import { attemptApiOperation } from "@/lib/api/operation";
import {
  apiRpcBooleanResultSchema,
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  contributionDraftResponseSchema,
  contributionDraftSaveRequestSchema,
} from "@/lib/contributions/draft-contract";
import { contributionKindSchema } from "@/lib/contributions/schemas";
import { getServerEnvironment } from "@/lib/env";
import {
  JsonBodyError,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

function hasProhibitedEvidence(payload: Record<string, unknown>) {
  return Object.keys(payload).some((key) =>
    /(?:payslip|pay_slip|document|attachment|verification_evidence|work_email)/i.test(
      key,
    ),
  );
}

export async function GET(request: Request) {
  const kind = contributionKindSchema.safeParse(
    new URL(request.url).searchParams.get("kind"),
  );
  if (!kind.success)
    return noStoreResponse(
      Response.json({ error: "Unknown draft type." }, { status: 400 }),
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return noStoreResponse(authenticated.response);
  const operation = await attemptApiOperation(
    "contributions.drafts.load",
    "contribution_draft_load_failed",
    "Draft storage is unavailable.",
    () =>
      authenticated.supabase.schema("api").rpc(
        "load_contribution_draft" as never,
        {
          p_kind: kind.data,
        } as never,
      ),
  );
  if (!operation.ok) return operation.response;
  const { data, error } = operation.value;
  if (!error) {
    const parsedDraft = contributionDraftResponseSchema.safeParse({
      draft: data ?? null,
    });
    if (!parsedDraft.success)
      return noStoreResponse(
        Response.json(
          { error: "Draft storage returned invalid data." },
          { status: 503 },
        ),
      );
    return noStoreResponse(Response.json(parsedDraft.data));
  }
  return noStoreResponse(
    Response.json({ error: "Draft storage is unavailable." }, { status: 503 }),
  );
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
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
  const parsed = contributionDraftSaveRequestSchema.safeParse(body);
  if (!parsed.success)
    return noStoreResponse(
      Response.json({ error: "Invalid draft fields." }, { status: 400 }),
    );
  if (hasProhibitedEvidence(parsed.data.payload))
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
  const operation = await attemptApiOperation(
    "contributions.drafts.save",
    "contribution_draft_save_failed",
    "Draft was not saved.",
    () =>
      authenticated.supabase
        .schema("api")
        .rpc(
          "save_contribution_draft" as never,
          { p_kind: parsed.data.kind, p_payload: parsed.data.payload } as never,
        ),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "contributions.drafts.save",
    "contribution_draft_save_failed",
    operation.value,
    apiRpcUuidResultSchema,
  );
  return noStoreResponse(
    !result.ok
      ? Response.json({ error: "Draft was not saved." }, { status: 503 })
      : Response.json({ id: result.data, saved: true }),
  );
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const kind = contributionKindSchema.safeParse(
    new URL(request.url).searchParams.get("kind"),
  );
  if (!kind.success)
    return noStoreResponse(
      Response.json({ error: "Unknown draft type." }, { status: 400 }),
    );
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return noStoreResponse(authenticated.response);
  const operation = await attemptApiOperation(
    "contributions.drafts.delete",
    "contribution_draft_delete_failed",
    "Draft was not deleted.",
    () =>
      authenticated.supabase
        .schema("api")
        .rpc(
          "delete_contribution_draft" as never,
          { p_kind: kind.data } as never,
        ),
  );
  if (!operation.ok) return operation.response;
  const result = decodeApiRpcResult(
    "contributions.drafts.delete",
    "contribution_draft_delete_failed",
    operation.value,
    apiRpcBooleanResultSchema,
  );
  return noStoreResponse(
    !result.ok
      ? Response.json({ error: "Draft was not deleted." }, { status: 503 })
      : Response.json({ deleted: result.data }),
  );
}
