import { getServerEnvironment, getSupabasePublicConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const environment = getServerEnvironment();

  return Response.json(
    {
      status: "ok",
      service: "salarypadi-web",
      checks: {
        backend_configured: Boolean(getSupabasePublicConfig()),
        remotive_source_enabled: environment.REMOTIVE_SOURCE_ENABLED,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
