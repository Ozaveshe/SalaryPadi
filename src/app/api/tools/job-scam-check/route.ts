import { scamCheckRequestSchema } from "@/lib/afrotools/schemas";
import {
  JsonBodyError,
  noStoreJson,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { checkJobScam } from "@/lib/scam";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return noStoreResponse(crossOrigin);
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 30_000);
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof JsonBodyError && error.code === "too_large"
            ? "Request is too large."
            : "Invalid vacancy check.",
      },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }
  const parsed = scamCheckRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid vacancy check." }, { status: 400 });
  }
  return noStoreJson({
    result: checkJobScam(parsed.data.input),
    provider: "salarypadi_deterministic",
  });
}
