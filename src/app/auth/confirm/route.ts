import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getAppOrigin } from "@/lib/env";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const supportedOtpTypes = new Set<EmailOtpType>(["email"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const requestedType = url.searchParams.get("type");
  const next = safeRelativePath(url.searchParams.get("next"), "/saved");
  const type =
    requestedType && supportedOtpTypes.has(requestedType as EmailOtpType)
      ? (requestedType as EmailOtpType)
      : null;
  const supabase = await createServerSupabaseClient();

  if (tokenHash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) return NextResponse.redirect(new URL(next, getAppOrigin()));
  }

  return NextResponse.redirect(
    new URL("/auth/sign-in?status=link-error", getAppOrigin()),
  );
}
