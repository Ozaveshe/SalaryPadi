import { NextResponse } from "next/server";

import { parseAuthLinkCredential } from "@/lib/auth/link-credential";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { getAppOrigin } from "@/lib/env";
import { noStoreResponse } from "@/lib/http/json";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = parseAuthLinkCredential(url.searchParams.get("code"));
  const next = safeRelativePath(url.searchParams.get("next"), "/saved");
  if (!code) {
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
      "auth.callback.client",
      "query_failed",
      "auth_callback_client_failed",
      clientAttempt.error,
    );
  }
  const supabase = clientAttempt.ok ? clientAttempt.value : null;

  if (supabase) {
    const exchange = await attemptRepositoryOperation(() =>
      supabase.auth.exchangeCodeForSession(code),
    );
    if (!exchange.ok) {
      repositoryIssue(
        "auth.callback.exchange",
        "query_failed",
        "auth_callback_exchange_failed",
        exchange.error,
      );
    } else if (exchange.value.error) {
      repositoryIssue(
        "auth.callback.exchange",
        "query_failed",
        "auth_callback_exchange_rejected",
        exchange.value.error,
      );
    }
    if (exchange.ok && !exchange.value.error) {
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
