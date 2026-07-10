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
    "other",
  ]),
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
  const { error } = await context.supabase.schema("api").rpc("report_content", {
    reported_type: parsed.data.target_type,
    reported_id: parsed.data.target_id,
    report_category: parsed.data.category,
  });
  const destination = safeRelativePath(
    parsed.data.return_to,
    "/trust-and-safety",
  );
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("reported", error ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
