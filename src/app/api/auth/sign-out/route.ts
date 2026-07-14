import { NextResponse } from "next/server";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { getAppOrigin } from "@/lib/env";
import { noStoreResponse } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;

  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "auth.sign_out.client",
      "query_failed",
      "auth_sign_out_client_failed",
      clientAttempt.error,
    );
  }
  const supabase = clientAttempt.ok ? clientAttempt.value : null;
  const signOutAttempt = supabase
    ? await attemptRepositoryOperation(() => supabase.auth.signOut())
    : null;
  const signOutFailed =
    !clientAttempt.ok ||
    !supabase ||
    Boolean(
      signOutAttempt &&
      (!signOutAttempt.ok || (signOutAttempt.ok && signOutAttempt.value.error)),
    );
  if (signOutAttempt && !signOutAttempt.ok) {
    repositoryIssue(
      "auth.sign_out.session",
      "query_failed",
      "auth_sign_out_failed",
      signOutAttempt.error,
    );
  } else if (signOutAttempt?.value.error) {
    repositoryIssue(
      "auth.sign_out.session",
      "query_failed",
      "auth_sign_out_rejected",
      signOutAttempt.value.error,
    );
  }
  if (signOutFailed) {
    return noStoreResponse(
      NextResponse.redirect(
        new URL("/account?auth=sign-out-error", getAppOrigin()),
        303,
      ),
    );
  }
  return noStoreResponse(
    NextResponse.redirect(new URL("/", getAppOrigin()), 303),
  );
}
