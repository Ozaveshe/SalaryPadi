import type { Metadata } from "next";
import Link from "next/link";

import { MfaPanel } from "@/components/auth/mfa-panel";
import { BackendNotice } from "@/components/backend-notice";
import { CommunityIdentityFields } from "@/components/community/community-fields";
import { PageHeading } from "@/components/page-heading";
import { PrivateDataStatus } from "@/components/private-data-status";
import { requireViewer } from "@/lib/auth/dal";
import { getCommunityAccountData } from "@/lib/community/repository";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; auth?: string }>;
}) {
  const viewer = await requireViewer("/account");
  const { profile: profileStatus, auth: authStatus } = await searchParams;
  const profileResult = await getCommunityAccountData();
  const { profile, states } = profileResult.data;

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Private workspace"
        title="My account"
        description="Manage the identity, alerts and security controls attached to your SalaryPadi account. Your email and private career records are never shown on community posts."
      />

      {authStatus === "sign-out-error" ? (
        <div className="notice notice-danger" role="alert">
          Sign-out could not be confirmed. Your session may still be active; try
          again before leaving this device.
        </div>
      ) : null}

      {profileStatus === "updated" ? (
        <div className="notice" role="status">
          Community identity updated.
        </div>
      ) : profileStatus === "error" ? (
        <div className="notice notice-danger" role="alert">
          The community identity could not be updated. Check the fields and try
          again.
        </div>
      ) : null}

      <nav
        className="surface surface-pad stack"
        aria-label="Private career workspace"
      >
        <h2 className="section-title">My career</h2>
        <p className="text-muted m-0">
          Open the private records and email alerts tied to this account.
        </p>
        <div className="cluster">
          <Link className="button button-secondary" href="/saved">
            Saved jobs
          </Link>
          <Link className="button button-secondary" href="/applications">
            Applications
          </Link>
          <Link className="button button-secondary" href="/alerts">
            Job alerts
          </Link>
        </div>
      </nav>

      <section
        className="surface surface-pad stack-lg"
        aria-labelledby="identity-heading"
      >
        <div className="stack">
          <h2 className="section-title" id="identity-heading">
            Account and community identity
          </h2>
          <p className="m-0">
            <strong>Sign-in email:</strong>{" "}
            {viewer.email ?? "Email unavailable for this session"}
          </p>
          <p className="text-muted m-0 text-sm">
            The email is private. Community posts use the public name and random
            handle below.
          </p>
        </div>

        {profileResult.state === "unconfigured" ? (
          <BackendNotice />
        ) : profileResult.state !== "ready" ? (
          <PrivateDataStatus state={profileResult.state} />
        ) : (
          <form
            className="stack-lg"
            action="/api/account/community-profile"
            method="post"
          >
            <div className="notice" role="status">
              <strong>Public handle:</strong>{" "}
              {profile ? (
                <span>@{profile.handle}</span>
              ) : (
                <span>
                  Not created yet. SalaryPadi assigns a random handle when you
                  save this profile.
                </span>
              )}
            </div>
            <CommunityIdentityFields
              idPrefix="account"
              profile={profile}
              states={states}
            />
            <p className="field-help m-0">
              Saving changes the public identity shown on existing and future
              community posts. It never exposes your sign-in email.
            </p>
            <button className="button w-fit" type="submit">
              Save community identity
            </button>
          </form>
        )}
      </section>

      <section className="stack-lg" aria-labelledby="security-heading">
        <div className="stack">
          <div className="split">
            <h2 className="section-title" id="security-heading">
              Multi-factor authentication
            </h2>
            <span className="status status-neutral">
              {viewer.aal === "aal2"
                ? "Strong session (AAL2)"
                : "Standard session (AAL1)"}
            </span>
          </div>
          <p className="text-muted m-0">
            Add or verify an authenticator app for stronger protection. The
            panel checks the current factor status directly with the
            authentication service.
          </p>
        </div>
        <MfaPanel returnTo="/account" variant="account" />
      </section>

      <section
        className="surface surface-pad stack"
        aria-labelledby="privacy-heading"
      >
        <h2 className="section-title" id="privacy-heading">
          Privacy and session
        </h2>
        <p className="text-muted m-0">
          Data exports and account deletion stay in the reviewed privacy request
          flow.
        </p>
        <div className="cluster">
          <Link className="button button-secondary" href="/privacy/requests">
            Export or delete account data
          </Link>
          <form action="/api/auth/sign-out" method="post">
            <button className="button button-quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
