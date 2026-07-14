import { Suspense } from "react";

import { AdminTransitionNotice } from "@/components/admin/admin-transition-notice";
import { PageHeading } from "@/components/page-heading";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate, formatEnum } from "@/lib/format";
import { getAdminRowsResult, type AdminResource } from "@/lib/admin/repository";

export async function AdminResourcePage({
  resource,
  title,
  description,
  actions,
}: {
  resource: AdminResource;
  title: string;
  description: string;
  actions: string[];
}) {
  await requireAdmin();
  const result = await getAdminRowsResult(resource);
  const rows = result.data;
  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected operations"
        title={title}
        description={description}
      />
      <Suspense fallback={null}>
        <AdminTransitionNotice />
      </Suspense>
      {result.state !== "ready" ? (
        <div className="notice notice-warning" role="status">
          <strong>Administration queue evidence is {result.state}.</strong>{" "}
          {rows.length > 0
            ? "Only validated rows are shown; do not treat this as the complete queue."
            : "No queue contents can be confirmed right now. This is not a clear queue."}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.title}</strong>
                    {row.secondary ? <span>{row.secondary}</span> : null}
                  </td>
                  <td>
                    <span className="status status-neutral">
                      {formatEnum(row.status)}
                    </span>
                  </td>
                  <td>{formatDate(row.updated_at)}</td>
                  <td>
                    {actions.length > 0 ? (
                      <form
                        className="admin-action"
                        action={`/api/admin/${resource}/transition`}
                        method="post"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <input
                          type="hidden"
                          name="expected_version"
                          value={row.version}
                        />
                        <label
                          className="visually-hidden"
                          htmlFor={`action-${row.id}`}
                        >
                          Action for {row.title}
                        </label>
                        <select
                          className="select"
                          id={`action-${row.id}`}
                          name="action"
                          required
                        >
                          <option value="">Choose</option>
                          {actions.map((action) => (
                            <option value={action} key={action}>
                              {formatEnum(action)}
                            </option>
                          ))}
                        </select>
                        <label
                          className="visually-hidden"
                          htmlFor={`reason-${row.id}`}
                        >
                          Reason
                        </label>
                        <input
                          className="input"
                          id={`reason-${row.id}`}
                          name="reason"
                          maxLength={500}
                          placeholder="Required reason"
                          required
                        />
                        {resource === "moderation" ||
                        resource === "employer_responses" ? (
                          <>
                            <label htmlFor={`payload-${row.id}`}>
                              Redacted public fields (JSON; for redact only)
                            </label>
                            <textarea
                              className="textarea admin-payload"
                              id={`payload-${row.id}`}
                              name="public_payload"
                              maxLength={60000}
                              placeholder={
                                resource === "employer_responses"
                                  ? '{"statement":"Redacted employer response"}'
                                  : '{"pros":"Redacted public text"}'
                              }
                            />
                            {resource === "moderation" ? (
                              <>
                                <label htmlFor={`linked-case-${row.id}`}>
                                  Destination case ID (for merge duplicate only)
                                </label>
                                <input
                                  className="input"
                                  id={`linked-case-${row.id}`}
                                  name="linked_case_id"
                                  placeholder="UUID"
                                />
                              </>
                            ) : null}
                          </>
                        ) : null}
                        <button
                          className="button button-secondary"
                          type="submit"
                        >
                          Apply
                        </button>
                      </form>
                    ) : (
                      <span className="text-muted text-sm">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : result.state === "ready" ? (
        <div className="empty-state">
          <h2 className="section-title">Queue is clear</h2>
          <p>
            No rows are available in the connected backend for this operation.
            This is a real empty state, not a fabricated metric.
          </p>
        </div>
      ) : null}
    </div>
  );
}
