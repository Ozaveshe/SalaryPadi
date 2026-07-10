import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { requireViewer } from "@/lib/auth/dal";
import { getApplications } from "@/lib/career/repository";
import { formatDate, formatEnum } from "@/lib/format";

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

export default async function ApplicationsPage() {
  await requireViewer("/applications");
  const applications = await getApplications();
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Private workspace"
        title="Application tracker"
        description="Keep the next action visible without sharing private notes with employers or analytics."
      />
      {applications.length > 0 ? (
        <div className="stack">
          {applications.map((application) => (
            <article className="surface surface-pad stack" key={application.id}>
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
              <form action="/api/applications/remove" method="post">
                <input type="hidden" name="id" value={application.id} />
                <button className="button button-quiet" type="submit">
                  Remove record
                </button>
              </form>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2 className="section-title">No applications tracked yet</h2>
          <p>Open a job and choose “I applied” to create a private record.</p>
          <Link className="button w-fit" href="/jobs">
            Search jobs
          </Link>
        </div>
      )}
    </div>
  );
}
