import { getAdminApiContext } from "@/lib/auth/api";
import { getProductionHealthResult } from "@/lib/operations/production-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const result = await getProductionHealthResult(admin.supabase);
  if (result.data) {
    return Response.json(result.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return Response.json(
    {
      error: "Production health evidence is unavailable.",
      state: result.state,
      code: result.issues[0]?.code ?? "production_health_unavailable",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
