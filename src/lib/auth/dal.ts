import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authClaimSubjectSchema } from "@/lib/auth/claims";
import { repositoryIssue } from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/security/urls";

export type Viewer =
  | { state: "unconfigured" }
  | { state: "unavailable"; code: "claims_unavailable" }
  | { state: "anonymous" }
  | {
      state: "authenticated";
      id: string;
      email: string | null;
      isAdmin: boolean;
      staffRoleState: "ready" | "unavailable";
      aal: "aal1" | "aal2";
    };

const emailSchema = z.string().trim().max(320).email();

export const getViewer = cache(async (): Promise<Viewer> => {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "auth.claims",
      "query_failed",
      "auth_claims_unavailable",
      clientAttempt.error,
    );
    return { state: "unavailable", code: "claims_unavailable" };
  }
  const supabase = clientAttempt.value;
  if (!supabase) return { state: "unconfigured" };

  const claimsAttempt = await attemptRepositoryOperation(() =>
    supabase.auth.getClaims(),
  );
  if (!claimsAttempt.ok) {
    repositoryIssue(
      "auth.claims",
      "query_failed",
      "auth_claims_unavailable",
      claimsAttempt.error,
    );
    return { state: "unavailable", code: "claims_unavailable" };
  }
  const { data, error } = claimsAttempt.value;
  if (error) {
    repositoryIssue(
      "auth.claims",
      "query_failed",
      "auth_claims_unavailable",
      error,
    );
    return { state: "unavailable", code: "claims_unavailable" };
  }
  const subject = data?.claims?.sub;
  if (subject === undefined || subject === null) return { state: "anonymous" };
  const parsedSubject = authClaimSubjectSchema.safeParse(subject);
  if (!parsedSubject.success) {
    repositoryIssue("auth.claims", "invalid_rows", "auth_claims_invalid");
    return { state: "unavailable", code: "claims_unavailable" };
  }

  const parsedEmail = emailSchema.safeParse(data?.claims?.email);
  const email = parsedEmail.success ? parsedEmail.data : null;

  const staffAttempt = await attemptRepositoryOperation(() =>
    supabase.schema("api").rpc("has_staff_role", { required_role: "admin" }),
  );
  const staffResult = staffAttempt.ok ? staffAttempt.value : null;
  const staffRoleReady = Boolean(
    staffResult && !staffResult.error && typeof staffResult.data === "boolean",
  );
  if (!staffRoleReady) {
    const staffFailure = !staffAttempt.ok || Boolean(staffResult?.error);
    repositoryIssue(
      "auth.staff_role",
      staffFailure ? "query_failed" : "invalid_rows",
      staffFailure
        ? "auth_staff_role_unavailable"
        : "auth_staff_role_invalid_response",
      staffAttempt.ok ? staffResult?.error : staffAttempt.error,
    );
  }

  return {
    state: "authenticated",
    id: parsedSubject.data,
    email,
    isAdmin: staffRoleReady && staffResult?.data === true,
    staffRoleState: staffRoleReady ? "ready" : "unavailable",
    aal: data?.claims?.aal === "aal2" ? "aal2" : "aal1",
  };
});

export async function requireViewer(nextPath: string) {
  const viewer = await getViewer();
  if (viewer.state === "authenticated") return viewer;
  if (viewer.state === "unavailable") {
    throw new Error("Authentication state could not be verified.");
  }
  // An unconfigured backend lands on sign-in like any guest: that page
  // surfaces the setup state explicitly, so the failure stays visible
  // without turning a public "save this search" click into a server error.

  const next = safeRelativePath(nextPath);
  redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
}

export async function requireAdmin() {
  const viewer = await requireViewer("/admin");
  if (viewer.staffRoleState === "unavailable") {
    throw new Error("Administrator access could not be verified.");
  }
  if (!viewer.isAdmin) redirect("/?notice=admin-access-required");
  if (viewer.aal !== "aal2") redirect("/auth/mfa-required");
  return viewer;
}
