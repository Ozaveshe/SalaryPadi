import { logAfroToolsFallback } from "@/lib/afrotools/client";
import { publicAfroToolsError } from "@/lib/afrotools/errors";
import { salaryConversionRequestSchema } from "@/lib/afrotools/schemas";
import { getAfroToolsFxRate } from "@/lib/afrotools/services";
import {
  JsonBodyError,
  noStoreJson,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return noStoreResponse(crossOrigin);
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 10_000);
  } catch (error) {
    return noStoreJson(
      { error: "Invalid salary conversion request." },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }
  const parsed = salaryConversionRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson(
      { error: "Enter a positive amount and valid three-letter currencies." },
      { status: 400 },
    );
  }
  const { amount, from, to, period } = parsed.data.input;
  try {
    const evidence = await getAfroToolsFxRate(from, to);
    return noStoreJson({
      result: {
        amount,
        convertedAmount: amount * evidence.rate,
        from,
        to,
        period,
        evidence,
      },
      provider: "afrotools",
    });
  } catch (error) {
    logAfroToolsFallback("salary_conversion", error);
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
