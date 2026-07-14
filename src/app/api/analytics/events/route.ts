import { cookies } from "next/headers";
import { z } from "zod";

import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/consent";
import { isAnalyticsEventName } from "@/lib/analytics/events";
import { analyticsRouteGroup } from "@/lib/analytics/route-group";
import { captureAnalyticsEvent } from "@/lib/analytics/server";
import {
  JsonBodyError,
  noStoreJson,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const ANALYTICS_EVENT_MAX_REQUEST_BYTES = 2 * 1024;
const eventSchema = z.object({
  event_name: z.string().trim().max(80),
  path: z.string().trim().max(240).startsWith("/"),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if ((await cookies()).get(ANALYTICS_CONSENT_COOKIE)?.value !== "granted") {
    return noStoreResponse(new Response(null, { status: 204 }));
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, ANALYTICS_EVENT_MAX_REQUEST_BYTES);
  } catch (error) {
    return noStoreJson(
      { error: "Analytics event not allowed." },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success || !isAnalyticsEventName(parsed.data.event_name)) {
    return noStoreJson(
      { error: "Analytics event not allowed." },
      { status: 400 },
    );
  }
  const result = await captureAnalyticsEvent({
    eventName: parsed.data.event_name,
    routeGroup: analyticsRouteGroup(parsed.data.path),
    request,
  });
  if (result.status === "rate_limited") {
    return noStoreResponse(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "300" },
      }),
    );
  }
  if (result.status === "unavailable") {
    console.error(
      JSON.stringify({
        event: "analytics_capture_failed",
        error_code: result.errorCode,
      }),
    );
    return noStoreJson({ error: "Analytics unavailable." }, { status: 503 });
  }
  return noStoreResponse(new Response(null, { status: 204 }));
}
