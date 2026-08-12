import { RepositoryNotice } from "@/components/repository-notice";
import { getModerationBacklogResult } from "@/lib/admin/moderation-backlog";
import { requireStaff } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";

export async function ModerationBacklogSummary() {
  await requireStaff(["moderator", "admin"]);
  const result = await getModerationBacklogResult();
  const backlog = result.data;

  return (
    <section className="stack" aria-labelledby="moderation-backlog-heading">
      <h2 className="section-title" id="moderation-backlog-heading">
        Backlog health
      </h2>
      <RepositoryNotice result={result} resource="Moderation backlog" />
      {backlog ? (
        <>
          <dl className="data-list">
            <div>
              <dt>Active</dt>
              <dd>{backlog.active_count.toLocaleString("en-NG")}</dd>
            </div>
            <div>
              <dt>Open / reviewing / escalated</dt>
              <dd>
                {backlog.open_count} / {backlog.in_review_count} /{" "}
                {backlog.escalated_count}
              </dd>
            </div>
            <div>
              <dt>Unassigned</dt>
              <dd>{backlog.unassigned_count.toLocaleString("en-NG")}</dd>
            </div>
            <div>
              <dt>Priority one</dt>
              <dd>{backlog.priority_one_count.toLocaleString("en-NG")}</dd>
            </div>
            <div>
              <dt>Older than 24 hours</dt>
              <dd>{backlog.older_than_24h_count.toLocaleString("en-NG")}</dd>
            </div>
            <div>
              <dt>Oldest active case</dt>
              <dd>
                {backlog.oldest_opened_at
                  ? formatDate(backlog.oldest_opened_at)
                  : "Queue is clear"}
              </dd>
            </div>
          </dl>
          <p className="text-muted m-0 text-sm">
            Measured {formatDate(backlog.measured_at)}. Counts contain no case
            text or contributor identity.
          </p>
        </>
      ) : null}
    </section>
  );
}
