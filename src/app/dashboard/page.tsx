import type { Metadata } from "next";
import Link from "next/link";

import { PrivateDataStatus } from "@/components/private-data-status";
import {
  ApplicationRowNote,
  DashboardActionList,
  DashboardDecisionTools,
  DashboardSectionStatus,
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
import { getDashboardActions } from "@/lib/career/dashboard-actions";
import { syncNotifications } from "@/lib/career/notification-sync";
import { readUnreadNotificationCount } from "@/lib/career/notifications";
import type { RepositoryReadState } from "@/lib/data/repository-result";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false, nocache: true },
};

const READ_STATE_SEVERITY: Record<RepositoryReadState, number> = {
  ready: 0,
  degraded: 1,
  invalid: 2,
  unavailable: 3,
  unconfigured: 4,
};

function weakestPrivateState(
  left: RepositoryReadState,
  right: RepositoryReadState,
): RepositoryReadState {
  return READ_STATE_SEVERITY[right] > READ_STATE_SEVERITY[left] ? right : left;
}

function unavailableCaption(
  state: RepositoryReadState,
  subject: string,
): string {
  if (state === "degraded") {
    return `Some ${subject} could not be verified; no total is shown`;
  }
  if (state === "unconfigured") {
    return `Private ${subject} are not configured in this environment`;
  }
  return `Private ${subject} could not be loaded`;
}

export default async function DashboardPage() {
  await requireViewer("/dashboard");
  const [summary, cv] = await Promise.all([
    getDashboardSummary(),
    getCurrentCandidateCv(),
  ]);
  // Recording runs from the same summary the page renders, so the badge and
  // the page can never disagree about what is due.
  await syncNotifications(summary);
  const profile = summary.profile.data;
  const completenessPercent = profile
    ? Math.round(profile.completeness * 100)
    : null;
  const statedFieldCount = profile
    ? MATCHING_FIELD_COUNT - profile.missingFields.length
    : null;
  const cvSkillCount =
    cv.state === "ready" &&
    cv.data?.parse_state === "parsed" &&
    cv.data.extracted_text
      ? readCvSkills(cv.data.extracted_text).length
      : cv.state === "ready" &&
          (cv.data === null || cv.data?.parse_state === "parsed")
        ? 0
        : null;
  const showsFirstRun =
    summary.isFirstRun && cv.state === "ready" && cv.data === null;
  const actions = getDashboardActions(summary);
  const privateDataState = weakestPrivateState(summary.state, cv.state);

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
        {privateDataState !== "ready" ? (
          <PrivateDataStatus state={privateDataState} />
        ) : null}

        {showsFirstRun ? (
          <FirstRunGuide
            profileExists={summary.profile.data?.exists ?? false}
          />
        ) : (
          <>
            <DashboardActionList
              actions={actions}
              incomplete={summary.state !== "ready"}
            />
            <section className="workspace-stats" aria-label="Your activity">
              <WorkspaceStat
                value={summary.savedJobs.data?.count ?? "Not shown"}
                label="Saved jobs"
                caption={
                  summary.savedJobs.data
                    ? "Roles you kept to review"
                    : unavailableCaption(summary.savedJobs.state, "saved jobs")
                }
                href="/saved"
              />
              <WorkspaceStat
                value={summary.applications.data?.activeCount ?? "Not shown"}
                label="Live applications"
                caption={
                  summary.applications.data
                    ? "Applied, assessment, interview or offer"
                    : unavailableCaption(
                        summary.applications.state,
                        "applications",
                      )
                }
                href="/applications"
              />
              <WorkspaceStat
                value={summary.alerts.data?.activeCount ?? "Not shown"}
                label="Active alerts"
                caption={
                  summary.alerts.data
                    ? "Email alerts currently running"
                    : unavailableCaption(summary.alerts.state, "job alerts")
                }
                href="/alerts"
              />
              <WorkspaceStat
                value={
                  completenessPercent === null
                    ? "Not shown"
                    : `${completenessPercent}%`
                }
                label="Profile strength"
                caption={
                  statedFieldCount === null
                    ? unavailableCaption(summary.profile.state, "profile data")
                    : `${statedFieldCount} of ${MATCHING_FIELD_COUNT} fields that improve your matches`
                }
                href="/account/candidate-profile"
              />
              {/* A count of what a CV was read to name, never a score for the
                  CV itself. Zero is a real answer — no stored CV, or one with
                  no text layer — so the tile links to the place that says so. */}
              <WorkspaceStat
                value={
                  cv.state !== "ready"
                    ? "Not shown"
                    : cv.data?.parse_state === "unreadable"
                      ? "Unreadable"
                      : (cvSkillCount ?? 0)
                }
                label="Skills read from your CV"
                caption={
                  cv.state !== "ready"
                    ? unavailableCaption(cv.state, "CV records")
                    : cv.data === null
                      ? "No CV stored yet"
                      : cv.data.parse_state === "unreadable"
                        ? "The stored file has no readable text layer"
                        : cvSkillCount === 0
                          ? "No named skills were read from this CV"
                          : "Compared against what each posting names"
                }
                href={
                  cvSkillCount !== null && cvSkillCount > 0
                    ? "/matches"
                    : "/account/candidate-profile"
                }
              />
            </section>

            {summary.applications.data &&
            summary.applications.data.upcomingActions.length > 0 ? (
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
                {summary.applications.data.overdueActionCount > 0 ? (
                  <div className="notice notice-warning" role="status">
                    <strong>
                      {summary.applications.data.overdueActionCount === 1
                        ? "One action is past its date."
                        : `${summary.applications.data.overdueActionCount} actions are past their dates.`}
                    </strong>{" "}
                    Move the date on, or update the status if the process has
                    ended.
                  </div>
                ) : null}
                <DeadlineList
                  deadlines={summary.applications.data.upcomingActions}
                />
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
                {summary.applications.state !== "ready" ? (
                  <DashboardSectionStatus
                    state={summary.applications.state}
                    title="Applications"
                  />
                ) : summary.applications.data.active.length === 0 ? (
                  <div className="empty-state">
                    <p className="m-0">
                      Nothing in flight yet. When you apply for a role, track it
                      here so nothing slips.
                    </p>
                  </div>
                ) : (
                  <>
                    {summary.applications.data.pipeline.length > 1 ? (
                      <PipelineSummary
                        pipeline={summary.applications.data.pipeline}
                      />
                    ) : null}
                    <ul className="private-list">
                      {summary.applications.data.active.map((application) => (
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
                    {summary.applications.data.stalledApplicationCount > 0 ? (
                      <p className="field-help m-0">
                        {summary.applications.data.stalledApplicationCount === 1
                          ? "One live application has not changed in over two weeks."
                          : `${summary.applications.data.stalledApplicationCount} live applications have not changed in over two weeks.`}{" "}
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
                {summary.savedJobs.state !== "ready" ? (
                  <DashboardSectionStatus
                    state={summary.savedJobs.state}
                    title="Saved jobs"
                  />
                ) : summary.savedJobs.data.recent.length === 0 ? (
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
                    {summary.savedJobs.data.recent.map((job) => (
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

            {summary.profile.state !== "ready" ? (
              <section className="surface surface-pad stack">
                <h2 className="section-title">Career profile</h2>
                <DashboardSectionStatus
                  state={summary.profile.state}
                  title="Profile details"
                />
              </section>
            ) : summary.profile.data.missingFields.length > 0 ? (
              <section className="surface surface-pad stack">
                <h2 className="section-title">Strengthen your profile</h2>
                <p className="text-muted m-0">
                  {summary.profile.data.exists
                    ? "A fuller profile makes your matches more accurate. Everything here is your own claim about yourself, and you can change or delete it at any time."
                    : "You have not created a career profile yet. It stays private to your account and is your own claim about yourself, never presented as verified."}
                </p>
                <div className="stack">
                  <p className="source-note m-0">
                    {summary.profile.data.missingFields.length === 1
                      ? "Still to state:"
                      : `Still to state (${summary.profile.data.missingFields.length}):`}
                  </p>
                  <ul className="cluster missing-field-list">
                    {summary.profile.data.missingFields.map((field) => (
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
                  {summary.profile.data.exists
                    ? "Update profile"
                    : "Create profile"}
                </Link>
              </section>
            ) : null}
          </>
        )}

        <DashboardDecisionTools summary={summary} />
      </WorkspaceShell>
    </div>
  );
}
