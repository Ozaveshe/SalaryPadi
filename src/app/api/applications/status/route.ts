import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "saved",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ]),
  private_notes: z.string().trim().max(2_000).optional(),
  next_action_at: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().date().optional(),
  ),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  const parsed = schema.safeParse(
    Object.fromEntries((await request.formData()).entries()),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid status update." }, { status: 400 });
  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;
  const { error } = await context.supabase
    .schema("api")
    .rpc("update_application_status", {
      application_id: parsed.data.id,
      application_status: parsed.data.status,
      notes: parsed.data.private_notes ?? null,
      next_action_date: parsed.data.next_action_at ?? null,
    });
  const url = new URL("/applications", getAppOrigin());
  url.searchParams.set("updated", error ? "error" : "true");
  return NextResponse.redirect(url, 303);
}
