export type SearchParamValue = string | string[] | undefined;

/**
 * The single scalar value of a query parameter, or "" when there is not
 * exactly one.
 *
 * A repeated parameter (`?status=ok&status=forged`) arrives as an array and is
 * rejected outright rather than resolved to its first element. That is
 * deliberate despite the name: these values drive status banners and
 * pre-filled fields, and quietly taking "the first one" is the behaviour
 * parameter pollution relies on. Rejecting the ambiguous input is the safe
 * read, and the accompanying test pins it.
 */
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
