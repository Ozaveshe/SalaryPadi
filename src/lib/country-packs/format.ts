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
  return new Intl.NumberFormat(pack.defaultLocale, options).format(value);
}

export function formatCountryCurrency(
  value: number,
  pack: CountryPack,
  currencyCode = pack.currencyCode,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(pack.defaultLocale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
    ...options,
  }).format(value);
}
