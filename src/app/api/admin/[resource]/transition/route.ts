import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { getAdminApiContext } from "@/lib/auth/api";
import type { AdminResource } from "@/lib/admin/repository";
import { getAppOrigin } from "@/lib/env";
import {
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_CACHE_TAG,
} from "@/lib/jobs/source-policy";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import type { Json } from "@/lib/supabase/database.types";

const resources = new Set<AdminResource>([
  "jobs",
  "imports",
  "sources",
  "companies",
  "moderation",
  "reports",
  "users",
  "calculation_rules",
  "editorial",
]);
const allowedActions: Record<AdminResource, ReadonlySet<string>> = {
  jobs: new Set(["approve", "expire", "remove", "restore"]),
  imports: new Set(),
  sources: new Set(["enable", "disable", "request_review"]),
  companies: new Set(["verify", "request_evidence", "remove"]),
  moderation: new Set([
    "claim",
    "approve",
    "redact",
    "reject",
    "request_revision",
    "escalate",
    "merge_duplicate",
    "remove",
    "restore",
  ]),
  reports: new Set(["resolve", "dismiss", "escalate", "remove"]),
  users: new Set([
    "grant_moderator",
    "grant_data_quality",
    "grant_admin",
    "revoke_role",
    "suspend",
    "restore",
  ]),
  calculation_rules: new Set(["activate", "retire", "request_review"]),
  editorial: new Set([
    "approve",
    "schedule",
    "publish",
    "request_update",
    "archive",
  ]),
};
const schema = z.object({
  id: z.string().uuid(),
  action: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z_]+$/),
  reason: z.string().trim().min(3).max(500),
  expected_version: z.coerce.number().int().nonnegative(),
  public_payload: z.string().max(60_000).optional().default(""),
  linked_case_id: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
});

export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/[resource]/transition">,
) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 80_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const { resource: rawResource } = await context.params;
  if (!resources.has(rawResource as AdminResource))
    return Response.json({ error: "Unknown admin resource." }, { status: 404 });
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json(
      { error: "A valid action and reason are required." },
      { status: 400 },
    );
  if (!allowedActions[rawResource as AdminResource].has(parsed.data.action)) {
    return Response.json(
      { error: "That admin action is not available." },
      { status: 400 },
    );
  }
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;
  let transitionError: { message: string } | null = null;
  if (rawResource === "editorial") {
    const { error } = await admin.supabase.schema("api").rpc(
      "transition_editorial" as never,
      {
        p_article_id: parsed.data.id,
        p_expected_version: parsed.data.expected_version,
        p_action: parsed.data.action,
        p_reason: parsed.data.reason,
      } as never,
    );
    transitionError = error;
  } else if (
    rawResource === "moderation" &&
    ["claim", "redact", "merge_duplicate"].includes(parsed.data.action)
  ) {
    let publicPayload: Record<string, unknown> = {};
    if (parsed.data.action === "redact") {
      try {
        const payload: unknown = JSON.parse(parsed.data.public_payload);
        const payloadResult = z
          .record(z.string(), z.unknown())
          .safeParse(payload);
        if (
          !payloadResult.success ||
          Object.keys(payloadResult.data).length === 0
        )
          throw new Error("A non-empty JSON object is required.");
        publicPayload = payloadResult.data;
      } catch {
        return Response.json(
          { error: "Redaction requires a valid, non-empty JSON object." },
          { status: 400 },
        );
      }
    }
    if (
      parsed.data.action === "merge_duplicate" &&
      !parsed.data.linked_case_id
    ) {
      return Response.json(
        { error: "Merging requires the destination moderation case ID." },
        { status: 400 },
      );
    }

    const { error } = await admin.supabase
      .schema("api")
      .rpc("transition_moderation", {
        p_case_id: parsed.data.id,
        p_expected_version: parsed.data.expected_version,
        p_action: parsed.data.action,
        p_reason_code: parsed.data.action,
        p_reason_note: parsed.data.reason,
        p_changed_fields: Object.keys(publicPayload),
        p_public_payload: publicPayload as Json,
        p_linked_case_id: parsed.data.linked_case_id,
      });
    transitionError = error;
  } else {
    const { error } = await admin.supabase
      .schema("api")
      .rpc("admin_transition", {
        resource_name: rawResource,
        action_name: parsed.data.action,
        target_id: parsed.data.id,
        action_reason: parsed.data.reason,
        expected_version: parsed.data.expected_version,
      });
    transitionError = error;
  }
  if (
    !transitionError &&
    rawResource === "sources" &&
    ["enable", "disable", "request_review"].includes(parsed.data.action)
  ) {
    const sourceList = await admin.supabase
      .schema("api")
      .rpc("admin_list_sources");
    const sourceRows = z
      .array(
        z.object({
          id: z.string().uuid(),
          secondary: z.string().max(500).nullable(),
        }),
      )
      .max(200)
      .safeParse(sourceList.data);
    const adapterPrefix = `${REMOTIVE_ADAPTER_KEY} | `;
    const transitionedRemotive = sourceRows.success
      ? sourceRows.data.some(
          (source) =>
            source.id === parsed.data.id &&
            source.secondary?.startsWith(adapterPrefix),
        )
      : false;
    if (!sourceList.error && transitionedRemotive) {
      revalidateTag(REMOTIVE_CACHE_TAG, { expire: 0 });
    }
  }
  const url = new URL(
    `/admin/${rawResource === "calculation_rules" ? "calculation-rules" : rawResource}`,
    getAppOrigin(),
  );
  url.searchParams.set("updated", transitionError ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
