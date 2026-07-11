import { logAfroToolsFallback } from "@/lib/afrotools/client";
import { publicAfroToolsError } from "@/lib/afrotools/errors";
import { offerCompareRequestSchema } from "@/lib/afrotools/schemas";
import {
  getAfroToolsFxRate,
  type AfroToolsFxEvidence,
} from "@/lib/afrotools/services";
import {
  JsonBodyError,
  noStoreJson,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { compareOffers } from "@/lib/offers";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return noStoreResponse(crossOrigin);
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 100_000);
  } catch (error) {
    return noStoreJson(
      { error: "Invalid offer comparison." },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }
  const parsed = offerCompareRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid offer comparison." }, { status: 400 });
  }
  const { offerA, offerB, comparisonCurrency } = parsed.data.input;
  try {
    const pairs = [
      ...new Set([offerA.basePay.currency, offerB.basePay.currency]),
    ].filter((currency) => currency !== comparisonCurrency);
    const evidence = await Promise.all(
      pairs.map((currency) => getAfroToolsFxRate(currency, comparisonCurrency)),
    );
    const fxRates = evidence.map((rate) => ({
      from: rate.from,
      to: rate.to,
      rate: rate.rate,
      sourceLabel: rate.source,
      asOf: rate.updatedAt,
    }));
    const result = compareOffers({
      offerA,
      offerB,
      comparisonCurrency,
      fxRates,
    });
    return noStoreJson({
      result,
      provider: "salarypadi_deterministic",
      fxEvidence: evidence satisfies AfroToolsFxEvidence[],
    });
  } catch (error) {
    logAfroToolsFallback("offer_compare", error);
    const failure = publicAfroToolsError(error, "AfroTools FX");
    return noStoreJson(failure, {
      status: failure.status,
      headers:
        failure.retryAfterSeconds === undefined
          ? undefined
          : { "Retry-After": String(failure.retryAfterSeconds) },
    });
  }
}
