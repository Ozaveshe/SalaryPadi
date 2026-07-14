import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  containsProhibitedDocumentField,
  contributionSchemas,
  type ContributionKind,
} from "@/lib/contributions/schemas";
import { hashContributionNetworkAddress } from "@/lib/contributions/abuse";
import { analyzeContributionPayload } from "@/lib/contributions/moderation";
import { getAppOrigin, getServerEnvironment } from "@/lib/env";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const kinds = new Set<ContributionKind>([
  "salary",
  "review",
  "interview",
  "benefits",
  "pay_reliability",
]);

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
  const authenticated = await getAuthenticatedApiContext();
  if (!authenticated.ok) return authenticated.response;
  const formData = await request.formData();
  if (containsProhibitedDocumentField(formData)) {
    return Response.json(
      {
        error:
          "Payslips, documents, work email, and verification evidence are not accepted.",
      },
      { status: 400 },
    );
  }
  const payload = Object.fromEntries(formData.entries());
  const parsed = contributionSchemas[kind].safeParse(payload);
  if (!parsed.success)
    return NextResponse.redirect(
      new URL(`/contribute/${kind}?status=error`, getAppOrigin()),
      303,
    );
  const environment = getServerEnvironment();
  const moderationFlags = analyzeContributionPayload(parsed.data);
  const dailyNetworkKeyHash = environment.SUPABASE_SERVICE_ROLE_KEY
    ? hashContributionNetworkAddress(
        request,
        environment.SUPABASE_SERVICE_ROLE_KEY,
      )
    : undefined;
  const contributionPayload = {
    ...parsed.data,
    _intake: {
      flags: moderationFlags,
      ...(dailyNetworkKeyHash
        ? { daily_network_key_hash: dailyNetworkKeyHash }
        : {}),
      rule_version: "company-intake-v1",
    },
  };
  const { error } = await authenticated.supabase
    .schema("api")
    .rpc("submit_contribution", {
      contribution_kind: kind,
      contribution_payload: contributionPayload,
    });
  const destination = new URL(
    error ? "/contribute?status=error" : "/contribute?status=submitted",
    getAppOrigin(),
  );
  if (!error) destination.searchParams.set("kind", kind);
  return NextResponse.redirect(destination, 303);
}
