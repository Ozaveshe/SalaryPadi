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
    return Response.json({ error: "Invalid saved job." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  await context.supabase
    .schema("api")
    .rpc("remove_saved_job", { saved_job_id: parsed.data });
  return NextResponse.redirect(new URL("/saved", getAppOrigin()), 303);
}
