export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "UTC",
    ...options,
  }).format(date);
}

export function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatSalaryAmount(amount: number, currency: string | null) {
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
