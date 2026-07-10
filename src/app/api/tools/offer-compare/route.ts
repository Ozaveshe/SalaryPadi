import {
  callAfroTools,
  invalidAfroToolsResponse,
  logAfroToolsFallback,
} from "@/lib/afrotools/client";
import {
  afroToolsOfferCompareResponseSchema,
  offerCompareRequestSchema,
} from "@/lib/afrotools/schemas";
import {
  JsonBodyError,
  noStoreJson,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { compareOffers } from "@/lib/offers";
import type { OfferComparisonResult } from "@/lib/offers";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return noStoreResponse(crossOrigin);

  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 100_000);
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof JsonBodyError && error.code === "too_large"
            ? "Request is too large."
            : "Invalid offer comparison.",
      },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }

  const parsed = offerCompareRequestSchema.safeParse(payload);
  if (!parsed.success)
    return noStoreJson({ error: "Invalid offer comparison." }, { status: 400 });

  let fallback: OfferComparisonResult;
  try {
    fallback = compareOffers(parsed.data.input);
  } catch (error) {
    return noStoreJson(
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
    const upstream = afroToolsOfferCompareResponseSchema.safeParse(response);
    if (!upstream.success) throw invalidAfroToolsResponse();
    return noStoreJson({ result: upstream.data.result, provider: "afrotools" });
  } catch (error) {
    logAfroToolsFallback("offer_compare", error);
    return noStoreJson({
      result: fallback,
      provider: "salarypadi_fallback",
      notice:
        "AfroTools was unavailable, so the verified SalaryPadi fallback engine was used.",
    });
  }
}
