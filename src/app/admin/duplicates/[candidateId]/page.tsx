import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getDuplicateCandidateDetailResult } from "@/lib/admin/duplicate-detail";
import { requireStaff } from "@/lib/auth/dal";
import { formatDate, formatEnum, formatSalaryAmount } from "@/lib/format";

function display(value: string | null) {
  return value ? formatEnum(value) : "Not provided";
}

function date(value: string | null) {
  return value ? formatDate(value) : "Not provided";
}

function salary(
  minimum: number | null,
  maximum: number | null,
  currency: string | null,
  period: string | null,
) {
  if (minimum === null && maximum === null) return "Not published";
  const range = [minimum, maximum]
    .filter((value): value is number => value !== null)
    .map((value) => formatSalaryAmount(value, currency))
    .join(" – ");
  return period ? `${range} / ${formatEnum(period)}` : range;
}

function EvidenceLink({
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

export default async function DuplicateCandidateDetailPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  await requireStaff(["data_quality", "admin"]);
  const { candidateId } = await params;
  if (!z.uuid().safeParse(candidateId).success) notFound();

  const result = await getDuplicateCandidateDetailResult(candidateId);
  if (result.state === "ready" && !result.data) notFound();
  const candidate = result.data;

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected duplicate review"
        title={
          candidate
            ? `${candidate.first.title} comparison`
            : "Comparison unavailable"
        }
        description="Compare the current canonical roots and their source evidence before recording a decision. Missing values remain explicit; neither side is treated as better without operator judgment."
      />
      <p>
        <Link href="/admin/duplicates">← Back to duplicate candidates</Link>
      </p>
      <RepositoryNotice
        result={result}
        resource="Duplicate comparison evidence"
      />
      {candidate ? (
        <>
          <section
            className="surface surface-pad stack"
            aria-labelledby="detection-heading"
          >
            <div>
              <p className="eyebrow">Detection evidence</p>
              <h2 className="section-title" id="detection-heading">
                Candidate status
              </h2>
            </div>
            <dl className="data-list">
              <div>
                <dt>Status</dt>
                <dd>{formatEnum(candidate.status)}</dd>
              </div>
              <div>
                <dt>Title similarity</dt>
                <dd>{Math.round(candidate.titleSimilarity * 100)}%</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>
                  {candidate.detectionReason ??
                    "No detector reason was recorded."}
                </dd>
              </div>
              <div>
                <dt>Application hosts</dt>
                <dd>
                  {candidate.firstApplicationHost ?? "Unknown"} /{" "}
                  {candidate.secondApplicationHost ?? "Unknown"}
                </dd>
              </div>
              <div>
                <dt>Detected</dt>
                <dd>{date(candidate.createdAt)}</dd>
              </div>
              <div>
                <dt>Resolution</dt>
                <dd>
                  {candidate.resolutionReason ?? "Awaiting human decision"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="stack" aria-labelledby="comparison-heading">
            <div>
              <p className="eyebrow">Field-by-field evidence</p>
              <h2 className="section-title" id="comparison-heading">
                Current canonical roots
              </h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>First job</th>
                    <th>Second job</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Title</th>
                    <td>{candidate.first.title}</td>
                    <td>{candidate.second.title}</td>
                  </tr>
                  <tr>
                    <th scope="row">Employer</th>
                    <td>{candidate.first.companyName}</td>
                    <td>{candidate.second.companyName}</td>
                  </tr>
                  <tr>
                    <th scope="row">Job status</th>
                    <td>{display(candidate.first.status)}</td>
                    <td>{display(candidate.second.status)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Arrangement</th>
                    <td>{display(candidate.first.workArrangement)}</td>
                    <td>{display(candidate.second.workArrangement)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Employment</th>
                    <td>{display(candidate.first.employmentType)}</td>
                    <td>{display(candidate.second.employmentType)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Engagement</th>
                    <td>{display(candidate.first.engagementType)}</td>
                    <td>{display(candidate.second.engagementType)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Experience</th>
                    <td>{display(candidate.first.experienceLevel)}</td>
                    <td>{display(candidate.second.experienceLevel)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Location</th>
                    <td>{candidate.first.locations ?? "Not provided"}</td>
                    <td>{candidate.second.locations ?? "Not provided"}</td>
                  </tr>
                  <tr>
                    <th scope="row">Eligibility</th>
                    <td>{display(candidate.first.eligibilityScope)}</td>
                    <td>{display(candidate.second.eligibilityScope)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Eligibility evidence</th>
                    <td>
                      {candidate.first.eligibilityEvidence ?? "Not provided"}
                    </td>
                    <td>
                      {candidate.second.eligibilityEvidence ?? "Not provided"}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Eligibility provenance</th>
                    <td>{display(candidate.first.eligibilityProvenance)}</td>
                    <td>{display(candidate.second.eligibilityProvenance)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Salary</th>
                    <td>
                      {salary(
                        candidate.first.salaryMin,
                        candidate.first.salaryMax,
                        candidate.first.currencyCode,
                        candidate.first.payPeriod,
                      )}
                    </td>
                    <td>
                      {salary(
                        candidate.second.salaryMin,
                        candidate.second.salaryMax,
                        candidate.second.currencyCode,
                        candidate.second.payPeriod,
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Posted</th>
                    <td>{date(candidate.first.postedAt)}</td>
                    <td>{date(candidate.second.postedAt)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Valid through</th>
                    <td>{date(candidate.first.validThrough)}</td>
                    <td>{date(candidate.second.validThrough)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Last seen</th>
                    <td>{date(candidate.first.lastSeenAt)}</td>
                    <td>{date(candidate.second.lastSeenAt)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Last verified</th>
                    <td>{date(candidate.first.lastVerifiedAt)}</td>
                    <td>{date(candidate.second.lastVerifiedAt)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Source</th>
                    <td>
                      {candidate.first.sourceName} (
                      {formatEnum(candidate.first.sourceAuthority)})
                    </td>
                    <td>
                      {candidate.second.sourceName} (
                      {formatEnum(candidate.second.sourceAuthority)})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Source record</th>
                    <td>
                      <EvidenceLink href={candidate.first.sourceUrl}>
                        Open first source
                      </EvidenceLink>
                    </td>
                    <td>
                      <EvidenceLink href={candidate.second.sourceUrl}>
                        Open second source
                      </EvidenceLink>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Application</th>
                    <td>
                      <EvidenceLink href={candidate.first.applicationUrl}>
                        Open first application
                      </EvidenceLink>
                    </td>
                    <td>
                      <EvidenceLink href={candidate.second.applicationUrl}>
                        Open second application
                      </EvidenceLink>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Source terms</th>
                    <td>
                      <EvidenceLink href={candidate.first.sourceTermsUrl}>
                        Terms reviewed{" "}
                        {date(candidate.first.sourceTermsReviewedAt)}
                      </EvidenceLink>
                    </td>
                    <td>
                      <EvidenceLink href={candidate.second.sourceTermsUrl}>
                        Terms reviewed{" "}
                        {date(candidate.second.sourceTermsReviewedAt)}
                      </EvidenceLink>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Canonical job ID</th>
                    <td>{candidate.first.jobId}</td>
                    <td>{candidate.second.jobId}</td>
                  </tr>
                  <tr>
                    <th scope="row">Original source job ID</th>
                    <td>{candidate.first.sourceJobId}</td>
                    <td>{candidate.second.sourceJobId}</td>
                  </tr>
                  <tr>
                    <th scope="row">Description</th>
                    <td>
                      <details>
                        <summary>Read first description</summary>
                        <p className="text-prewrap">
                          {candidate.first.description}
                        </p>
                      </details>
                    </td>
                    <td>
                      <details>
                        <summary>Read second description</summary>
                        <p className="text-prewrap">
                          {candidate.second.description}
                        </p>
                      </details>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="surface surface-pad stack"
            aria-labelledby="decision-heading"
          >
            <div>
              <p className="eyebrow">Human decision</p>
              <h2 className="section-title" id="decision-heading">
                Record the canonical result
              </h2>
            </div>
            {candidate.status === "pending" ? (
              <form
                className="admin-action"
                action="/api/admin/duplicates/transition"
                method="post"
              >
                <input type="hidden" name="id" value={candidate.id} />
                <input
                  type="hidden"
                  name="expected_version"
                  value={candidate.version}
                />
                <label htmlFor="duplicate-action">Decision</label>
                <select
                  className="select"
                  id="duplicate-action"
                  name="action"
                  required
                >
                  <option value="">Choose</option>
                  <option value="keep_first">Keep first; link second</option>
                  <option value="keep_second">Keep second; link first</option>
                  <option value="dismiss">Not duplicates</option>
                </select>
                <label htmlFor="duplicate-reason">Evidence-based reason</label>
                <textarea
                  className="textarea"
                  id="duplicate-reason"
                  name="reason"
                  minLength={3}
                  maxLength={500}
                  required
                />
                <button className="button button-secondary" type="submit">
                  Apply decision
                </button>
              </form>
            ) : (
              <p>
                This candidate already has a recorded decision. The comparison
                remains available as review evidence.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
