import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  communityWriteStatus,
  forumReplySchema,
} from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 20_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });

  const parsed = forumReplySchema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return NextResponse.redirect(
      new URL("/forums?status=error", getAppOrigin()),
      303,
    );

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { error } = await context.supabase
    .schema("api")
    .rpc("publish_forum_reply", {
      display_name: parsed.data.display_name,
      state_code: parsed.data.state_code,
      thread_id: parsed.data.thread_id,
      reply_body: parsed.data.body,
    });

  const url = new URL(`/forums/${parsed.data.thread_id}`, getAppOrigin());
  url.searchParams.set("status", communityWriteStatus(error));
  return NextResponse.redirect(url, 303);
}
