import catalog from "../../../data/companies/africa-major-companies.v1.json";

export interface AfricanCompanyCatalogEntry {
  rank: number;
  slug: string;
  name: string;
  sector: string;
  marketCountryCode: string;
  marketCountry: string;
  region:
    | "north_africa"
    | "east_africa"
    | "west_africa"
    | "central_africa"
    | "southern_africa";
  website: string;
  domain: string;
  officialSourceUrl: string;
  officialSourceTitle: string;
}

export interface AfricanCompanySelection {
  title: string;
  url: string;
  dataAsOf: string;
  methodology: string;
}

const entries = catalog.companies as AfricanCompanyCatalogEntry[];
const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));

export function getAfricanCompanyCatalog() {
  return entries;
}

export function getAfricanCompanyCatalogEntry(slug: string) {
  return entriesBySlug.get(slug) ?? null;
}

export function getAfricanCompanySelection() {
  return catalog.selectionSource as AfricanCompanySelection;
}
