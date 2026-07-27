import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";
import { resolveCompanyLogo } from "@/lib/companies/logo";

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
  return resolveCompanyLogo(company);
}
