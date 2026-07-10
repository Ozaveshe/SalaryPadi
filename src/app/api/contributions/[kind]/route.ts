import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/dal";
import {
  contributionSchemas,
  type ContributionKind,
} from "@/lib/contributions/schemas";
import { getAppOrigin } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const kinds = new Set<ContributionKind>(["salary", "review", "interview"]);

export async function POST(
  request: Request,
  context: RouteContext<"/api/contributions/[kind]">,
) {
  const crossOriginResponse = rejectCrossOriginRequest(request);
  if (crossOriginResponse) return crossOriginResponse;
  if (Number(request.headers.get("content-length") ?? "0") > 60_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const { kind: rawKind } = await context.params;
  if (!kinds.has(rawKind as ContributionKind))
    return Response.json(
      { error: "Unknown contribution type." },
      { status: 404 },
    );
  const kind = rawKind as ContributionKind;
  const viewer = await getViewer();
  if (viewer.state !== "authenticated")
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const formData = await request.formData();
  const payload = Object.fromEntries(formData.entries());
  const parsed = contributionSchemas[kind].safeParse(payload);
  if (!parsed.success)
    return NextResponse.redirect(
      new URL(`/contribute/${kind}?status=error`, getAppOrigin()),
      303,
    );
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return NextResponse.redirect(
      new URL("/auth/sign-in?status=setup", getAppOrigin()),
      303,
    );
  const { error } = await supabase.schema("api").rpc("submit_contribution", {
    contribution_kind: kind,
    contribution_payload: parsed.data,
  });
  return NextResponse.redirect(
    new URL(
      error ? "/contribute?status=error" : "/contribute?status=submitted",
      getAppOrigin(),
    ),
    303,
  );
}
