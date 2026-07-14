import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";
import { resolveCompanyLogo } from "@/lib/companies/logo";
import { getServerEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = getAfricanCompanyCatalogEntry(slug);
  if (!company) {
    return Response.json(
      { error: "company_logo_not_allowlisted" },
      { status: 404, headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
  return resolveCompanyLogo(
    company,
    getServerEnvironment().LOGO_DEV_PUBLISHABLE_KEY,
  );
}
