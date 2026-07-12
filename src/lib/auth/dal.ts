import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { repositoryIssue } from "@/lib/data/repository-result";
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

export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { state: "unconfigured" };

  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error) {
    repositoryIssue(
      "auth.claims",
      "query_failed",
      "auth_claims_unavailable",
      error,
    );
    return { state: "unavailable", code: "claims_unavailable" };
  }
  if (typeof subject !== "string") return { state: "anonymous" };

  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  const { data: adminResult, error: adminError } = await supabase
    .schema("api")
    .rpc("has_staff_role", { required_role: "admin" });
  if (adminError) {
    repositoryIssue(
      "auth.staff_role",
      "query_failed",
      "auth_staff_role_unavailable",
      adminError,
    );
  }

  return {
    state: "authenticated",
    id: subject,
    email,
    isAdmin: adminResult === true,
    staffRoleState: adminError ? "unavailable" : "ready",
    aal: data?.claims?.aal === "aal2" ? "aal2" : "aal1",
  };
});

export async function requireViewer(nextPath: string) {
  const viewer = await getViewer();
  if (viewer.state === "authenticated") return viewer;
  if (viewer.state === "unavailable") {
    throw new Error("Authentication state could not be verified.");
  }

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
