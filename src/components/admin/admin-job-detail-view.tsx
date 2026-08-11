import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminJobDetail } from "@/lib/admin/jobs";
import { formatDate, formatEnum, formatSalaryAmount } from "@/lib/format";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children ?? "Not provided"}</dd>
    </div>
  );
}

function value(value: string | null) {
  return value ? formatEnum(value) : "Not provided";
}

function date(value: string | null) {
  return value ? formatDate(value) : "Not provided";
}

function yesNo(value: boolean | null) {
  return value === null ? "Not provided" : value ? "Yes" : "No";
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  if (href.startsWith("/")) return <Link href={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

function salary(detail: AdminJobDetail["job_data"]) {
  if (detail.salary_min === null && detail.salary_max === null)
    return "Not published";
  const amount = [detail.salary_min, detail.salary_max]
    .filter((item): item is number => item !== null)
    .map((item) => formatSalaryAmount(item, detail.currency_code))
    .join(" – ");
  return detail.pay_period
    ? `${amount} / ${formatEnum(detail.pay_period)} (${formatEnum(detail.gross_net)})`
    : `${amount} (${formatEnum(detail.gross_net)})`;
}

function availableActions(status: string) {
  switch (status) {
    case "draft":
      return ["approve", "remove"];
    case "pending":
      return ["approve", "expire", "remove"];
    case "published":
      return ["expire", "remove"];
    case "expired":
    case "removed":
      return ["restore"];
    case "rejected":
      return ["approve", "restore", "remove"];
    default:
      return [];
  }
}

export function AdminJobStatusControl({
  jobId,
  version,
  status,
  canTransition,
}: {
  jobId: string;
  version: number;
  status: string;
  canTransition: boolean;
}) {
  const actions = availableActions(status);
  return (
    <section
      className="surface surface-pad stack"
      aria-labelledby="job-action-heading"
    >
      <div>
        <p className="eyebrow">Status control</p>
        <h2 className="section-title" id="job-action-heading">
          Administrator decision
        </h2>
      </div>
      {canTransition && actions.length > 0 ? (
        <form
          className="admin-action"
          action="/api/admin/jobs/transition"
          method="post"
        >
          <input type="hidden" name="id" value={jobId} />
          <input type="hidden" name="expected_version" value={version} />
          <label htmlFor="job-action">Action</label>
          <select className="select" id="job-action" name="action" required>
            <option value="">Choose</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {formatEnum(action)}
              </option>
            ))}
          </select>
          <label htmlFor="job-action-reason">Evidence-based reason</label>
          <textarea
            className="textarea"
            id="job-action-reason"
            name="reason"
            minLength={3}
            maxLength={500}
            required
          />
          <button className="button button-secondary" type="submit">
            Apply status change
          </button>
        </form>
      ) : (
        <p>
          {canTransition
            ? "No status transition is available from this state."
            : "Data-quality access is read-only. An AAL2 administrator must record any status change with a reason."}
        </p>
      )}
    </section>
  );
}

export function AdminJobDetailView({
  detail,
  canTransition,
}: {
  detail: AdminJobDetail;
  canTransition: boolean;
}) {
  const job = detail.job_data;
  const company = detail.company_data;
  const source = detail.source_data;

  return (
    <>
      <section
        className="surface surface-pad stack"
        aria-labelledby="job-readiness-heading"
      >
        <div>
          <p className="eyebrow">Publication decision</p>
          <h2 className="section-title" id="job-readiness-heading">
            Status and blockers
          </h2>
        </div>
        <div className="cluster">
          <span className="status status-neutral">
            {formatEnum(job.status)}
          </span>
          <span
            className={`status ${
              detail.publication_blockers.length > 0
                ? "status-warning"
                : "status-success"
            }`}
          >
            {detail.publication_blockers.length > 0
              ? `${detail.publication_blockers.length} publication blocker${detail.publication_blockers.length === 1 ? "" : "s"}`
              : "No listed publication blockers"}
          </span>
          {detail.open_report_count > 0 ? (
            <span className="status status-warning">
              {detail.open_report_count} open report
              {detail.open_report_count === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {detail.publication_blockers.length > 0 ? (
          <ul>
            {detail.publication_blockers.map((blocker) => (
              <li key={blocker}>{formatEnum(blocker)}</li>
            ))}
          </ul>
        ) : (
          <p className="field-help">
            This list is necessary evidence, not automatic approval. An
            administrator must still review the source record and job content.
          </p>
        )}
        <dl className="data-list">
          <Field label="Open reports">{detail.open_report_count}</Field>
          <Field label="All reports">{detail.report_count}</Field>
          <Field label="Duplicate candidates">
            {detail.duplicate_candidate_count}
          </Field>
          <Field label="Apply-link state">
            {formatEnum(job.apply_link_state)}
          </Field>
          <Field label="Lifecycle">{formatEnum(job.lifecycle_state)}</Field>
          <Field label="Lifecycle reason">{job.lifecycle_reason}</Field>
        </dl>
      </section>

      <section className="split" aria-label="Job and company identity">
        <div className="surface surface-pad stack">
          <div>
            <p className="eyebrow">Normalized job</p>
            <h2 className="section-title">Identity</h2>
          </div>
          <dl className="data-list data-list-stacked">
            <Field label="Job ID">{job.id}</Field>
            <Field label="Canonical job ID">{job.canonical_job_id}</Field>
            <Field label="Slug">{job.slug}</Field>
            <Field label="External source ID">{job.external_source_id}</Field>
            <Field label="Version">{job.version}</Field>
            <Field label="Fixture">{job.is_fixture ? "Yes" : "No"}</Field>
            <Field label="Public route">
              <Link href={`/jobs/${job.slug}`}>Open public job route</Link>
            </Field>
          </dl>
        </div>
        <div className="surface surface-pad stack">
          <div>
            <p className="eyebrow">Employer record</p>
            <h2 className="section-title">Company</h2>
          </div>
          <dl className="data-list data-list-stacked">
            <Field label="Name">{company.display_name}</Field>
            <Field label="Company ID">{company.id}</Field>
            <Field label="Domain">{company.website_domain}</Field>
            <Field label="Verification">
              {formatEnum(company.verification_status)}
            </Field>
            <Field label="Record status">
              {formatEnum(company.record_status)}
            </Field>
            <Field label="Company route">
              <Link href={`/companies/${company.slug}`}>Open company</Link>
            </Field>
            <Field label="Website">
              {company.website_url ? (
                <ExternalLink href={company.website_url}>
                  Open employer website
                </ExternalLink>
              ) : null}
            </Field>
          </dl>
        </div>
      </section>

      <section
        className="surface surface-pad stack"
        aria-labelledby="job-content-heading"
      >
        <div>
          <p className="eyebrow">Retained source content</p>
          <h2 className="section-title" id="job-content-heading">
            Job fields
          </h2>
        </div>
        <dl className="data-list">
          <Field label="Arrangement">{formatEnum(job.work_arrangement)}</Field>
          <Field label="Employment">{formatEnum(job.employment_type)}</Field>
          <Field label="Engagement">{formatEnum(job.engagement_type)}</Field>
          <Field label="Experience">{formatEnum(job.experience_level)}</Field>
          <Field label="Salary">{salary(job)}</Field>
          <Field label="Bonus">{job.bonus_text}</Field>
          <Field label="Application destination">
            {value(job.application_destination_kind)}
          </Field>
          <Field label="Application URL">
            <ExternalLink href={job.application_url}>
              Open application destination
            </ExternalLink>
          </Field>
          <Field label="Source URL">
            <ExternalLink href={job.source_url}>
              Open source record
            </ExternalLink>
          </Field>
          <Field label="Original employer URL">
            {job.original_employer_url ? (
              <ExternalLink href={job.original_employer_url}>
                Open employer record
              </ExternalLink>
            ) : null}
          </Field>
        </dl>
        <details open>
          <summary>Description</summary>
          <p className="text-prewrap">{job.description}</p>
        </details>
        <details>
          <summary>Requirements</summary>
          <p className="text-prewrap">{job.requirements ?? "Not provided"}</p>
        </details>
        <details>
          <summary>Benefits</summary>
          <p className="text-prewrap">{job.benefits ?? "Not provided"}</p>
        </details>
      </section>

      <section className="split" aria-label="Location and eligibility evidence">
        <div className="surface surface-pad stack">
          <div>
            <p className="eyebrow">Source locations</p>
            <h2 className="section-title">Locations</h2>
          </div>
          {detail.locations_data.length > 0 ? (
            <ul>
              {detail.locations_data.map((location, index) => (
                <li key={`${location.country_code ?? "unknown"}-${index}`}>
                  {[location.city, location.region, location.country_code]
                    .filter(Boolean)
                    .join(", ") || "Unspecified location"}
                  {location.is_primary ? " (primary)" : ""}
                  {location.source_location_text
                    ? ` — source wording: ${location.source_location_text}`
                    : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>No normalized locations are attached.</p>
          )}
        </div>
        <div className="surface surface-pad stack">
          <div>
            <p className="eyebrow">Eligibility evidence</p>
            <h2 className="section-title">Who can apply</h2>
          </div>
          {detail.eligibility_data ? (
            <dl className="data-list data-list-stacked">
              <Field label="Scope">
                {formatEnum(detail.eligibility_data.scope)}
              </Field>
              <Field label="Evidence">
                {detail.eligibility_data.evidence_text}
              </Field>
              <Field label="Provenance">
                {formatEnum(detail.eligibility_data.provenance)}
              </Field>
              <Field label="Confidence">
                {detail.eligibility_data.confidence === null
                  ? null
                  : `${Math.round(detail.eligibility_data.confidence * 100)}%`}
              </Field>
              <Field label="Timezone overlap">
                {detail.eligibility_data.required_timezone_overlap}
              </Field>
              <Field label="Work authorization">
                {detail.eligibility_data.work_authorization_requirement}
              </Field>
              <Field label="Visa sponsorship">
                {yesNo(detail.eligibility_data.visa_sponsorship)}
              </Field>
              <Field label="Relocation support">
                {yesNo(detail.eligibility_data.relocation_support)}
              </Field>
              <Field label="Last verified">
                {date(detail.eligibility_data.last_verified_at)}
              </Field>
            </dl>
          ) : (
            <p>No eligibility record is attached. Do not infer access.</p>
          )}
        </div>
      </section>

      <section
        className="surface surface-pad stack"
        aria-labelledby="source-policy-heading"
      >
        <div>
          <p className="eyebrow">Rights and provenance</p>
          <h2 className="section-title" id="source-policy-heading">
            Source policy
          </h2>
        </div>
        <dl className="data-list">
          <Field label="Source">{source.name}</Field>
          <Field label="Adapter">{source.adapter_key}</Field>
          <Field label="Source type">{formatEnum(source.source_type)}</Field>
          <Field label="Authority">{formatEnum(source.authority)}</Field>
          <Field label="Source status">{formatEnum(source.status)}</Field>
          <Field label="Policy state">{formatEnum(source.policy_state)}</Field>
          <Field label="Terms">
            <ExternalLink href={source.terms_url}>
              Open source terms
            </ExternalLink>
          </Field>
          <Field label="Terms reviewed">{date(source.terms_reviewed_at)}</Field>
          <Field label="Terms version">{source.terms_version}</Field>
          <Field label="Authorization basis">
            {source.authorization_basis}
          </Field>
          <Field label="Authorization evidence">
            {source.authorization_evidence_ref}
          </Field>
          <Field label="Authorization reviewed">
            {date(source.authorization_reviewed_at)}
          </Field>
          <Field label="Authorization expires">
            {date(source.authorization_expires_at)}
          </Field>
          <Field label="Authorization revoked">
            {date(source.authorization_revoked_at)}
          </Field>
          <Field label="Public listing">
            {source.allow_public_listing ? "Allowed" : "Not allowed"}
          </Field>
          <Field label="Search indexing">
            {source.may_index_jobs ? "Allowed" : "Not allowed"}
          </Field>
          <Field label="JobPosting schema">
            {source.may_emit_jobposting_schema ? "Allowed" : "Not allowed"}
          </Field>
          <Field label="Job email">
            {source.may_email_jobs ? "Allowed" : "Not allowed"}
          </Field>
        </dl>
      </section>

      <section
        className="surface surface-pad stack"
        aria-labelledby="freshness-heading"
      >
        <div>
          <p className="eyebrow">Freshness trail</p>
          <h2 className="section-title" id="freshness-heading">
            Dates
          </h2>
        </div>
        <dl className="data-list">
          <Field label="Posted">{date(job.posted_at)}</Field>
          <Field label="Valid through">{date(job.valid_through)}</Field>
          <Field label="Last seen">{date(job.last_seen_at)}</Field>
          <Field label="Last checked">{date(job.last_checked_at)}</Field>
          <Field label="Last verified">{date(job.last_verified_at)}</Field>
          <Field label="Content sanitized">
            {date(job.content_sanitized_at)}
          </Field>
          <Field label="Apply link checked">
            {date(job.apply_link_checked_at)}
          </Field>
          <Field label="Public ready until">
            {date(job.public_ready_until)}
          </Field>
          <Field label="Manually reconfirmed">
            {date(job.manual_reconfirmed_at)}
          </Field>
          <Field label="Created">{date(job.created_at)}</Field>
          <Field label="Updated">{date(job.updated_at)}</Field>
          <Field label="Dedup fingerprint">{job.dedup_fingerprint}</Field>
        </dl>
      </section>

      <AdminJobStatusControl
        jobId={job.id}
        version={job.version}
        status={job.status}
        canTransition={canTransition}
      />
    </>
  );
}
