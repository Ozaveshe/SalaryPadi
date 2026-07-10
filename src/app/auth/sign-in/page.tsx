import type { Metadata } from "next";

import { BackendNotice } from "@/components/backend-notice";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { getViewer } from "@/lib/auth/dal";
import { safeRelativePath } from "@/lib/security/urls";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in securely to save jobs and manage private career data.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  const parameters = await searchParams;
  const next = safeRelativePath(parameters.next, "/saved");
  const status =
    typeof parameters.status === "string" ? parameters.status : null;

  return (
    <div className="reading-shell stack-lg">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Sign in" }]}
      />
      <PageHeading
        eyebrow="Private account"
        title="Keep your career plan in one place"
        description="We will email a secure sign-in link. There is no password to remember, and your saved jobs, notes and applications stay private."
      />
      {viewer.state === "unconfigured" || status === "setup" ? (
        <BackendNotice />
      ) : null}
      {status === "check-email" ? (
        <div className="notice" role="status">
          Check your email for the SalaryPadi sign-in link. It may take a
          minute.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="notice notice-danger" role="alert">
          We could not send that link. Check the address and try again.
        </div>
      ) : null}
      {viewer.state === "authenticated" ? (
        <div className="surface surface-pad stack">
          <h2 className="section-title">You are already signed in</h2>
          <p className="text-muted m-0">
            Continue to your private career workspace.
          </p>
          <a className="button w-fit" href={next}>
            Continue
          </a>
        </div>
      ) : (
        <form
          className="surface surface-pad stack"
          action="/api/auth/sign-in"
          method="post"
        >
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              className="input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              required
            />
            <p className="field-help">
              Used for authentication and account notices—not public
              contributions.
            </p>
          </div>
          <button
            className="button w-fit"
            type="submit"
            disabled={viewer.state === "unconfigured"}
          >
            Email me a sign-in link
          </button>
        </form>
      )}
    </div>
  );
}
