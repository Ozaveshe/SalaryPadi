import { NextResponse } from "next/server";

import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;

  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", getAppOrigin()), 303);
}
