import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { communityProfileSchema } from "@/lib/community/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = communityProfileSchema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success) {
    return NextResponse.redirect(
      new URL("/account?profile=error", getAppOrigin()),
      303,
    );
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("update_community_profile", {
      display_name: parsed.data.display_name,
      state_code: parsed.data.state_code,
    });

  const url = new URL("/account", getAppOrigin());
  url.searchParams.set("profile", !error && data ? "updated" : "error");
  return NextResponse.redirect(url, 303);
}
