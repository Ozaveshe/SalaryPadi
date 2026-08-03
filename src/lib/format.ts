import {
  SALARYPADI_TIME_ZONE,
  SALARYPADI_TIME_ZONE_LABEL,
} from "@/lib/time/zone";

export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: SALARYPADI_TIME_ZONE,
    ...options,
  }).format(date);
}

/**
 * A provenance timestamp rendered identically for every visitor.
 *
 * Evidence timestamps are a truth claim, so they are pinned to one locale and
 * one zone and carry that zone in the text. Rendering them through the
 * visitor's implicit locale left "when was this verified" ambiguous and
 * disagreed with every other date on the site. The zone is the product's own —
 * a Nigerian reader should not have to subtract an hour to place an evidence
 * timestamp. Returns null for an unparseable value so the caller can omit the
 * clause rather than print a placeholder.
 */
export function formatDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: SALARYPADI_TIME_ZONE,
  }).format(date);
  return `${formatted} ${SALARYPADI_TIME_ZONE_LABEL}`;
}

/**
 * An exchange rate at a readable precision. Rates arrive as raw floats, so
 * printing them directly leaked artefacts such as 1650.4523000000002 onto a
 * public evidence line. Significant digits keep both large pairs (NGN) and
 * small ones (0.00061) legible.
 */
export function formatExchangeRate(rate: number): string | null {
  if (!Number.isFinite(rate)) return null;
  return new Intl.NumberFormat("en-NG", {
    maximumSignificantDigits: 6,
  }).format(rate);
}

export function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatSalaryAmount(amount: number, currency: string | null) {
  // A non-finite amount must never reach a public surface as "NaN" or "∞".
  if (!Number.isFinite(amount)) return "Not published";
  if (!currency) return new Intl.NumberFormat("en-NG").format(amount);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-NG").format(amount)}`;
  }
}
