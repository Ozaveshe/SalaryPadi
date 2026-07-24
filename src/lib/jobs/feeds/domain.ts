import { parse as parseDomain } from "tldts";

/**
 * Destination-host authorization for employer feeds.
 *
 * A feed authorizes republication of one employer's own vacancies, so every
 * record destination must land on a host that employer controls. This uses
 * tldts (the real Public Suffix List) rather than a curated suffix table, so
 * a bare public suffix such as "com", "co.uk" or "com.ng" can never be
 * authorized — that would hand over an entire TLD.
 *
 * Comparison is canonical: hostnames are lower-cased, trailing dots removed,
 * and Unicode is converted to ASCII punycode by tldts before matching, so a
 * homograph or mixed-case host cannot bypass an allowlist entry.
 */

export interface DestinationHostRules {
  /** Explicitly authorized hosts (registrable domains or exact subdomains). */
  allowedHosts: readonly string[];
  /**
   * Whether a subdomain of an authorized registrable domain is acceptable.
   * Defaults to true: careers.employer.com under employer.com is the normal
   * employer case. Exact-host entries always match themselves.
   */
  allowSubdomains?: boolean;
}

/** Canonical ASCII hostname, or null when the input is not a usable host. */
export function canonicalHostname(host: string): string | null {
  const trimmed = host.trim().replace(/\.+$/, "");
  if (!trimmed || /\s/.test(trimmed)) return null;
  const parsed = parseDomain(trimmed, { allowPrivateDomains: false });
  const hostname = parsed.hostname;
  if (!hostname) return null;
  // tldts returns the punycode/ASCII form; reject anything still non-ASCII.
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  return hostname;
}

/**
 * The registrable domain (eTLD+1) for a host, or null when the host is not a
 * registrable domain: a bare public suffix, an IP literal, localhost, or an
 * otherwise unusable value.
 */
export function registrableDomain(host: string): string | null {
  const hostname = canonicalHostname(host);
  if (!hostname) return null;
  const parsed = parseDomain(hostname, { allowPrivateDomains: false });
  if (parsed.isIp) return null;
  // "localhost" and other non-ICANN names have no public suffix.
  if (!parsed.publicSuffix || !parsed.domain) return null;
  // A host that IS the public suffix (com, co.uk, com.ng) is never registrable.
  if (hostname === parsed.publicSuffix) return null;
  return parsed.domain;
}

/** Whether a value may be stored as an authorized destination host. */
export function isValidDestinationHost(host: string): boolean {
  return registrableDomain(host) !== null;
}

export type DestinationRejection =
  | "invalid_url"
  | "not_https"
  | "credentials_present"
  | "unexpected_port"
  | "ip_literal"
  | "localhost"
  | "invalid_host"
  | "host_not_authorized";

export type DestinationCheck =
  { ok: true; hostname: string } | { ok: false; reason: DestinationRejection };

/**
 * Validates one record destination URL against a feed's authorization.
 * Every rejection is explicit so the caller can count and report it rather
 * than silently repairing or dropping the record.
 */
export function checkDestinationUrl(
  url: string,
  rules: DestinationHostRules,
): DestinationCheck {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentials_present" };
  }
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, reason: "unexpected_port" };
  }

  const hostname = canonicalHostname(parsed.hostname);
  if (!hostname) return { ok: false, reason: "invalid_host" };
  const info = parseDomain(hostname, { allowPrivateDomains: false });
  if (info.isIp) return { ok: false, reason: "ip_literal" };
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "localhost" };
  }
  if (!info.publicSuffix || !info.domain || hostname === info.publicSuffix) {
    return { ok: false, reason: "invalid_host" };
  }

  const allowSubdomains = rules.allowSubdomains !== false;
  for (const entry of rules.allowedHosts) {
    const allowed = canonicalHostname(entry);
    if (!allowed) continue;
    if (hostname === allowed) return { ok: true, hostname };
    if (allowSubdomains && hostname.endsWith(`.${allowed}`)) {
      // Only authorize the subdomain when the allowlist entry is itself a
      // registrable domain — never when it is a public suffix.
      if (registrableDomain(allowed)) return { ok: true, hostname };
    }
  }
  return { ok: false, reason: "host_not_authorized" };
}
