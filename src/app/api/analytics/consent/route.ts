import { cookies } from "next/headers";

import { attemptApiOperation } from "@/lib/api/operation";
import {
  apiRpcVoidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getViewer } from "@/lib/auth/dal";
import { analyticsConsentRequestSchema } from "@/lib/analytics/consent-contract";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_POLICY_VERSION,
} from "@/lib/analytics/consent";
import { JsonBodyError, noStoreJson, readBoundedJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ANALYTICS_CONSENT_MAX_REQUEST_BYTES = 1024;

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  let payload: unknown;
  try {
    payload = await readBoundedJson(
      request,
      ANALYTICS_CONSENT_MAX_REQUEST_BYTES,
    );
  } catch (error) {
    return noStoreJson(
      { error: "Invalid consent choice." },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }
  const parsed = analyticsConsentRequestSchema.safeParse(payload);
  if (!parsed.success)
    return noStoreJson({ error: "Invalid consent choice." }, { status: 400 });

  const viewer = await getViewer();
  if (viewer.state === "authenticated") {
    const clientAttempt = await attemptApiOperation(
      "analytics.consent.client",
      "analytics_consent_client_failed",
      "Backend unavailable.",
      () => createServerSupabaseClient(),
    );
    if (!clientAttempt.ok) return clientAttempt.response;
    const supabase = clientAttempt.value;
    if (!supabase)
      return noStoreJson({ error: "Backend unavailable." }, { status: 503 });
    const operation = await attemptApiOperation(
      "analytics.consent.save",
      "analytics_consent_save_failed",
      "Consent was not saved.",
      () =>
        supabase.schema("api").rpc("set_analytics_consent", {
          p_purpose: "aggregate_product_analytics",
          p_allowed: parsed.data.allowed,
          p_policy_version: ANALYTICS_POLICY_VERSION,
        }),
    );
    if (!operation.ok) return operation.response;
    const result = decodeApiRpcResult(
      "analytics.consent.save",
      "analytics_consent_save_failed",
      operation.value,
      apiRpcVoidResultSchema,
    );
    if (!result.ok)
      return noStoreJson({ error: "Consent was not saved." }, { status: 503 });
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
  return noStoreJson({ allowed: parsed.data.allowed });
}
