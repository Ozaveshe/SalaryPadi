import { NextResponse } from "next/server";
import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import {
  getAvailableOAuthProviders,
  getOAuthProviderPresentation,
  OAUTH_PROVIDERS,
} from "@/lib/auth/oauth-providers";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { getAppOrigin } from "@/lib/env";
import { noStoreResponse } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const oauthSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
  next: z.string().optional(),
});

function signInRedirect(status: string) {
  const url = new URL("/auth/sign-in", getAppOrigin());
  url.searchParams.set("status", status);
  return noStoreResponse(NextResponse.redirect(url, 303));
}

/**
 * Starts a social sign-in. The provider returns to /auth/callback, which already
 * exchanges the code for a session, so this route only has to hand off safely.
 *
 * Every failure lands back on the sign-in page with a status. Per the CI
 * contract, auth paths degrade to a sign-in redirect and never a 503.
 */
export async function POST(request: Request) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;

  const form = await readApiForm(request, 10_000, {
    invalidMessage: "Invalid sign-in form.",
  });
  if (!form.ok) return form.response;

  const parsed = oauthSchema.safeParse({
    provider: form.data.get("provider"),
    next: form.data.get("next"),
  });
  if (!parsed.success) return signInRedirect("error");

  // Refuse a provider this deployment has not switched on, so a crafted form
  // cannot start a flow against an unconfigured provider.
  const available = getAvailableOAuthProviders();
  if (!available.some((entry) => entry.provider === parsed.data.provider)) {
    return signInRedirect("provider-unavailable");
  }

  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "auth.oauth.client",
      "query_failed",
      "auth_oauth_client_failed",
      clientAttempt.error,
    );
    return signInRedirect("unavailable");
  }
  const supabase = clientAttempt.value;
  if (!supabase) return signInRedirect("setup");

  const next = safeRelativePath(parsed.data.next, "/dashboard");
  const callback = new URL("/auth/callback", getAppOrigin());
  callback.searchParams.set("next", next);

  const startAttempt = await attemptRepositoryOperation(() =>
    supabase.auth.signInWithOAuth({
      provider: parsed.data.provider,
      options: {
        redirectTo: callback.toString(),
        scopes: getOAuthProviderPresentation(parsed.data.provider).scopes,
      },
    }),
  );
  if (!startAttempt.ok) {
    repositoryIssue(
      "auth.oauth.start",
      "query_failed",
      "auth_oauth_start_failed",
      startAttempt.error,
    );
    return signInRedirect("unavailable");
  }
  if (startAttempt.value.error || !startAttempt.value.data?.url) {
    repositoryIssue(
      "auth.oauth.start",
      "query_failed",
      "auth_oauth_start_rejected",
      startAttempt.value.error,
    );
    return signInRedirect("error");
  }

  return noStoreResponse(
    NextResponse.redirect(startAttempt.value.data.url, 303),
  );
}
