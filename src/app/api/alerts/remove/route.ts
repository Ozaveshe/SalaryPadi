import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = z
    .string()
    .uuid()
    .safeParse((await request.formData()).get("id"));
  if (!parsed.success)
    return Response.json({ error: "Invalid alert." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("remove_job_alert", { alert_id: parsed.data });
  const url = new URL("/alerts", getAppOrigin());
  url.searchParams.set("removed", !error && data ? "true" : "error");
  return NextResponse.redirect(url, 303);
}
