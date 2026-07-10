import { getAppOrigin } from "@/lib/env";

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === getAppOrigin();
  } catch {
    return false;
  }
}

export function rejectCrossOriginRequest(request: Request): Response | null {
  if (isSameOriginRequest(request)) return null;

  return Response.json(
    { error: "The request origin could not be verified." },
    { status: 403 },
  );
}
