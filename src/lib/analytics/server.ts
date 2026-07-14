import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";

import type {
  AnalyticsEventName,
  AnalyticsRouteGroup,
} from "@/lib/analytics/catalog";
import { getServerEnvironment } from "@/lib/env";
import { discardResponseBody } from "@/lib/http/body";
import { readBoundedJson } from "@/lib/http/json";
import { trustedClientNetworkAddress } from "@/lib/security/client-network";
import { getSalaryPadiSupabaseOrigin } from "@/lib/supabase/project";

export const ANALYTICS_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1_000;

type AnalyticsCaptureResult =
  | { status: "accepted" }
  | { status: "rate_limited" }
  | { status: "unavailable"; errorCode: string };

const postgrestErrorSchema = z.object({
  code: z.string().max(40),
});

export function analyticsRateLimitWindowStart(now: Date): string {
  return new Date(
    Math.floor(now.getTime() / ANALYTICS_RATE_LIMIT_WINDOW_MS) *
      ANALYTICS_RATE_LIMIT_WINDOW_MS,
  ).toISOString();
}

export function hashAnalyticsNetworkAddress(
  request: Request,
  secret: string,
  now: Date,
): string {
  const dailySalt = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret)
    .update(
      `salarypadi-analytics-network-v1\0${dailySalt}\0${trustedClientNetworkAddress(request)}`,
    )
    .digest("hex");
}

export async function captureAnalyticsEvent({
  eventName,
  routeGroup,
  request,
  now = new Date(),
}: {
  eventName: AnalyticsEventName;
  routeGroup: AnalyticsRouteGroup;
  request: Request;
  now?: Date;
}): Promise<AnalyticsCaptureResult> {
  const environment = getServerEnvironment();
  if (
    !environment.NEXT_PUBLIC_SUPABASE_URL ||
    !environment.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      status: "unavailable",
      errorCode: "analytics_backend_unconfigured",
    };
  }

  let origin: string;
  try {
    origin = getSalaryPadiSupabaseOrigin(environment.NEXT_PUBLIC_SUPABASE_URL, {
      allowLocal: environment.NODE_ENV !== "production",
    });
  } catch {
    return {
      status: "unavailable",
      errorCode: "analytics_backend_invalid",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${origin}/rest/v1/rpc/capture_analytics_event`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "api",
        "Content-Profile": "api",
        apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_event_name: eventName,
        p_route_group: routeGroup,
        p_network_key_hash: hashAnalyticsNetworkAddress(
          request,
          environment.SUPABASE_SERVICE_ROLE_KEY,
          now,
        ),
        p_window_started_at: analyticsRateLimitWindowStart(now),
      }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(4_000)]),
    });
  } catch {
    return { status: "unavailable", errorCode: "analytics_rpc_network" };
  }

  if (response.ok) {
    await discardResponseBody(response);
    return { status: "accepted" };
  }

  let errorCode: string | undefined;
  try {
    const parsed = postgrestErrorSchema.safeParse(
      await readBoundedJson(response, 8 * 1_024),
    );
    if (parsed.success) errorCode = parsed.data.code;
  } catch {
    // A malformed error response is still an unavailable backend, never a
    // reason to accept or replay the analytics event.
  }
  if (errorCode === "P0001") return { status: "rate_limited" };
  return {
    status: "unavailable",
    errorCode: `analytics_rpc_${errorCode ?? response.status}`,
  };
}
