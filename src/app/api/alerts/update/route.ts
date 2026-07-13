import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { parseJobSearch } from "@/lib/jobs/search";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const alertId = z.string().uuid();
const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("edit"),
    id: alertId,
    keyword: z.string().trim().max(160).default(""),
    location: z.string().trim().max(160).default(""),
    eligibility: z.enum(["nigeria", "africa", "worldwide", "unclear", "all"]),
    cadence: z.enum(["daily", "weekly"]),
  }),
  z.object({
    intent: z.literal("set-active"),
    id: alertId,
    active: z.enum(["true", "false"]),
  }),
]);

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid alert update." }, { status: 400 });
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  const active =
    parsed.data.intent === "set-active" ? parsed.data.active === "true" : null;
  const rpcArgs =
    parsed.data.intent === "edit"
      ? {
          alert_id: parsed.data.id,
          alert_query: parseJobSearch({
            q: parsed.data.keyword,
            location: parsed.data.location,
            eligibility: parsed.data.eligibility,
          }),
          alert_cadence: parsed.data.cadence,
        }
      : {
          alert_id: parsed.data.id,
          alert_active: active ?? false,
        };
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("update_job_alert", rpcArgs);

  const url = new URL("/alerts", getAppOrigin());
  const status =
    error || !data
      ? "error"
      : active === null
        ? "true"
        : active
          ? "resumed"
          : "paused";
  url.searchParams.set("updated", status);
  return NextResponse.redirect(url, 303);
}
