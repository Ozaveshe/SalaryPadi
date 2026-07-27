import { getAuthProviderFlags } from "@/lib/env";

/**
 * Social sign-in providers SalaryPadi supports.
 *
 * These are Supabase Auth provider slugs. `linkedin_oidc` is LinkedIn's current
 * "Sign In with LinkedIn using OpenID Connect" product; the older `linkedin`
 * slug is retired and must not be reintroduced.
 *
 * What a provider actually gives us is deliberately recorded here, because it
 * bounds what the product may claim about a person. Both providers return an
 * OIDC identity: subject, name, email, email_verified and picture. Neither
 * returns employment history, job titles, pay data or skills. A verified email
 * from the provider is evidence of the address only — never of the person's
 * employer, seniority or earnings.
 */
export const OAUTH_PROVIDERS = ["google", "linkedin_oidc"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return (
    typeof value === "string" &&
    (OAUTH_PROVIDERS as readonly string[]).includes(value)
  );
}

type ProviderPresentation = {
  provider: OAuthProvider;
  label: string;
  /** Scopes requested at authorization time. OIDC basic identity only. */
  scopes: string;
};

const PRESENTATION: Record<OAuthProvider, ProviderPresentation> = {
  google: {
    provider: "google",
    label: "Continue with Google",
    scopes: "openid email profile",
  },
  linkedin_oidc: {
    provider: "linkedin_oidc",
    label: "Continue with LinkedIn",
    scopes: "openid profile email",
  },
};

export function getOAuthProviderPresentation(
  provider: OAuthProvider,
): ProviderPresentation {
  return PRESENTATION[provider];
}

/**
 * The providers the sign-in page may offer. A provider is offered only when it
 * is switched on for this deployment; the credentials themselves live in
 * Supabase Auth. An unconfigured provider is simply absent rather than rendered
 * and broken, which keeps the sign-in page honest about what will work.
 */
export function getAvailableOAuthProviders(): ProviderPresentation[] {
  const flags = getAuthProviderFlags();
  return OAUTH_PROVIDERS.filter((provider) => flags[provider]).map(
    (provider) => PRESENTATION[provider],
  );
}
