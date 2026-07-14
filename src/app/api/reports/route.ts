import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";

const schema = z.object({
  target_type: z.enum([
    "job",
    "company",
    "review",
    "interview",
    "salary",
    "benefit",
    "pay_reliability",
    "employer_response",
    "contribution",
    "feed_post",
    "forum_thread",
    "forum_reply",
  ]),
  target_id: z.string().min(1).max(220),
  category: z.enum([
    "expired",
    "fee",
    "impersonation",
    "eligibility",
    "incorrect",
    "privacy",
    "spam",
    "harassment",
    "misinformation",
    "correction",
    "appeal",
    "takedown",
    "deletion",
    "serious_allegation",
    "other",
  ]),
  narrative: z.string().trim().max(2_000).default(""),
  return_to: z.string().optional(),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid report." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { error } = await context.supabase.schema("api").rpc("submit_report", {
    p_target_kind: parsed.data.target_type,
    p_target_id: parsed.data.target_id,
    p_category: parsed.data.category,
    p_narrative: parsed.data.narrative || undefined,
  });
  const destination = safeRelativePath(
    parsed.data.return_to,
    "/trust-and-safety",
  );
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("reported", error ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
