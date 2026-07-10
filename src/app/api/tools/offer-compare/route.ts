import { callAfroTools } from "@/lib/afrotools/client";
import { offerCompareRequestSchema } from "@/lib/afrotools/schemas";
import { compareOffers } from "@/lib/offers";
import type { OfferComparisonResult } from "@/lib/offers";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

function isComparisonResult(value: unknown): value is OfferComparisonResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.comparisonCurrency === "string" &&
    Boolean(result.offerA) &&
    Boolean(result.offerB) &&
    Boolean(result.differences) &&
    Array.isArray(result.nonFinancialDifferences) &&
    Array.isArray(result.negotiationTalkingPoints) &&
    Array.isArray(result.normalizationNotes)
  );
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 100_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const parsed = offerCompareRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid offer comparison." },
      { status: 400 },
    );

  let fallback: OfferComparisonResult;
  try {
    fallback = compareOffers(parsed.data.input);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid offer comparison.",
      },
      { status: 400 },
    );
  }

  try {
    const response = await callAfroTools(
      "/career/offer-compare",
      parsed.data.input,
    );
    if (response.status !== "success" || !isComparisonResult(response.result)) {
      throw new Error("Unexpected AfroTools response.");
    }
    return Response.json({ result: response.result, provider: "afrotools" });
  } catch {
    return Response.json({
      result: fallback,
      provider: "salarypadi_fallback",
      notice:
        "AfroTools was unavailable, so the verified SalaryPadi fallback engine was used.",
    });
  }
}
