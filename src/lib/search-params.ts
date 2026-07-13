export type SearchParamValue = string | string[] | undefined;

export function firstSearchParam(value: SearchParamValue): string {
  return typeof value === "string" ? value : "";
}

export function sliceSearchParam(
  value: SearchParamValue,
  maxLength: number,
  fallback = "",
): string {
  const scalar = typeof value === "string" ? value : fallback;
  return scalar.slice(0, Math.max(0, maxLength));
}
