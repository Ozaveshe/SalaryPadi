export const SALARYPADI_SUPABASE_PROJECT_REF = "bxelrhklsznmpksgrqep";
export const SALARYPADI_SUPABASE_ORIGIN = `https://${SALARYPADI_SUPABASE_PROJECT_REF}.supabase.co`;

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type SalaryPadiSupabaseUrlOptions = {
  allowLocal?: boolean;
};

/**
 * Prevent a SalaryPadi credential from ever being sent to another Supabase
 * project (or to an arbitrary URL). Local Supabase is opt-in for development
 * and tests; production callers must use the exact SalaryPadi project origin.
 */
export function getSalaryPadiSupabaseOrigin(
  rawUrl: string,
  { allowLocal = false }: SalaryPadiSupabaseUrlOptions = {},
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("SalaryPadi Supabase URL is invalid.");
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "SalaryPadi Supabase URL must be a credential-free project origin.",
    );
  }

  if (url.origin === SALARYPADI_SUPABASE_ORIGIN) {
    return SALARYPADI_SUPABASE_ORIGIN;
  }

  const isAllowedLocal =
    allowLocal &&
    loopbackHosts.has(url.hostname) &&
    (url.protocol === "http:" || url.protocol === "https:");
  if (isAllowedLocal) return url.origin;

  throw new Error(
    `SalaryPadi must use Supabase project ${SALARYPADI_SUPABASE_PROJECT_REF}.`,
  );
}
