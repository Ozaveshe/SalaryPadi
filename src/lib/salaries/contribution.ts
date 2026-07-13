export function buildSalaryContributionHref({
  company,
  role,
  country,
}: {
  company?: string | null;
  role?: string | null;
  country?: string | null;
}): string {
  const search = new URLSearchParams();
  const cleanCompany = company?.trim().slice(0, 180);
  const cleanRole = role?.trim().slice(0, 160);
  const cleanCountry = country?.trim().toUpperCase();
  if (cleanCompany) search.set("company", cleanCompany);
  if (cleanRole) search.set("role", cleanRole);
  if (cleanCountry && /^[A-Z]{2}$/.test(cleanCountry)) {
    search.set("country", cleanCountry);
  }
  const query = search.toString();
  return query ? `/contribute/salary?${query}` : "/contribute/salary";
}
