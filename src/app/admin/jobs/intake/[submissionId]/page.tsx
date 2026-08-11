import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getOperatorJobIntakeDetailResult } from "@/lib/admin/job-intake";
import { requireStaff } from "@/lib/auth/dal";
import { formatDate, formatEnum } from "@/lib/format";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children ?? "Not provided"}</dd>
    </div>
  );
}

function yesNo(value: boolean | null) {
  return value === null ? "Unclear" : value ? "Yes" : "No";
}

export default async function OperatorJobIntakeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const viewer = await requireStaff(["data_quality", "admin"]);
  const { submissionId } = await params;
  const result = await getOperatorJobIntakeDetailResult(submissionId);
  if (result.state === "ready" && !result.data) notFound();
  const detail = result.data;
  const submitted = (await searchParams).submitted === "true";
  return (
    <div className="stack-lg">
      <Link href="/admin/jobs/intake">← Back to intake</Link>
      <PageHeading
        eyebrow="Protected source evidence"
        title={detail?.submission_data.title ?? "Operator job intake"}
        description="Compare the retained source, normalized fields and eligibility statement before any moderation decision."
      />
      {submitted ? (
        <div className="notice" role="status">
          <strong>Pending moderation case created.</strong> The job is not
          public.
        </div>
      ) : null}
      <RepositoryNotice result={result} resource="Operator intake detail" />
      {detail ? (
        <>
          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Source boundary</p>
              <h2 className="section-title">Original evidence</h2>
            </div>
            <dl className="data-list data-list-stacked">
              <Field label="Source URL">
                <a
                  href={detail.submission_data.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  Open retained source
                </a>
              </Field>
              <Field label="Source establishes">
                {detail.submission_data.source_evidence}
              </Field>
              <Field label="Intake reason">
                {detail.submission_data.intake_reason}
              </Field>
              <Field label="Application URL">
                <a
                  href={detail.submission_data.application_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  Open application destination
                </a>
              </Field>
              <Field label="Company website">
                {detail.submission_data.company_website ? (
                  <a
                    href={detail.submission_data.company_website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Open company website
                  </a>
                ) : null}
              </Field>
            </dl>
          </section>

          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Normalized candidate</p>
              <h2 className="section-title">Job fields</h2>
            </div>
            <dl className="data-list">
              <Field label="Company">
                {detail.submission_data.company_name}
              </Field>
              <Field label="Title">{detail.submission_data.title}</Field>
              <Field label="Location">
                {detail.submission_data.location},{" "}
                {detail.submission_data.country_code}
              </Field>
              <Field label="Work mode">
                {formatEnum(detail.submission_data.work_mode)}
              </Field>
              <Field label="Employment">
                {formatEnum(detail.submission_data.employment_type)}
              </Field>
              <Field label="Engagement">
                {formatEnum(detail.submission_data.arrangement)}
              </Field>
              <Field label="Experience">
                {formatEnum(detail.submission_data.experience_level)}
              </Field>
              <Field label="Deadline">
                {detail.submission_data.deadline ?? "Not provided"}
              </Field>
              <Field label="Salary">
                {detail.submission_data.salary_minimum === null &&
                detail.submission_data.salary_maximum === null
                  ? "Not disclosed"
                  : `${detail.submission_data.currency ?? ""} ${detail.submission_data.salary_minimum ?? ""} – ${detail.submission_data.salary_maximum ?? ""} / ${detail.submission_data.pay_period ? formatEnum(detail.submission_data.pay_period) : "period unstated"} (${formatEnum(detail.submission_data.gross_net)})`}
              </Field>
            </dl>
            <details open>
              <summary>Description</summary>
              <p className="text-prewrap">
                {detail.submission_data.description}
              </p>
            </details>
            <details>
              <summary>Requirements</summary>
              <p className="text-prewrap">
                {detail.submission_data.requirements}
              </p>
            </details>
            <details>
              <summary>Benefits</summary>
              <p className="text-prewrap">
                {detail.submission_data.benefits ?? "Not provided"}
              </p>
            </details>
          </section>

          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Eligibility claim</p>
              <h2 className="section-title">Who can apply</h2>
            </div>
            <dl className="data-list">
              <Field label="Scope">
                {formatEnum(detail.submission_data.eligibility_scope)}
              </Field>
              <Field label="Evidence">
                {detail.submission_data.eligibility_evidence}
              </Field>
              <Field label="Included countries">
                {detail.submission_data.included_countries}
              </Field>
              <Field label="Excluded countries">
                {detail.submission_data.excluded_countries}
              </Field>
              <Field label="Timezone overlap">
                {detail.submission_data.timezone_overlap}
              </Field>
              <Field label="Work authorization">
                {detail.submission_data.work_authorization}
              </Field>
              <Field label="Visa sponsorship">
                {yesNo(detail.submission_data.visa_sponsorship)}
              </Field>
            </dl>
          </section>

          <section className="surface surface-pad stack">
            <div>
              <p className="eyebrow">Moderation</p>
              <h2 className="section-title">Decision</h2>
            </div>
            <dl className="data-list">
              <Field label="Submission status">
                {formatEnum(detail.submission_data.status)}
              </Field>
              <Field label="Case state">
                {formatEnum(detail.moderation_data.state)}
              </Field>
              <Field label="Priority">{detail.moderation_data.priority}</Field>
              <Field label="Submitted">
                {formatDate(detail.submission_data.submitted_at)}
              </Field>
              <Field label="Updated">
                {formatDate(detail.submission_data.updated_at)}
              </Field>
            </dl>
            {viewer.isAdmin &&
            ["pending", "in_review", "revision_requested"].includes(
              detail.submission_data.status,
            ) ? (
              <form
                className="admin-action"
                action="/api/admin/moderation/transition"
                method="post"
              >
                <input
                  type="hidden"
                  name="id"
                  value={detail.moderation_data.case_id}
                />
                <input
                  type="hidden"
                  name="expected_version"
                  value={detail.moderation_data.version}
                />
                <label htmlFor="intake-action">Action</label>
                <select
                  className="select"
                  id="intake-action"
                  name="action"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Choose
                  </option>
                  <option value="approve">Approve and publish</option>
                  <option value="reject">Reject</option>
                  <option value="escalate">Escalate</option>
                  <option value="request_revision">Request revision</option>
                </select>
                <label htmlFor="intake-reason">Evidence-based reason</label>
                <textarea
                  className="textarea"
                  id="intake-reason"
                  name="reason"
                  minLength={3}
                  maxLength={500}
                  required
                />
                <button className="button button-secondary" type="submit">
                  Record moderation decision
                </button>
              </form>
            ) : (
              <p>
                {viewer.isAdmin
                  ? "No moderation action is available from this state."
                  : "Data-quality access is read-only. An AAL2 administrator must record the decision."}
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
