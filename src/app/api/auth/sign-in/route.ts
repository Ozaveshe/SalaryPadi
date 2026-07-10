import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { safeRelativePath } from "@/lib/security/urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 10_000) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  const formData = await request.formData();
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?status=error", getAppOrigin()),
      303,
    );
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?status=setup", getAppOrigin()),
      303,
    );
  }

  const next = safeRelativePath(parsed.data.next, "/saved");
  const confirmation = new URL("/auth/confirm", getAppOrigin());
  confirmation.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: confirmation.toString() },
  });

  const resultUrl = new URL("/auth/sign-in", getAppOrigin());
  resultUrl.searchParams.set("status", error ? "error" : "check-email");
  return NextResponse.redirect(resultUrl, 303);
}
