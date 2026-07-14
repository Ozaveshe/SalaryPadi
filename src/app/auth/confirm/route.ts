import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { parseAuthLinkCredential } from "@/lib/auth/link-credential";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { getAppOrigin } from "@/lib/env";
import { noStoreResponse } from "@/lib/http/json";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const supportedOtpTypes = new Set<EmailOtpType>(["email"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = parseAuthLinkCredential(url.searchParams.get("token_hash"));
  const requestedType = url.searchParams.get("type");
  const next = safeRelativePath(url.searchParams.get("next"), "/saved");
  const type =
    requestedType && supportedOtpTypes.has(requestedType as EmailOtpType)
      ? (requestedType as EmailOtpType)
      : null;
  if (!tokenHash || !type) {
    return noStoreResponse(
      NextResponse.redirect(
        new URL("/auth/sign-in?status=link-error", getAppOrigin()),
      ),
    );
  }
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "auth.confirm.client",
      "query_failed",
      "auth_confirm_client_failed",
      clientAttempt.error,
    );
  }
  const supabase = clientAttempt.ok ? clientAttempt.value : null;

  if (supabase) {
    const verification = await attemptRepositoryOperation(() =>
      supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      }),
    );
    if (!verification.ok) {
      repositoryIssue(
        "auth.confirm.otp",
        "query_failed",
        "auth_confirm_otp_failed",
        verification.error,
      );
    } else if (verification.value.error) {
      repositoryIssue(
        "auth.confirm.otp",
        "query_failed",
        "auth_confirm_otp_rejected",
        verification.value.error,
      );
    }

    if (verification.ok && !verification.value.error) {
      return noStoreResponse(
        NextResponse.redirect(new URL(next, getAppOrigin())),
      );
    }
  }

  return noStoreResponse(
    NextResponse.redirect(
      new URL("/auth/sign-in?status=link-error", getAppOrigin()),
    ),
  );
}
