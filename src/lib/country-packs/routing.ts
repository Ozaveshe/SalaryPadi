import {
  COUNTRY_PACKS,
  getDefaultCountryPack,
  isCountryPackIndexable,
  isCountryPackPublic,
  type CountryPack,
} from "./registry";

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function normalizePath(path: string) {
  if (!path || path === "/") return "";
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

export function localizedCountryPath(pack: CountryPack, path: string) {
  if (!isCountryPackPublic(pack)) return null;
  return `${pack.routePrefix}${normalizePath(path)}` || "/";
}

export function countryCanonicalUrl(
  origin: string,
  pack: CountryPack,
  path: string,
) {
  const localizedPath = localizedCountryPath(pack, path);
  return localizedPath ? `${normalizeOrigin(origin)}${localizedPath}` : null;
}

export function countryAlternates(
  origin: string,
  path: string,
): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const pack of COUNTRY_PACKS) {
    if (!isCountryPackIndexable(pack)) continue;
    const canonical = countryCanonicalUrl(origin, pack, path);
    if (!canonical) continue;
    for (const locale of pack.locales) {
      if (locale.contentStatus === "reviewed")
        languages[locale.tag] = canonical;
    }
  }

  const defaultPack = getDefaultCountryPack();
  const canonical = countryCanonicalUrl(origin, defaultPack, path);
  if (!canonical) throw new Error("The default country route is not public.");
  languages["x-default"] = canonical;

  return { canonical, languages };
}

export interface ResolvedCountryRoute {
  pack: CountryPack;
  path: string;
  public: boolean;
}

/**
 * Resolves configured prefixes without making them public. Callers must check
 * `public` and return 404 for candidate packs.
 */
export function resolveCountryRoute(pathname: string): ResolvedCountryRoute {
  const normalized = normalizePath(pathname);
  for (const pack of COUNTRY_PACKS) {
    if (!pack.routePrefix) continue;
    if (
      normalized === pack.routePrefix ||
      normalized.startsWith(`${pack.routePrefix}/`)
    ) {
      return {
        pack,
        path: normalized.slice(pack.routePrefix.length) || "/",
        public: isCountryPackPublic(pack),
      };
    }
  }
  const pack = getDefaultCountryPack();
  return { pack, path: normalized || "/", public: isCountryPackPublic(pack) };
}
