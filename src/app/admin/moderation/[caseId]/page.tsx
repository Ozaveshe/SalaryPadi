import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getModerationCaseResult } from "@/lib/admin/moderation-case";
import { requireStaff } from "@/lib/auth/dal";
import { formatDate, formatEnum } from "@/lib/format";

const actions = [
  "claim",
  "approve",
  "redact",
  "reject",
  "request_revision",
  "escalate",
  "merge_duplicate",
  "remove",
  "restore",
] as const;

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

export default async function ModerationCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  await requireStaff(["moderator", "admin"]);
  const { caseId } = await params;
  if (!z.uuid().safeParse(caseId).success) notFound();
  const result = await getModerationCaseResult(caseId);
  if (result.state === "ready" && !result.data) notFound();
  const detail = result.data;

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected moderation case"
        title={
          detail
            ? `${formatEnum(detail.source_type)} review`
            : "Case unavailable"
        }
        description="Review the submitted source, safety flags and immutable decision history before acting. Source content is private and must not be copied outside this workflow."
      />
      <p>
        <Link href="/admin/moderation">← Back to moderation queue</Link>
      </p>
      <RepositoryNotice result={result} resource="Moderation case evidence" />
      {detail ? (
        <>
          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Case state</p>
              <h2 className="section-title">Triage evidence</h2>
            </div>
            <dl className="data-list">
              <div>
                <dt>Status</dt>
                <dd>{formatEnum(detail.case.state)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{detail.case.priority}</dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>{formatDate(detail.case.opened_at)}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{detail.case.version}</dd>
              </div>
            </dl>
            <h3 className="text-lg font-bold">Safety flags</h3>
            {detail.flags.length ? (
              <ul className="stack-sm">
                {detail.flags.map((flag) => (
                  <li key={flag.id}>
                    <strong>{formatEnum(flag.kind)}</strong> ·{" "}
                    {formatEnum(flag.source)}
                    {flag.confidence === null
                      ? ""
                      : ` · ${Math.round(flag.confidence * 100)}% confidence`}
                    {flag.resolved_at
                      ? ` · resolved ${formatDate(flag.resolved_at)}`
                      : " · unresolved"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No safety flags were recorded.</p>
            )}
          </section>

          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Private source record</p>
              <h2 className="section-title">Content to review</h2>
            </div>
            <dl className="data-list">
              {Object.entries(detail.source_payload).map(([key, value]) => (
                <div key={key}>
                  <dt>{formatEnum(key)}</dt>
                  <dd className="text-prewrap">{renderValue(value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Immutable history</p>
              <h2 className="section-title">Recorded actions</h2>
            </div>
            {detail.actions.length ? (
              <ol className="stack-sm">
                {detail.actions.map((action, index) => (
                  <li key={`${action.occurred_at}-${index}`}>
                    <strong>{formatEnum(action.action)}</strong> by{" "}
                    {formatEnum(action.actor_role)} on{" "}
                    {formatDate(action.occurred_at)}
                    {action.reason_note ? ` — ${action.reason_note}` : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No action has been recorded yet.</p>
            )}
          </section>

          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Human decision</p>
              <h2 className="section-title">Act on this case</h2>
            </div>
            {detail.case.state === "closed" ? (
              <p>
                This case is closed. Its evidence and action history remain
                available as an operational receipt.
              </p>
            ) : (
              <form
                className="admin-action"
                action="/api/admin/moderation/transition"
                method="post"
              >
                <input type="hidden" name="id" value={detail.case.id} />
                <input
                  type="hidden"
                  name="expected_version"
                  value={detail.case.version}
                />
                <label htmlFor="moderation-action">Action</label>
                <select
                  className="select"
                  id="moderation-action"
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
                <label htmlFor="moderation-reason">Evidence-based reason</label>
                <textarea
                  className="textarea"
                  id="moderation-reason"
                  name="reason"
                  minLength={3}
                  maxLength={500}
                  required
                />
                <label htmlFor="moderation-payload">
                  Redacted public fields (JSON; redact only)
                </label>
                <textarea
                  className="textarea"
                  id="moderation-payload"
                  name="public_payload"
                  maxLength={60000}
                  placeholder='{"pros":"Redacted public text"}'
                />
                <label htmlFor="moderation-linked-case">
                  Destination case ID (merge duplicate only)
                </label>
                <input
                  className="input"
                  id="moderation-linked-case"
                  name="linked_case_id"
                  placeholder="UUID"
                />
                <button className="button button-secondary" type="submit">
                  Apply decision
                </button>
              </form>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
