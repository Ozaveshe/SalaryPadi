import type { Metadata } from "next";
import Link from "next/link";

import { BrandArt } from "@/components/media/brand-art";
import { CompanyEvidenceInvitation } from "@/components/companies/company-evidence-invitation";
import { PrivateDataStatus } from "@/components/private-data-status";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireViewer } from "@/lib/auth/dal";
import { readUnreadNotificationCount } from "@/lib/career/notifications";
import { getCandidateCvs } from "@/lib/career/cv/repository";
import { isStaleApplication } from "@/lib/career/pipeline";
import { getApplications } from "@/lib/career/repository";
import { formatDate, formatEnum } from "@/lib/format";
import { sliceSearchParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Application tracker",
  robots: { index: false, follow: false, nocache: true },
};

const statuses = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireViewer("/applications");
  const input = await searchParams;
  const removed = sliceSearchParam(input.removed, 10);
  const created = sliceSearchParam(input.created, 10);
  const salaryCompany = sliceSearchParam(input.salary_company, 180);
  const salaryRole = sliceSearchParam(input.salary_role, 160);
  const cvAttached = sliceSearchParam(input.cv_attached, 10);
  const [result, cvs] = await Promise.all([
    getApplications(),
    getCandidateCvs(),
  ]);
  const applications = result.data;
  return (
    <div className="site-shell">
      <WorkspaceShell
        unreadNotifications={await readUnreadNotificationCount()}
        current="/applications"
        title="Application tracker"
        description="Keep the next action visible without sharing private notes with employers or analytics."
        actions={
          <Link className="button" href="/jobs">
            Find jobs
          </Link>
        }
      >
        {removed === "true" ? (
          <div className="notice" role="status">
            Application record removed.
          </div>
        ) : removed === "error" ? (
          <div className="notice notice-danger" role="alert">
            The application record could not be removed. Reload and try again.
          </div>
        ) : null}
        {created === "true" ? (
          <div className="notice" role="status">
            Application added to your private tracker.
          </div>
        ) : created === "error" ? (
          <div className="notice notice-danger" role="alert">
            The application could not be tracked. Try again.
          </div>
        ) : null}
        {cvAttached === "true" ? (
          <div className="notice" role="status">
            The CV recorded against this application was updated.
          </div>
        ) : cvAttached === "error" ? (
          <div className="notice notice-danger" role="alert">
            The CV could not be recorded against this application. Try again.
          </div>
        ) : null}
        {created === "true" ? (
          <SalaryContributionCta
            company={salaryCompany}
            role={salaryRole}
            heading="Application tracked. Help the next applicant compare pay."
          />
        ) : null}
        {result.state !== "ready" ? (
          <PrivateDataStatus state={result.state} />
        ) : applications.length > 0 ? (
          <div className="stack">
            {applications.map((application) => (
              <article
                className="surface surface-pad stack"
                key={application.id}
              >
                <div className="split">
                  <div>
                    <h2 className="m-0 text-xl font-bold">
                      <Link href={`/jobs/${application.job_slug}`}>
                        {application.title}
                      </Link>
                    </h2>
                    <p className="text-muted m-0 text-sm">
                      {application.company_name} · updated{" "}
                      {formatDate(application.updated_at)}
                    </p>
                  </div>
                  <span className="status status-neutral">
                    {formatEnum(application.status)}
                  </span>
                </div>
                <form
                  className="application-form"
                  action="/api/applications/status"
                  method="post"
                >
                  <input type="hidden" name="id" value={application.id} />
                  <div className="field">
                    <label htmlFor={`status-${application.id}`}>Status</label>
                    <select
                      className="select"
                      id={`status-${application.id}`}
                      name="status"
                      defaultValue={application.status}
                    >
                      {statuses.map((status) => (
                        <option value={status} key={status}>
                          {formatEnum(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`next-${application.id}`}>
                      Next-action date
                    </label>
                    <input
                      className="input"
                      id={`next-${application.id}`}
                      name="next_action_at"
                      type="date"
                      defaultValue={application.next_action_at?.slice(0, 10)}
                    />
                  </div>
                  <div className="field application-notes">
                    <label htmlFor={`notes-${application.id}`}>
                      Private notes
                    </label>
                    <textarea
                      className="textarea"
                      id={`notes-${application.id}`}
                      name="private_notes"
                      maxLength={2000}
                      defaultValue={application.private_notes ?? ""}
                    />
                  </div>
                  <button className="button w-fit" type="submit">
                    Update
                  </button>
                </form>
                {cvs.data.length > 0 ? (
                  <form
                    action="/api/applications/cv"
                    className="cluster"
                    method="post"
                  >
                    <input type="hidden" name="id" value={application.id} />
                    <div className="field">
                      <label htmlFor={`cv-${application.id}`}>
                        CV you sent
                      </label>
                      <select
                        className="select"
                        defaultValue={application.cv_id ?? ""}
                        id={`cv-${application.id}`}
                        name="cv_id"
                      >
                        <option value="">Not recorded</option>
                        {cvs.data.map((cv) => (
                          <option key={cv.id} value={cv.id}>
                            {cv.file_name}
                            {cv.is_current ? " (current)" : ""}
                          </option>
                        ))}
                      </select>
                      <p className="field-help">
                        Your own record of which version went out. SalaryPadi
                        never sends it anywhere.
                      </p>
                    </div>
                    <button className="button button-secondary" type="submit">
                      Save CV
                    </button>
                  </form>
                ) : null}
                <form action="/api/applications/remove" method="post">
                  <input type="hidden" name="id" value={application.id} />
                  <button className="button button-quiet" type="submit">
                    Remove record
                  </button>
                </form>
                {application.status === "interview" ||
                application.status === "offer" ? (
                  <CompanyEvidenceInvitation
                    kind={application.status}
                    company={application.company_name}
                    role={application.title}
                  />
                ) : application.status === "applied" &&
                  isStaleApplication(application.updated_at) ? (
                  <CompanyEvidenceInvitation
                    kind="application"
                    company={application.company_name}
                    role={application.title}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BrandArt id="empty-applications" />
            <h2 className="section-title">No applications tracked yet</h2>
            <p>Open a job and choose “I applied” to create a private record.</p>
            <Link className="button w-fit" href="/jobs">
              Search jobs
            </Link>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
