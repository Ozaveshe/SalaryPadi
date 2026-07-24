/**
 * Registrable-domain validation for feed destination allowlists.
 *
 * A feed authorizes republication of an employer's own vacancies, so its
 * allowed destination hosts must be real registrable domains the employer
 * controls — never a bare public suffix like "com" or "co.uk", which would
 * authorize the entire TLD. Without a bundled Public Suffix List (no network
 * at runtime, no heavy dependency), this uses a curated set of the suffixes
 * that matter for African and global employer domains. It is intentionally
 * conservative: an unknown two-label host is treated as registrable, but any
 * host that IS a known public suffix, or has no label before one, is
 * rejected. Documented limitation: not a full PSL; extend KNOWN_SUFFIXES as
 * needed.
 */

const KNOWN_SUFFIXES = new Set<string>([
  // Generic
  "com",
  "org",
  "net",
  "io",
  "co",
  "app",
  "dev",
  "ai",
  "info",
  "biz",
  "jobs",
  "careers",
  "africa",
  // Multi-label generic
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  // Nigeria
  "ng",
  "com.ng",
  "org.ng",
  "gov.ng",
  "edu.ng",
  "net.ng",
  // Other African markets
  "co.za",
  "org.za",
  "co.ke",
  "or.ke",
  "com.gh",
  "com.eg",
  "co.tz",
  "co.ug",
  "rw",
  "sn",
  "ci",
  "ma",
  "gh",
  "ke",
  "za",
  "eg",
  "tz",
  "ug",
]);

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*$/;

/**
 * The registrable domain for a host (eTLD+1), or null when the host is not a
 * valid registrable domain — i.e. it is itself a public suffix, or has no
 * label before its suffix.
 */
export function registrableDomain(host: string): string | null {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || !HOSTNAME_PATTERN.test(normalized)) return null;
  if (normalized.startsWith("-") || normalized.includes("..")) return null;
  const labels = normalized.split(".");

  // Find the longest known public suffix matching the trailing labels.
  let suffixLabels = 0;
  for (let i = 0; i < labels.length; i += 1) {
    const candidate = labels.slice(i).join(".");
    if (KNOWN_SUFFIXES.has(candidate)) {
      suffixLabels = labels.length - i;
      break;
    }
  }

  if (suffixLabels === 0) {
    // Unknown suffix: accept a plausible registrable domain (>= 2 labels),
    // reject a single bare label.
    return labels.length >= 2 ? normalized : null;
  }
  // A known suffix with no registrable label before it (e.g. "com",
  // "co.uk") is a bare public suffix — reject it.
  if (labels.length <= suffixLabels) return null;
  return labels.slice(labels.length - suffixLabels - 1).join(".");
}

/** Whether `host` is a valid registrable destination host (not a bare TLD). */
export function isValidDestinationHost(host: string): boolean {
  return registrableDomain(host) !== null;
}
