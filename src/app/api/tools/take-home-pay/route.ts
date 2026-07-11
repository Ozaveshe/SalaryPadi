import { logAfroToolsFallback } from "@/lib/afrotools/client";
import { publicAfroToolsError } from "@/lib/afrotools/errors";
import { payeCalculationRequestSchema } from "@/lib/afrotools/schemas";
import { calculateAfroToolsPaye } from "@/lib/afrotools/services";
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
      { error: "Invalid PAYE calculation request." },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }
  const parsed = payeCalculationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson(
      { error: "Enter a positive amount and choose a valid calculation mode." },
      { status: 400 },
    );
  }
  try {
    return noStoreJson({
      result: await calculateAfroToolsPaye(parsed.data.input),
      provider: "afrotools",
    });
  } catch (error) {
    logAfroToolsFallback("paye", error);
    const failure = publicAfroToolsError(error, "AfroTools PAYE");
    return noStoreJson(failure, {
      status: failure.status,
      headers:
        failure.retryAfterSeconds === undefined
          ? undefined
          : { "Retry-After": String(failure.retryAfterSeconds) },
    });
  }
}
