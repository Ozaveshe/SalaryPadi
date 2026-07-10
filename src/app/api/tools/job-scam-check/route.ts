import { callAfroTools } from "@/lib/afrotools/client";
import { scamCheckRequestSchema } from "@/lib/afrotools/schemas";
import { checkJobScam } from "@/lib/scam";
import type { ScamCheckResult } from "@/lib/scam";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

function isScamResult(value: unknown): value is ScamCheckResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.riskTier === "string" &&
    typeof result.riskLabel === "string" &&
    typeof result.summary === "string" &&
    Array.isArray(result.flags) &&
    Array.isArray(result.verificationSteps) &&
    Array.isArray(result.safeNextActions) &&
    Array.isArray(result.limitations)
  );
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 30_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const parsed = scamCheckRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid vacancy check." }, { status: 400 });
  const fallback = checkJobScam(parsed.data.input);

  try {
    const response = await callAfroTools(
      "/career/job-scam-check",
      parsed.data.input,
    );
    if (response.status !== "success" || !isScamResult(response.result)) {
      throw new Error("Unexpected AfroTools response.");
    }
    return Response.json({ result: response.result, provider: "afrotools" });
  } catch {
    return Response.json({
      result: fallback,
      provider: "salarypadi_fallback",
      notice:
        "AfroTools was unavailable, so the local warning-sign checker was used.",
    });
  }
}
