import Link from "next/link";

import type { AdminJobSearchRow } from "@/lib/admin/jobs";
import { formatDate, formatEnum } from "@/lib/format";

export function AdminJobSearchResults({
  rows,
  query,
  status,
  canTransition,
}: {
  rows: AdminJobSearchRow[];
  query: string;
  status: string | null;
  canTransition: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <h2 className="section-title">No matching jobs</h2>
        <p>
          The connected backend returned no jobs for this search. Try an exact
          UUID, slug or external source ID, or clear the status filter.
        </p>
      </div>
    );
  }

  return (
    <section className="stack" aria-labelledby="job-results-heading">
      <div>
        <p className="eyebrow">Protected inventory</p>
        <h2 className="section-title" id="job-results-heading">
          {rows.length} {rows.length === 1 ? "job" : "jobs"}
        </h2>
        <p className="text-muted">
          {query ? `Search: “${query}”. ` : "Most recently updated. "}
          {status ? `Status: ${formatEnum(status)}. ` : "Any status. "}
          {canTransition
            ? "Open a record to review evidence and take an admin action."
            : "Your data-quality role is read-only for job status changes."}
        </p>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Source</th>
              <th>Status</th>
              <th>Reports</th>
              <th>Updated</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                  <span>{row.company_name}</span>
                  <span className="text-muted text-sm">{row.slug}</span>
                </td>
                <td>
                  {row.source_name}
                  <span>{row.source_adapter}</span>
                </td>
                <td>
                  <span className="status status-neutral">
                    {formatEnum(row.status)}
                  </span>
                </td>
                <td>
                  {row.open_report_count > 0 ? (
                    <span className="status status-warning">
                      {row.open_report_count} open
                    </span>
                  ) : (
                    "None open"
                  )}
                </td>
                <td>{formatDate(row.updated_at)}</td>
                <td>
                  <Link
                    className="button button-secondary"
                    href={`/admin/jobs/${row.id}`}
                  >
                    Open evidence
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 50 ? (
        <p className="field-help">
          Showing the first 50 matches. Add an identifier, employer, title or
          source term to narrow the result without relying on recency alone.
        </p>
      ) : null}
    </section>
  );
}
