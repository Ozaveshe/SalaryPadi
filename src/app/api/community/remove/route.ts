import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { removeCommunityContentSchema } from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = removeCommunityContentSchema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid removal request." },
      { status: 400 },
    );

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("remove_my_community_content", {
      content_kind: parsed.data.content_kind,
      content_id: parsed.data.content_id,
    });

  const destination = safeRelativePath(parsed.data.return_to, "/feed");
  const url = new URL(destination, getAppOrigin());
  url.searchParams.set("status", !error && data ? "removed" : "error");
  return NextResponse.redirect(url, 303);
}
