import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { communityWriteStatus, feedPostSchema } from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 20_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });

  const parsed = feedPostSchema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return NextResponse.redirect(
      new URL("/feed?status=error", getAppOrigin()),
      303,
    );

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { error } = await context.supabase
    .schema("api")
    .rpc("publish_feed_post", {
      display_name: parsed.data.display_name,
      state_code: parsed.data.state_code,
      post_category: parsed.data.category,
      post_body: parsed.data.body,
    });

  return NextResponse.redirect(
    new URL(`/feed?status=${communityWriteStatus(error)}`, getAppOrigin()),
    303,
  );
}
