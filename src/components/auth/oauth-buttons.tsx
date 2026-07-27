import { getAvailableOAuthProviders } from "@/lib/auth/oauth-providers";

/**
 * Social sign-in options. Rendered only for providers this deployment has
 * switched on, so the page never offers a button that cannot complete.
 *
 * Each provider is its own form post rather than client-side JavaScript: the
 * flow works without hydration, and the POST keeps the existing cross-origin
 * rejection on the API route.
 */
export function OAuthButtons({
  next,
  disabled,
}: {
  next: string;
  disabled: boolean;
}) {
  const providers = getAvailableOAuthProviders();
  if (providers.length === 0) return null;

  return (
    <div className="auth-providers stack">
      <div className="auth-provider-buttons">
        {providers.map((provider) => (
          <form
            key={provider.provider}
            action="/api/auth/oauth"
            method="post"
            className="auth-provider-form"
          >
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="provider" value={provider.provider} />
            <button
              className="button button-secondary auth-provider-button"
              type="submit"
              disabled={disabled}
            >
              <span aria-hidden="true" className="auth-provider-mark">
                {provider.provider === "google" ? "G" : "in"}
              </span>
              {provider.label}
            </button>
          </form>
        ))}
      </div>
      <p className="field-help m-0">
        We receive only your name, email address and profile picture. We never
        receive your password, connections, or salary, and we never post on your
        behalf.
      </p>
      <div className="auth-divider" role="separator">
        <span>or use email</span>
      </div>
    </div>
  );
}
