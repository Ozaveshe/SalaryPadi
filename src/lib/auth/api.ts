import "server-only";

import { getViewer } from "@/lib/auth/dal";
import { repositoryIssue } from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { noStoreJson } from "@/lib/http/json";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getAuthenticatedApiContext() {
  const viewer = await getViewer();
  if (viewer.state === "unconfigured") {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Authentication backend is not configured." },
        { status: 503 },
      ),
    };
  }
  if (viewer.state === "unavailable") {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Authentication service is temporarily unavailable." },
        { status: 503 },
      ),
    };
  }
  if (viewer.state !== "authenticated") {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "auth.api_context",
      "query_failed",
      "auth_backend_unavailable",
      clientAttempt.error,
    );
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Backend is temporarily unavailable." },
        { status: 503 },
      ),
    };
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Backend is not configured." },
        { status: 503 },
      ),
    };
  }

  return { ok: true as const, viewer, supabase };
}

export async function getAdminApiContext() {
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context;
  if (context.viewer.staffRoleState === "unavailable") {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Administrator access could not be verified." },
        { status: 503 },
      ),
    };
  }
  if (!context.viewer.isAdmin) {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "Administrator role required." },
        { status: 403 },
      ),
    };
  }
  if (context.viewer.aal !== "aal2") {
    return {
      ok: false as const,
      response: noStoreJson(
        { error: "A second authentication factor is required." },
        { status: 403 },
      ),
    };
  }
  return context;
}
