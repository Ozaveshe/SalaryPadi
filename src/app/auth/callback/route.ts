import { NextResponse } from "next/server";

import { getAppOrigin } from "@/lib/env";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRelativePath(url.searchParams.get("next"), "/saved");
  const supabase = await createServerSupabaseClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, getAppOrigin()));
  }

  return NextResponse.redirect(
    new URL("/auth/sign-in?status=error", getAppOrigin()),
  );
}
