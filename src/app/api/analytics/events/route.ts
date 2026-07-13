import { cookies } from "next/headers";
import { z } from "zod";

import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/consent";
import { isAnalyticsEventName } from "@/lib/analytics/events";
import { analyticsRouteGroup } from "@/lib/analytics/route-group";
import { captureAnalyticsEvent } from "@/lib/analytics/server";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const eventSchema = z.object({
  event_name: z.string().trim().max(80),
  path: z.string().trim().max(240).startsWith("/"),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if ((await cookies()).get(ANALYTICS_CONSENT_COOKIE)?.value !== "granted") {
    return new Response(null, { status: 204 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isAnalyticsEventName(parsed.data.event_name)) {
    return Response.json(
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
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": "300" },
    });
  }
  if (result.status === "unavailable") {
    console.error(
      JSON.stringify({
        event: "analytics_capture_failed",
        error_code: result.errorCode,
      }),
    );
    return Response.json({ error: "Analytics unavailable." }, { status: 503 });
  }
  return new Response(null, { status: 204 });
}
