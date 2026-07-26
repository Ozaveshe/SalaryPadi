import { parse as parseHost } from "tldts";

/**
 * Destination-host validation for employer feed authorizations.
 *
 * A feed authorizes republication of one employer's own vacancies, so its
 * allowed destination hosts must be real registrable domains that the employer
 * controls. This previously used a hand-curated 40-entry suffix table, which
 * accepted genuine public suffixes outside that table — `com.au`, `co.jp`,
 * `com.br`, `co.in`, `org.au` all passed as "registrable", and a registry entry
 * naming one would have authorized every domain under that suffix.
 *
 * It now uses `tldts` (already a production dependency, also used by
 * company-claim, employer-submission and scam-signal validation), which carries
 * the real Public Suffix List.
 */

/** Small helper: IDNA/punycode normalisation via the URL parser. */
function normalizeHostname(host: string): string | null {
  const trimmed = host.trim().toLowerCase().replace(/\.+$/, "");
  if (!trimmed || trimmed.length > 253) return null;
  // Reject anything carrying scheme, credentials, port, path or whitespace
  // before it reaches the URL parser, so only a bare hostname is accepted.
  if (/[\s/\\@:?#]/.test(trimmed)) return null;
  try {
    // The URL parser performs IDNA conversion, so a Unicode host normalises to
    // its punycode form and can be compared against a punycode authorization.
    const { hostname } = new URL(`https://${trimmed}`);
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * The registrable domain (eTLD+1) for a host, or null when the host is not a
 * valid registrable domain — i.e. it is itself a public suffix, an IP literal,
 * localhost, or otherwise unusable as an authorization boundary.
 */
export function registrableDomain(host: string): string | null {
  const normalized = normalizeHostname(host);
  if (!normalized) return null;

  const parsed = parseHost(normalized, {
    allowPrivateDomains: false,
    detectIp: true,
  });

  // An IP literal cannot express "this employer's domain and its subdomains".
  if (parsed.isIp) return null;
  // localhost and other single-label hosts have no registrable boundary.
  if (!parsed.domain || !parsed.publicSuffix) return null;
  // The host IS a public suffix ("com", "co.uk", "com.ng", "com.au"): there is
  // no registrable label in front of it, so it authorizes an entire suffix.
  if (normalized === parsed.publicSuffix) return null;
  return parsed.domain;
}

/** Whether `host` is usable as a feed destination authorization. */
export function isValidDestinationHost(host: string): boolean {
  return registrableDomain(host) !== null;
}

/**
 * Whether a candidate URL's host falls inside an authorized destination host.
 *
 * Authorization for `employer.com` covers `employer.com` and any subdomain of
 * it, and nothing else. Suffix string matching is deliberately avoided: it
 * would let `employer.com` authorize `not-employer.com`.
 */
export function isAuthorizedDestination(
  url: string,
  allowedHosts: readonly string[],
): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.port && parsedUrl.port !== "443")
  ) {
    return false;
  }

  const candidate = normalizeHostname(parsedUrl.hostname);
  if (!candidate) return false;
  const candidateParsed = parseHost(candidate, {
    allowPrivateDomains: false,
    detectIp: true,
  });
  if (candidateParsed.isIp || !candidateParsed.domain) return false;

  return allowedHosts.some((allowed) => {
    const allowedHost = normalizeHostname(allowed);
    if (!allowedHost) return false;
    // Exact host match is always sufficient.
    if (candidate === allowedHost) return true;
    // Otherwise the candidate must be a true subdomain of the authorized host,
    // AND share its registrable domain. The label-boundary check alone rejects
    // "not-employer.com"; the registrable-domain check additionally prevents an
    // authorization for a public suffix from ever widening.
    const allowedRegistrable = registrableDomain(allowedHost);
    if (!allowedRegistrable) return false;
    return (
      candidate.endsWith(`.${allowedHost}`) &&
      candidateParsed.domain === allowedRegistrable
    );
  });
}
