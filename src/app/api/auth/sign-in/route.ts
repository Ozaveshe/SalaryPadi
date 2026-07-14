import { NextResponse } from "next/server";
import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { getAppOrigin } from "@/lib/env";
import { noStoreResponse } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;

  const form = await readApiForm(request, 10_000, {
    invalidMessage: "Invalid sign-in form.",
  });
  if (!form.ok) return form.response;
  const formData = form.data;
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return noStoreResponse(
      NextResponse.redirect(
        new URL("/auth/sign-in?status=error", getAppOrigin()),
        303,
      ),
    );
  }

  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "auth.sign_in.client",
      "query_failed",
      "auth_sign_in_client_failed",
      clientAttempt.error,
    );
    return noStoreResponse(
      NextResponse.redirect(
        new URL("/auth/sign-in?status=unavailable", getAppOrigin()),
        303,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return noStoreResponse(
      NextResponse.redirect(
        new URL("/auth/sign-in?status=setup", getAppOrigin()),
        303,
      ),
    );
  }

  const next = safeRelativePath(parsed.data.next, "/saved");
  const confirmation = new URL("/auth/confirm", getAppOrigin());
  confirmation.searchParams.set("next", next);

  const signInAttempt = await attemptRepositoryOperation(() =>
    supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: confirmation.toString() },
    }),
  );
  if (!signInAttempt.ok) {
    repositoryIssue(
      "auth.sign_in.otp",
      "query_failed",
      "auth_sign_in_otp_failed",
      signInAttempt.error,
    );
  } else if (signInAttempt.value.error) {
    repositoryIssue(
      "auth.sign_in.otp",
      "query_failed",
      "auth_sign_in_otp_rejected",
      signInAttempt.value.error,
    );
  }

  const resultUrl = new URL("/auth/sign-in", getAppOrigin());
  resultUrl.searchParams.set(
    "status",
    !signInAttempt.ok
      ? "unavailable"
      : signInAttempt.value.error
        ? "error"
        : "check-email",
  );
  return noStoreResponse(NextResponse.redirect(resultUrl, 303));
}
