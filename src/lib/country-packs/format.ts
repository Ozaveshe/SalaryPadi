import type { CountryPack } from "./registry";

export function formatCountryDate(
  value: string | Date,
  pack: CountryPack,
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat(pack.defaultLocale, {
    dateStyle: "medium",
    timeZone: pack.defaultTimeZone,
    ...options,
  }).format(date);
}

export function formatCountryNumber(
  value: number,
  pack: CountryPack,
  options: Intl.NumberFormatOptions = {},
) {
  // A non-finite value must never reach a public surface as "NaN" or "∞".
  if (!Number.isFinite(value)) return "Not published";
  return new Intl.NumberFormat(pack.defaultLocale, options).format(value);
}

export function formatCountryCurrency(
  value: number,
  pack: CountryPack,
  currencyCode = pack.currencyCode,
  options: Intl.NumberFormatOptions = {},
) {
  if (!Number.isFinite(value)) return "Not published";
  try {
    return new Intl.NumberFormat(pack.defaultLocale, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
      ...options,
    }).format(value);
  } catch {
    // An unsupported currency code makes Intl throw, which would take down
    // the whole render. Name the code beside the amount instead.
    return `${currencyCode} ${formatCountryNumber(value, pack, options)}`;
  }
}
