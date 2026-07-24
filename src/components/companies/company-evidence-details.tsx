import { ExternalLink } from "lucide-react";

import type { CompanySummary } from "@/lib/companies/repository";
import { formatDate, formatEnum } from "@/lib/format";

/**
 * Provenance and record-keeping detail for a company profile: legal
 * entities, aliases, official domains, catalogue selection provenance,
 * verification wording and the retained citation list.
 *
 * This is deliberately secondary and collapsed. A candidate deciding where
 * to work needs the overview; an auditor needs this. Rows are omitted when
 * their value is absent — nothing prints a null-state label.
 */
export function CompanyEvidenceDetails({
  company,
  citedJobSources,
}: {
  company: CompanySummary;
  citedJobSources: { name: string; url: string }[];
}) {
  const legalEntities = company.legalEntities
    .map((entity) =>
      [entity.legal_name, entity.registration_country]
        .filter(Boolean)
        .join(" · "),
    )
    .filter(Boolean);
  const domains = company.officialDomains.map((item) => item.domain);
  const aliases = company.aliases.map((item) => item.alias);
  const hasCitations =
    company.citations.length > 0 ||
    citedJobSources.length > 0 ||
    company.catalog;

  return (
    <details className="evidence-details">
      <summary>Record and source evidence</summary>
      <div className="stack">
        <p className="text-muted m-0 text-sm">
          How this profile was assembled and what it is based on. SalaryPadi
          verifies the source record, not the employer&apos;s identity.
        </p>
        <dl className="data-list">
          <div>
            <dt>Information type</dt>
            <dd>
              {company.databaseId
                ? "Reviewed company record plus labelled source evidence"
                : "Permitted job-source facts"}
            </dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>
              {formatEnum(company.verification)} — this is not employer identity
              verification
            </dd>
          </div>
          {company.catalog ? (
            <div>
              <dt>2025 listed-company catalogue</dt>
              <dd>
                Rank {company.catalog.rank} · {company.catalog.marketCountry}{" "}
                market · data as of {company.catalog.dataAsOf}
              </dd>
            </div>
          ) : null}
          {legalEntities.length > 0 ? (
            <div>
              <dt>Legal entities</dt>
              <dd>{legalEntities.join("; ")}</dd>
            </div>
          ) : null}
          {domains.length > 0 ? (
            <div>
              <dt>Official domains</dt>
              <dd>{domains.join(", ")}</dd>
            </div>
          ) : null}
          {aliases.length > 0 ? (
            <div>
              <dt>Known aliases</dt>
              <dd>{aliases.join(", ")}</dd>
            </div>
          ) : null}
          {company.sizeBand ? (
            <div>
              <dt>Company size</dt>
              <dd>{company.sizeBand}</dd>
            </div>
          ) : null}
          <div>
            <dt>Last evidence check</dt>
            <dd>{formatDate(company.lastCheckedAt)}</dd>
          </div>
        </dl>
        {hasCitations ? (
          <ul className="source-list">
            {company.catalog ? (
              <li>
                <a
                  href={company.catalog.selectionUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {company.catalog.selectionTitle}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>{" "}
                <span className="source-note">
                  Selection provenance only · not employer verification
                </span>
              </li>
            ) : null}
            {company.citations.map((citation) => (
              <li key={citation.id}>
                <a
                  href={citation.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {citation.source_title}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>{" "}
                <span className="source-note">
                  {formatEnum(citation.source_kind)} · fact checked{" "}
                  {formatDate(citation.fact_checked_at)} · review due{" "}
                  {formatDate(citation.review_due_at)}
                </span>
              </li>
            ))}
            {citedJobSources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {source.name}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted m-0 text-sm">
            No public citation URL is stored for this profile. Structured facts
            remain visible as reviewed records, but they should not be treated
            as independently confirmed official facts.
          </p>
        )}
      </div>
    </details>
  );
}
