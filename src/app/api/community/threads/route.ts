import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  communityWriteStatus,
  forumThreadSchema,
} from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 30_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });

  const parsed = forumThreadSchema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return NextResponse.redirect(
      new URL("/forums?status=error", getAppOrigin()),
      303,
    );

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("publish_forum_thread", {
      display_name: parsed.data.display_name,
      state_code: parsed.data.state_code,
      topic_slug: parsed.data.topic_slug,
      thread_title: parsed.data.title,
      thread_body: parsed.data.body,
    });

  const destination = error || !data ? "/forums" : `/forums/${data}`;
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("status", communityWriteStatus(error));
  return NextResponse.redirect(url, 303);
}
