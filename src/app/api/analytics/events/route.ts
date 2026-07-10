import { cookies } from "next/headers";
import { z } from "zod";

import { isAnalyticsEventName } from "@/lib/analytics/events";
import { analyticsRouteGroup } from "@/lib/analytics/route-group";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const eventSchema = z.object({
  event_name: z.string().trim().max(80),
  path: z.string().trim().max(240).startsWith("/"),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if ((await cookies()).get("salarypadi_analytics")?.value !== "granted") {
    return new Response(null, { status: 204 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isAnalyticsEventName(parsed.data.event_name)) {
    return Response.json(
      { error: "Analytics event not allowed." },
      { status: 400 },
    );
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return Response.json({ error: "Backend unavailable." }, { status: 503 });
  const { error } = await supabase
    .schema("api")
    .rpc("capture_analytics_event", {
      p_event_name: parsed.data.event_name,
      p_route_group: analyticsRouteGroup(parsed.data.path),
    });
  if (error)
    return Response.json({ error: "Analytics unavailable." }, { status: 503 });
  return new Response(null, { status: 204 });
}
