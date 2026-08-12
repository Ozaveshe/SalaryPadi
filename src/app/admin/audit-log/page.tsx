import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getAdminAuditEventsResult } from "@/lib/admin/audit-log";
import { requireStaff } from "@/lib/auth/dal";
import { formatDate, formatEnum } from "@/lib/format";

function shortenedId(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : "Not recorded";
}

export default async function AuditLogPage() {
  await requireStaff(["admin"]);

  const result = await getAdminAuditEventsResult();

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected operations"
        title="Audit log"
        description="The 100 newest recorded staff, user and system changes. Raw before/after state and metadata are deliberately excluded from this reader."
      />
      <RepositoryNotice result={result} resource="Audit events" />

      {result.data.length === 0 && result.state === "ready" ? (
        <div className="empty-state">No audit events are recorded.</div>
      ) : result.data.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Reason</th>
                <th>Changed fields</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.occurred_at)}</td>
                  <td>{formatEnum(event.action)}</td>
                  <td>
                    <strong>{formatEnum(event.actor_kind)}</strong>
                    <span>{shortenedId(event.actor_user_id)}</span>
                  </td>
                  <td>
                    <strong>{formatEnum(event.target_type)}</strong>
                    <span>{shortenedId(event.target_id)}</span>
                  </td>
                  <td>
                    {event.reason_code
                      ? formatEnum(event.reason_code)
                      : "Not recorded"}
                  </td>
                  <td>
                    {event.changed_fields.length > 0
                      ? event.changed_fields.map(formatEnum).join(", ")
                      : "No fields listed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
