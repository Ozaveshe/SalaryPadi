import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/security/urls";

export type Viewer =
  | { state: "unconfigured" }
  | { state: "anonymous" }
  | {
      state: "authenticated";
      id: string;
      email: string | null;
      isAdmin: boolean;
      aal: "aal1" | "aal2";
    };

export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { state: "unconfigured" };

  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string") return { state: "anonymous" };

  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  const { data: adminResult } = await supabase
    .schema("api")
    .rpc("has_staff_role", { required_role: "admin" });

  return {
    state: "authenticated",
    id: subject,
    email,
    isAdmin: adminResult === true,
    aal: data?.claims?.aal === "aal2" ? "aal2" : "aal1",
  };
});

export async function requireViewer(nextPath: string) {
  const viewer = await getViewer();
  if (viewer.state === "authenticated") return viewer;

  const next = safeRelativePath(nextPath);
  redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
}

export async function requireAdmin() {
  const viewer = await requireViewer("/admin");
  if (!viewer.isAdmin) redirect("/?notice=admin-access-required");
  if (viewer.aal !== "aal2") redirect("/auth/mfa-required");
  return viewer;
}
