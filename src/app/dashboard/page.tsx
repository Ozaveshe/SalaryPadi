import type { Metadata } from "next";
import Link from "next/link";

import { PrivateDataStatus } from "@/components/private-data-status";
import {
  ApplicationRowNote,
  DeadlineList,
  FirstRunGuide,
  PipelineSummary,
} from "@/components/workspace/dashboard-signals";
import {
  WorkspaceShell,
  WorkspaceStat,
} from "@/components/workspace/workspace-shell";
import { requireViewer } from "@/lib/auth/dal";
import { readCvSkills } from "@/lib/career/cv/draft";
import { getCurrentCandidateCv } from "@/lib/career/cv/repository";
import {
  getDashboardSummary,
  MATCHING_FIELD_COUNT,
} from "@/lib/career/dashboard";
import { syncNotifications } from "@/lib/career/notification-sync";
import { readUnreadNotificationCount } from "@/lib/career/notifications";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardPage() {
  await requireViewer("/dashboard");
  const summary = await getDashboardSummary();
  // Recording runs from the same summary the page renders, so the badge and
  // the page can never disagree about what is due.
  await syncNotifications(summary);
  const cv = await getCurrentCandidateCv();
  const completenessPercent = Math.round(summary.profile.completeness * 100);
  const statedFieldCount =
    MATCHING_FIELD_COUNT - summary.profile.missingFields.length;
  const cvSkillCount =
    cv.data?.parse_state === "parsed" && cv.data.extracted_text
      ? readCvSkills(cv.data.extracted_text).length
      : 0;

  return (
    <div className="site-shell">
      <WorkspaceShell
        unreadNotifications={await readUnreadNotificationCount()}
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

        {summary.isFirstRun ? (
          <FirstRunGuide profileExists={summary.profile.exists} />
        ) : (
          <>
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
                caption={`${statedFieldCount} of ${MATCHING_FIELD_COUNT} fields that improve your matches`}
                href="/account/candidate-profile"
              />
              {/* A count of what a CV was read to name, never a score for the
                  CV itself. Zero is a real answer — no stored CV, or one with
                  no text layer — so the tile links to the place that says so. */}
              <WorkspaceStat
                value={cvSkillCount}
                label="Skills read from your CV"
                caption={
                  cv.data === null
                    ? "No CV stored yet"
                    : cvSkillCount === 0
                      ? "Your stored CV could not be read"
                      : "Compared against what each posting names"
                }
                href={
                  cvSkillCount > 0 ? "/matches" : "/account/candidate-profile"
                }
              />
            </section>

            {summary.upcomingActions.length > 0 ? (
              <section
                className="surface surface-pad stack"
                aria-label="Scheduled actions"
              >
                <div className="split">
                  <h2 className="section-title">What is due</h2>
                  <Link className="text-link" href="/applications">
                    Change these dates
                  </Link>
                </div>
                {summary.overdueActionCount > 0 ? (
                  <div className="notice notice-warning" role="status">
                    <strong>
                      {summary.overdueActionCount === 1
                        ? "One action is past its date."
                        : `${summary.overdueActionCount} actions are past their dates.`}
                    </strong>{" "}
                    Move the date on, or update the status if the process has
                    ended.
                  </div>
                ) : null}
                <DeadlineList deadlines={summary.upcomingActions} />
                <p className="source-note m-0">
                  You set these dates yourself on the application records.
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
                  <>
                    {summary.pipeline.length > 1 ? (
                      <PipelineSummary pipeline={summary.pipeline} />
                    ) : null}
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
                            <ApplicationRowNote application={application} />
                          </div>
                          <span
                            className={
                              application.stalled
                                ? "status status-warning"
                                : "status status-neutral"
                            }
                          >
                            {formatEnum(application.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {summary.stalledApplicationCount > 0 ? (
                      <p className="field-help m-0">
                        {summary.stalledApplicationCount === 1
                          ? "One live application has not changed in over two weeks."
                          : `${summary.stalledApplicationCount} live applications have not changed in over two weeks.`}{" "}
                        If a process has ended, updating the status keeps this
                        count honest.
                      </p>
                    ) : null}
                  </>
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
                          <Link
                            className="text-link"
                            href={`/jobs/${job.jobSlug}`}
                          >
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

            {summary.profile.missingFields.length > 0 ? (
              <section className="surface surface-pad stack">
                <h2 className="section-title">Strengthen your profile</h2>
                <p className="text-muted m-0">
                  {summary.profile.exists
                    ? "A fuller profile makes your matches more accurate. Everything here is your own claim about yourself, and you can change or delete it at any time."
                    : "You have not created a career profile yet. It stays private to your account and is your own claim about yourself, never presented as verified."}
                </p>
                <div className="stack">
                  <p className="source-note m-0">
                    {summary.profile.missingFields.length === 1
                      ? "Still to state:"
                      : `Still to state (${summary.profile.missingFields.length}):`}
                  </p>
                  <ul className="cluster missing-field-list">
                    {summary.profile.missingFields.map((field) => (
                      <li className="status status-neutral" key={field}>
                        {field}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  className="button w-fit"
                  href="/account/candidate-profile"
                >
                  {summary.profile.exists ? "Update profile" : "Create profile"}
                </Link>
              </section>
            ) : null}
          </>
        )}
      </WorkspaceShell>
    </div>
  );
}
