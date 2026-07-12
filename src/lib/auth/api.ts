import "server-only";

import { getViewer } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getAuthenticatedApiContext() {
  const viewer = await getViewer();
  if (viewer.state === "unavailable") {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Authentication service is temporarily unavailable." },
        { status: 503 },
      ),
    };
  }
  if (viewer.state !== "authenticated") {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false as const,
      response: Response.json(
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
      response: Response.json(
        { error: "Administrator access could not be verified." },
        { status: 503 },
      ),
    };
  }
  if (!context.viewer.isAdmin) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Administrator role required." },
        { status: 403 },
      ),
    };
  }
  if (context.viewer.aal !== "aal2") {
    return {
      ok: false as const,
      response: Response.json(
        { error: "A second authentication factor is required." },
        { status: 403 },
      ),
    };
  }
  return context;
}
