import { cookies } from "next/headers";
import { z } from "zod";

import { getViewer } from "@/lib/auth/dal";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_POLICY_VERSION,
} from "@/lib/analytics/consent";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const consentSchema = z.object({ allowed: z.boolean() });

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = consentSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid consent choice." }, { status: 400 });

  const viewer = await getViewer();
  if (viewer.state === "authenticated") {
    const supabase = await createServerSupabaseClient();
    if (!supabase)
      return Response.json({ error: "Backend unavailable." }, { status: 503 });
    const { error } = await supabase
      .schema("api")
      .rpc("set_analytics_consent", {
        p_purpose: "aggregate_product_analytics",
        p_allowed: parsed.data.allowed,
        p_policy_version: ANALYTICS_POLICY_VERSION,
      });
    if (error)
      return Response.json(
        { error: "Consent was not saved." },
        { status: 503 },
      );
  }

  const store = await cookies();
  store.set(
    ANALYTICS_CONSENT_COOKIE,
    parsed.data.allowed ? "granted" : "denied",
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  );
  return Response.json({ allowed: parsed.data.allowed });
}
