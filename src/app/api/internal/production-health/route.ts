import { getAdminApiContext } from "@/lib/auth/api";
import { getProductionHealth } from "@/lib/operations/production-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  try {
    const health = await getProductionHealth(admin.supabase);
    return Response.json(health, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Production health evidence is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
