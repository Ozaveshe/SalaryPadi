import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { requireAdmin } from "@/lib/auth/dal";
import { formatEnum } from "@/lib/format";
import { getCountryPackReadinessResult } from "@/lib/operations/country-pack-readiness";

function percentage(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export default async function CountryReadinessPage() {
  await requireAdmin();
  const readinessResult = await getCountryPackReadinessResult();
  const readiness = readinessResult.data;

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected operations"
        title="Country readiness"
        description="Activation evidence for reusable country packs. Configuration never makes a candidate route public; every measured and reviewed gate must pass first."
      />

      <RepositoryNotice
        result={readinessResult}
        resource="Country readiness evidence"
      />

      {readiness ? (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Exposure</th>
                  <th>Authorized supply</th>
                  <th>Eligibility</th>
                  <th>Rules and evidence</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {readiness.countries.map((country) => (
                  <tr key={country.country_code}>
                    <td>
                      <strong>{country.name}</strong>
                      <span>
                        {country.country_code} · {country.default_locale} ·{" "}
                        {country.currency_code}
                      </span>
                    </td>
                    <td>
                      <span className="status status-neutral">
                        {formatEnum(country.pack_state)}
                      </span>
                      <span>
                        routes {country.public_routes_enabled ? "on" : "off"} ·
                        index {country.search_index_enabled ? "on" : "off"}
                      </span>
                    </td>
                    <td>
                      {country.metrics.authorized_active_jobs.toLocaleString(
                        country.default_locale,
                      )}
                      /
                      {country.thresholds.authorized_active_jobs.toLocaleString(
                        country.default_locale,
                      )}{" "}
                      jobs
                      <span>
                        {country.metrics.authorized_sources}/
                        {country.thresholds.authorized_sources} sources
                      </span>
                    </td>
                    <td>
                      {percentage(country.metrics.explicit_eligibility_ratio)}
                      <span>
                        target{" "}
                        {percentage(
                          country.thresholds.explicit_eligibility_ratio,
                        )}
                      </span>
                    </td>
                    <td>
                      <span>
                        Tax {country.metrics.reviewed_tax_rules} · employment{" "}
                        {country.metrics.reviewed_employment_rules}
                      </span>
                      <span>
                        content {country.metrics.unique_content_pages}/
                        {country.thresholds.unique_content_pages} · first-party{" "}
                        {country.metrics.first_party_contributions}/
                        {country.thresholds.first_party_contributions}
                      </span>
                    </td>
                    <td>
                      <span className="status status-neutral">
                        {country.activation_ready
                          ? "Ready for review"
                          : "Blocked"}
                      </span>
                      <span>
                        {country.blockers.length > 0
                          ? country.blockers.map(formatEnum).join(", ")
                          : "All gates evidenced"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted">
            “Ready for review” is not activation. An administrator with AAL2
            must record the review and explicitly enable routes; deployment
            remains a separate approval.
          </p>
        </>
      ) : null}
    </div>
  );
}
