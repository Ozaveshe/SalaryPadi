import type { Metadata } from "next";
import Link from "next/link";

import { PrivateDataStatus } from "@/components/private-data-status";
import {
  WorkspaceShell,
  WorkspaceStat,
} from "@/components/workspace/workspace-shell";
import { requireViewer } from "@/lib/auth/dal";
import { getDashboardSummary } from "@/lib/career/dashboard";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardPage() {
  await requireViewer("/dashboard");
  const summary = await getDashboardSummary();
  const completenessPercent = Math.round(summary.profile.completeness * 100);

  return (
    <div className="site-shell">
      <WorkspaceShell
        current="/dashboard"
        title="Overview"
        description="Everything you are tracking, in one place. These records are private to your account and never appear on public pages."
        actions={
          <Link className="button" href="/jobs">
            Find jobs
          </Link>
        }
      >
        {summary.state !== "ready" ? (
          <PrivateDataStatus state={summary.state} />
        ) : null}

        <section className="workspace-stats" aria-label="Your activity">
          <WorkspaceStat
            value={summary.savedJobCount}
            label="Saved jobs"
            caption="Roles you kept to review"
            href="/saved"
          />
          <WorkspaceStat
            value={summary.activeApplicationCount}
            label="Live applications"
            caption="Applied, assessment, interview or offer"
            href="/applications"
          />
          <WorkspaceStat
            value={summary.activeAlertCount}
            label="Active alerts"
            caption="Email alerts currently running"
            href="/alerts"
          />
          <WorkspaceStat
            value={`${completenessPercent}%`}
            label="Profile strength"
            caption="Fields that improve your matches"
            href="/account/candidate-profile"
          />
        </section>

        {summary.nextAction ? (
          <section className="surface surface-pad stack" aria-label="Next step">
            <h2 className="section-title">Your next step</h2>
            <p className="m-0">
              <Link
                className="text-link"
                href={`/jobs/${summary.nextAction.jobSlug}`}
              >
                {summary.nextAction.title}
              </Link>{" "}
              is due <strong>{formatDate(summary.nextAction.dueAt)}</strong>.
            </p>
            <p className="source-note m-0">
              You set this date yourself on the application record.
            </p>
          </section>
        ) : null}

        <div className="workspace-columns">
          <section className="surface surface-pad stack">
            <div className="split">
              <h2 className="section-title">Live applications</h2>
              <Link className="text-link" href="/applications">
                View all
              </Link>
            </div>
            {summary.activeApplications.length === 0 ? (
              <div className="empty-state">
                <p className="m-0">
                  Nothing in flight yet. When you apply for a role, track it
                  here so nothing slips.
                </p>
              </div>
            ) : (
              <ul className="private-list">
                {summary.activeApplications.map((application) => (
                  <li className="private-row" key={application.jobSlug}>
                    <div className="stack">
                      <Link
                        className="text-link"
                        href={`/jobs/${application.jobSlug}`}
                      >
                        {application.title}
                      </Link>
                      <p className="source-note m-0">
                        {application.companyName} · updated{" "}
                        {formatDate(application.updatedAt)}
                      </p>
                    </div>
                    <span className="status status-neutral">
                      {formatEnum(application.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface surface-pad stack">
            <div className="split">
              <h2 className="section-title">Recently saved</h2>
              <Link className="text-link" href="/saved">
                View all
              </Link>
            </div>
            {summary.recentSaved.length === 0 ? (
              <div className="empty-state">
                <p className="m-0">
                  No saved jobs yet.{" "}
                  <Link className="text-link" href="/jobs">
                    Browse roles open to Nigeria
                  </Link>{" "}
                  and save the ones worth a second look.
                </p>
              </div>
            ) : (
              <ul className="private-list">
                {summary.recentSaved.map((job) => (
                  <li className="private-row" key={job.jobSlug}>
                    <div className="stack">
                      <Link className="text-link" href={`/jobs/${job.jobSlug}`}>
                        {job.title}
                      </Link>
                      <p className="source-note m-0">
                        {job.companyName} · saved {formatDate(job.savedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {summary.profile.completeness < 1 ? (
          <section className="surface surface-pad stack">
            <h2 className="section-title">Strengthen your profile</h2>
            <p className="text-muted m-0">
              {summary.profile.exists
                ? "A fuller profile makes your matches more accurate. Everything here is your own claim about yourself, and you can change or delete it at any time."
                : "You have not created a career profile yet. It stays private to your account and is your own claim about yourself, never presented as verified."}
            </p>
            <Link className="button w-fit" href="/account/candidate-profile">
              {summary.profile.exists ? "Update profile" : "Create profile"}
            </Link>
          </section>
        ) : null}
      </WorkspaceShell>
    </div>
  );
}
