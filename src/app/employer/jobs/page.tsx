import type { Metadata } from "next";
import Link from "next/link";
import { PrivateDataStatus } from "@/components/private-data-status";
import { requireViewer } from "@/lib/auth/dal";
import { getMyEmployerJobSubmissions } from "@/lib/employers/job-management";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "My employer listings",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EmployerJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  await requireViewer("/employer/jobs");
  const { closed } = await searchParams;
  const submissions = await getMyEmployerJobSubmissions();
  return (
    <div className="reading-shell stack-lg">
      <header className="stack">
        <p className="eyebrow">Employer workspace</p>
        <h1 className="page-title">Your job submissions</h1>
        <p className="text-muted m-0">
          Follow moderation status, open a published listing, or close a role
          once hiring ends. Closing removes the vacancy from public search and
          cannot republish it without a new moderation review.
        </p>
        <div className="cluster">
          <Link className="button" href="/post-a-job">
            Submit another job
          </Link>
          <Link className="button button-secondary" href="/for-employers">
            Employer options
          </Link>
        </div>
      </header>
      {closed === "true" ? (
        <div className="notice" role="status">
          The listing was closed and removed from public job search.
        </div>
      ) : closed === "error" ? (
        <div className="notice notice-danger" role="alert">
          The listing could not be closed. It may already be closed or no longer
          belong to this account.
        </div>
      ) : null}
      {submissions.state !== "ready" ? (
        <PrivateDataStatus state={submissions.state} />
      ) : submissions.data.length === 0 ? (
        <div className="surface surface-pad stack">
          <h2 className="section-title">No submissions yet</h2>
          <p className="m-0">
            Your moderated employer submissions will appear here.
          </p>
        </div>
      ) : (
        <div className="stack">
          {submissions.data.map((submission) => (
            <article className="surface surface-pad stack" key={submission.id}>
              <div className="cluster cluster-between">
                <div>
                  <h2 className="section-title">{submission.title}</h2>
                  <p className="text-muted m-0">{submission.company_name}</p>
                </div>
                <span className="status-badge">
                  {formatEnum(submission.status)}
                </span>
              </div>
              <p className="field-help m-0">
                Submitted {formatDate(submission.submitted_at)} · last updated{" "}
                {formatDate(submission.updated_at)}
              </p>
              {submission.public_job_slug ? (
                <div className="stack">
                  <Link
                    className="button button-secondary w-fit"
                    href={`/jobs/${submission.public_job_slug}`}
                  >
                    View public listing
                  </Link>
                  <form
                    className="stack"
                    action="/api/employer/jobs/close"
                    method="post"
                  >
                    <input
                      name="submission_id"
                      type="hidden"
                      value={submission.id}
                    />
                    <label
                      className="field"
                      htmlFor={`reason-${submission.id}`}
                    >
                      <span>Why is this role closing?</span>
                      <input
                        className="input"
                        id={`reason-${submission.id}`}
                        maxLength={500}
                        minLength={10}
                        name="reason"
                        placeholder="For example: the position has been filled"
                        required
                      />
                    </label>
                    <button className="button w-fit" type="submit">
                      Close listing
                    </button>
                  </form>
                </div>
              ) : (
                <p className="m-0">
                  {submission.status === "approved"
                    ? "The approved public listing is no longer open."
                    : "This submission is not public. Moderation must approve it first."}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
