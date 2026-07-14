import type { Metadata } from "next";

import { PageHeading } from "@/components/page-heading";
import { CompanyEvidenceInvitation } from "@/components/companies/company-evidence-invitation";
import { PrivateDataStatus } from "@/components/private-data-status";
import { requireViewer } from "@/lib/auth/dal";
import { getAlerts } from "@/lib/career/repository";
import { formatDate, formatEnum } from "@/lib/format";
import { parseJobSearch, serializeJobSearch } from "@/lib/jobs/search";

export const metadata: Metadata = {
  title: "Job alerts",
  robots: { index: false, follow: false, nocache: true },
};

function AlertStatus({
  created,
  removed,
  updated,
}: {
  created?: string;
  removed?: string;
  updated?: string;
}) {
  if (created === "true") {
    return (
      <div className="notice" role="status">
        Alert created.
      </div>
    );
  }
  if (removed === "true") {
    return (
      <div className="notice" role="status">
        Alert removed.
      </div>
    );
  }
  if (updated === "true" || updated === "paused" || updated === "resumed") {
    return (
      <div className="notice" role="status">
        {updated === "paused"
          ? "Alert paused."
          : updated === "resumed"
            ? "Alert resumed."
            : "Alert updated."}
      </div>
    );
  }
  if (created === "error" || removed === "error" || updated === "error") {
    return (
      <div className="notice notice-danger" role="alert">
        The alert could not be changed. Reload, check the fields and try again.
      </div>
    );
  }
  return null;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const status = {
    created: Array.isArray(input.created) ? input.created[0] : input.created,
    removed: Array.isArray(input.removed) ? input.removed[0] : input.removed,
    updated: Array.isArray(input.updated) ? input.updated[0] : input.updated,
  };
  const prefill = parseJobSearch({
    ...input,
    eligibility: input.eligibility ?? "nigeria",
  });
  const returnParameters = serializeJobSearch(prefill);
  await requireViewer(`/alerts?${returnParameters.toString()}`);
  const result = await getAlerts();
  const alerts = result.data;

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Private workspace"
        title="Job alerts"
        description="Save a focused query and receive a private daily or weekly email when newly posted jobs match the selected source evidence."
      />
      <AlertStatus {...status} />
      {status.created === "true" ? (
        <CompanyEvidenceInvitation kind="alert" />
      ) : null}

      <form
        className="surface surface-pad form-grid"
        action="/api/alerts"
        method="post"
      >
        <input
          type="hidden"
          name="search_query"
          value={JSON.stringify(prefill)}
        />
        <div className="field">
          <label htmlFor="keyword">Role or skill</label>
          <input
            className="input"
            id="keyword"
            name="keyword"
            maxLength={160}
            defaultValue={prefill.q}
          />
        </div>
        <div className="field">
          <label htmlFor="location">Location or region</label>
          <input
            className="input"
            id="location"
            name="location"
            maxLength={160}
            defaultValue={prefill.location}
          />
        </div>
        <div className="field">
          <label htmlFor="eligibility">Eligibility</label>
          <select
            className="select"
            id="eligibility"
            name="eligibility"
            defaultValue={prefill.eligibility}
          >
            <option value="nigeria">Nigeria explicitly eligible</option>
            <option value="africa">Africa explicitly eligible</option>
            <option value="worldwide">Worldwide</option>
            <option value="unclear">Unclear</option>
            <option value="all">Any evidence</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cadence">Cadence</label>
          <select className="select" id="cadence" name="cadence">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button className="button w-fit" type="submit">
          Create alert
        </button>
        <p className="field-help m-0">
          All filters from the jobs URL are retained. The primary role, location
          and eligibility fields can be adjusted here.
        </p>
      </form>

      {result.state !== "ready" ? (
        <PrivateDataStatus state={result.state} />
      ) : alerts.length > 0 ? (
        <section className="stack" aria-labelledby="active-alerts">
          <h2 className="section-title" id="active-alerts">
            Saved alerts
          </h2>
          {alerts.map((alert) => {
            const search = parseJobSearch(alert.query);
            return (
              <article className="surface surface-pad stack-lg" key={alert.id}>
                <div className="split">
                  <div className="stack">
                    <div>
                      <h3 className="m-0 text-lg font-bold">
                        {search.q || "Any role"}
                      </h3>
                      <p className="text-muted m-0 text-sm">
                        {search.location || "Any location"} ·{" "}
                        {formatEnum(search.eligibility)} · {alert.cadence} ·
                        created {formatDate(alert.created_at)}
                      </p>
                    </div>
                    <span className="status status-neutral w-fit">
                      {alert.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="cluster">
                    <form action="/api/alerts/update" method="post">
                      <input type="hidden" name="intent" value="set-active" />
                      <input type="hidden" name="id" value={alert.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={alert.active ? "false" : "true"}
                      />
                      <button className="button button-secondary" type="submit">
                        {alert.active ? "Pause alert" : "Resume alert"}
                      </button>
                    </form>
                    <form action="/api/alerts/remove" method="post">
                      <input type="hidden" name="id" value={alert.id} />
                      <button className="button button-quiet" type="submit">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                <details className="stack">
                  <summary className="text-link">Edit alert</summary>
                  <form
                    className="form-grid"
                    action="/api/alerts/update"
                    method="post"
                  >
                    <input type="hidden" name="intent" value="edit" />
                    <input type="hidden" name="id" value={alert.id} />
                    <input
                      type="hidden"
                      name="search_query"
                      value={JSON.stringify(search)}
                    />
                    <div className="field">
                      <label htmlFor={`keyword-${alert.id}`}>
                        Role or skill
                      </label>
                      <input
                        className="input"
                        id={`keyword-${alert.id}`}
                        name="keyword"
                        maxLength={160}
                        defaultValue={search.q}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`location-${alert.id}`}>
                        Location or region
                      </label>
                      <input
                        className="input"
                        id={`location-${alert.id}`}
                        name="location"
                        maxLength={160}
                        defaultValue={search.location}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`eligibility-${alert.id}`}>
                        Eligibility
                      </label>
                      <select
                        className="select"
                        id={`eligibility-${alert.id}`}
                        name="eligibility"
                        defaultValue={search.eligibility}
                      >
                        <option value="nigeria">
                          Nigeria explicitly eligible
                        </option>
                        <option value="africa">
                          Africa explicitly eligible
                        </option>
                        <option value="worldwide">Worldwide</option>
                        <option value="unclear">Unclear</option>
                        <option value="all">Any evidence</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`cadence-${alert.id}`}>Cadence</label>
                      <select
                        className="select"
                        id={`cadence-${alert.id}`}
                        name="cadence"
                        defaultValue={alert.cadence}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    <button className="button w-fit" type="submit">
                      Save alert changes
                    </button>
                  </form>
                </details>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="empty-state">
          <h2 className="section-title">No alerts yet</h2>
          <p>
            Create one focused alert above. SalaryPadi will not match vague
            “remote” wording as Nigeria eligibility.
          </p>
        </div>
      )}
    </div>
  );
}
