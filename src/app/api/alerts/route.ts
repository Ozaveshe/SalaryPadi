import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { parseJobSearch } from "@/lib/jobs/search";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  keyword: z.string().trim().max(160).default(""),
  location: z.string().trim().max(160).default(""),
  eligibility: z.enum(["nigeria", "africa", "worldwide", "unclear", "all"]),
  cadence: z.enum(["daily", "weekly"]),
  search_query: z.string().max(10_000).optional(),
});

function storedSearch(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid alert." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const query = parseJobSearch({
    ...storedSearch(parsed.data.search_query),
    q: parsed.data.keyword,
    location: parsed.data.location,
    eligibility: parsed.data.eligibility,
  });
  const { error } = await context.supabase
    .schema("api")
    .rpc("create_job_alert", {
      alert_query: query,
      alert_cadence: parsed.data.cadence,
    });
  const url = new URL("/alerts", getAppOrigin());
  url.searchParams.set("created", error ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
