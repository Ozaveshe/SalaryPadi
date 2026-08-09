import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import {
  getCompanyResult,
  getInterviewExperiencesResult,
} from "@/lib/companies/repository";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Interview experiences",
  robots: { index: false, follow: true },
};

export default async function CompanyInterviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [companyResult, interviewsResult] = await Promise.all([
    getCompanyResult(slug),
    getInterviewExperiencesResult(slug),
  ]);
  const company = companyResult.data;
  if (companyResult.state === "ready" && !company) notFound();
  if (!company) {
    return (
      <div className="site-shell stack-lg">
        <RepositoryNotice result={companyResult} resource="Company profile" />
      </div>
    );
  }
  const interviews = interviewsResult.data;
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading
        company={company}
        section={{
          label: "Interviews",
          path: `/companies/${company.slug}/interviews`,
        }}
      />
      <section className="rule-section stack">
        <h2 className="section-title">Interview experiences</h2>
        <RepositoryNotice
          result={interviewsResult}
          resource="Interview experiences"
        />
        {interviews.length > 0 ? (
          <div className="stack">
            {interviews.map((interview) => {
              // Absent fields are omitted, never printed as null-state
              // labels — the presentation contract in
              // src/lib/presentation/public-field.ts.
              const facts = [
                [
                  "Seniority",
                  interview.seniority ? formatEnum(interview.seniority) : null,
                ],
                ["Application source", interview.application_source],
                ["Duration", interview.approximate_duration_label],
                ["Difficulty", interview.difficulty],
                [
                  "Feedback received",
                  interview.feedback_received === null
                    ? null
                    : interview.feedback_received
                      ? "Yes"
                      : "No",
                ],
              ].filter(
                (entry): entry is [string, string | number] =>
                  entry[1] !== null && entry[1] !== undefined,
              );
              return (
                <article
                  className="surface surface-pad stack"
                  key={interview.id}
                >
                  <div className="split">
                    <div>
                      <p className="eyebrow">
                        {[
                          interview.country_code === "WITHHELD"
                            ? "Country withheld"
                            : interview.country_code,
                          interview.role_family,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <h3 className="m-0 text-xl font-bold">
                        {interview.outcome
                          ? formatEnum(interview.outcome)
                          : "Interview experience"}
                      </h3>
                    </div>
                    <span className="source-note">
                      Published {formatDate(interview.published_at)}
                    </span>
                  </div>
                  {facts.length > 0 ? (
                    <dl className="data-list">
                      {facts.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {interview.stages.length > 0 ? (
                    <div>
                      <strong>Stages</strong>
                      <p>{interview.stages.join(" → ")}</p>
                    </div>
                  ) : null}
                  {interview.question_themes ? (
                    <div>
                      <strong>Question themes</strong>
                      <p>{interview.question_themes}</p>
                    </div>
                  ) : null}
                  {interview.general_experience ? (
                    <div>
                      <strong>General experience</strong>
                      <p>{interview.general_experience}</p>
                    </div>
                  ) : null}
                  <p className="source-note m-0">
                    {interview.provenance_label}
                  </p>
                </article>
              );
            })}
          </div>
        ) : interviewsResult.state === "ready" ? (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              No approved interview evidence yet
            </h3>
            <p>
              Submissions can describe stages and themes, but should not expose
              confidential material or exact proprietary test answers.
            </p>
            <Link className="button w-fit" href="/contribute/interview">
              Share an interview experience
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
