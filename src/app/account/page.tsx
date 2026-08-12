import type { Metadata } from "next";
import Link from "next/link";

import { MfaPanel } from "@/components/auth/mfa-panel";
import { BackendNotice } from "@/components/backend-notice";
import { CommunityIdentityFields } from "@/components/community/community-fields";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { PrivateDataStatus } from "@/components/private-data-status";
import { requireViewer } from "@/lib/auth/dal";
import { readUnreadNotificationCount } from "@/lib/career/notifications";
import { getCommunityAccountData } from "@/lib/community/repository";
import {
  getWorkspaceRetention,
  WORKSPACE_RETENTION_OPTIONS,
} from "@/lib/privacy/workspace-retention";
import { SALARYPADI_TIME_ZONE } from "@/lib/time/zone";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    profile?: string;
    auth?: string;
    retention?: string;
  }>;
}) {
  const viewer = await requireViewer("/account");
  const {
    profile: profileStatus,
    auth: authStatus,
    retention: retentionStatus,
  } = await searchParams;
  const [profileResult, retentionResult] = await Promise.all([
    getCommunityAccountData(),
    getWorkspaceRetention(),
  ]);
  const { profile, states } = profileResult.data;
  const retention = retentionResult.data;

  return (
    <div className="site-shell">
      <WorkspaceShell
        unreadNotifications={await readUnreadNotificationCount()}
        current="/account"
        title="My account"
        description="Manage the identity, alerts and security controls attached to your SalaryPadi account. Your email and private career records are never shown on community posts."
      >
        {authStatus === "sign-out-error" ? (
          <div className="notice notice-danger" role="alert">
            Sign-out could not be confirmed. Your session may still be active;
            try again before leaving this device.
          </div>
        ) : null}

        {profileStatus === "updated" ? (
          <div className="notice" role="status">
            Community identity updated.
          </div>
        ) : profileStatus === "error" ? (
          <div className="notice notice-danger" role="alert">
            The community identity could not be updated. Check the fields and
            try again.
          </div>
        ) : null}

        {retentionStatus === "saved" ? (
          <div className="notice" role="status">
            Workspace retention preference saved.
          </div>
        ) : retentionStatus === "error" ? (
          <div className="notice notice-danger" role="alert">
            The retention preference could not be saved. Nothing was deleted;
            check the selection and try again.
          </div>
        ) : null}

        {/* The private records used to be listed here because the account page
            was the only way back to them. The workspace navigation now carries
            them on every view, and repeating the same four links inside the
            page only gives the same destination two different names. */}
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
              The email is private. Community posts use the public name and
              random handle below.
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

        <section
          className="surface surface-pad stack-lg"
          aria-labelledby="retention-heading"
        >
          <div className="stack">
            <h2 className="section-title" id="retention-heading">
              Workspace retention
            </h2>
            <p className="text-muted m-0">
              Choose how long SalaryPadi keeps your saved jobs, application
              records and job alerts. Application status history is deleted with
              its application.
            </p>
            <p className="field-help m-0">
              This setting does not cover CV files, salary or interview
              contributions, moderation evidence, account data or public
              aggregates. Use the reviewed privacy request flow below for those
              records.
            </p>
          </div>

          {retentionResult.state !== "ready" ? (
            <PrivateDataStatus state={retentionResult.state} />
          ) : (
            <form
              className="stack-lg"
              action="/api/account/workspace-retention"
              method="post"
            >
              <fieldset className="stack">
                <legend className="field-label">Retention preference</legend>
                {WORKSPACE_RETENTION_OPTIONS.map((option) => (
                  <label className="checkbox" key={option.value}>
                    <input
                      defaultChecked={retention.policy === option.value}
                      name="policy"
                      type="radio"
                      value={option.value}
                    />
                    <span className="stack-sm">
                      <strong>{option.label}</strong>
                      <span className="field-help">{option.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {retention.policy !== "manual" ? (
                <div className="notice" role="status">
                  <strong>30-day safety window.</strong> No timed deletion can
                  happen before{" "}
                  <time dateTime={retention.graceUntil ?? undefined}>
                    {retention.graceUntil
                      ? new Intl.DateTimeFormat("en-NG", {
                          dateStyle: "long",
                          timeZone: SALARYPADI_TIME_ZONE,
                        }).format(new Date(retention.graceUntil))
                      : "the grace period ends"}
                  </time>
                  . {retention.affectedRecords} current workspace record
                  {retention.affectedRecords === 1 ? " is" : "s are"} covered by
                  this preference.
                  {retention.nextDeletionAt ? (
                    <>
                      {" "}
                      The earliest eligible deletion is{" "}
                      <time dateTime={retention.nextDeletionAt}>
                        {new Intl.DateTimeFormat("en-NG", {
                          dateStyle: "long",
                          timeZone: SALARYPADI_TIME_ZONE,
                        }).format(new Date(retention.nextDeletionAt))}
                      </time>
                      .
                    </>
                  ) : null}
                </div>
              ) : null}

              <p className="field-help m-0">
                Changing to a timed option starts a fresh 30-day grace period.
                SalaryPadi also creates an in-app warning before the first
                eligible deletion. You can return to manual retention at any
                time before deletion.
              </p>
              <button className="button w-fit" type="submit">
                Save retention preference
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
            Data exports and account deletion stay in the reviewed privacy
            request flow.
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
      </WorkspaceShell>
    </div>
  );
}
