import type { Metadata } from "next";

import { PageHeading } from "@/components/page-heading";
import { requireViewer } from "@/lib/auth/dal";
import { getAlerts } from "@/lib/career/repository";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Job alerts",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AlertsPage() {
  await requireViewer("/alerts");
  const alerts = await getAlerts();
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Private workspace"
        title="Job alerts"
        description="Save a focused query and return when matching source evidence changes. Email delivery requires the production mail provider."
      />
      <form
        className="surface surface-pad form-grid"
        action="/api/alerts"
        method="post"
      >
        <div className="field">
          <label htmlFor="keyword">Role or skill</label>
          <input
            className="input"
            id="keyword"
            name="keyword"
            maxLength={160}
          />
        </div>
        <div className="field">
          <label htmlFor="location">Location or region</label>
          <input
            className="input"
            id="location"
            name="location"
            maxLength={160}
          />
        </div>
        <div className="field">
          <label htmlFor="eligibility">Eligibility</label>
          <select
            className="select"
            id="eligibility"
            name="eligibility"
            defaultValue="nigeria"
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
      </form>
      {alerts.length > 0 ? (
        <section className="stack" aria-labelledby="active-alerts">
          <h2 className="section-title" id="active-alerts">
            Saved alerts
          </h2>
          {alerts.map((alert) => (
            <article className="private-row" key={alert.id}>
              <div>
                <h3 className="m-0 text-lg font-bold">
                  {String(alert.query.q || "Any role")} ·{" "}
                  {String(alert.query.eligibility || "any eligibility")}
                </h3>
                <p>
                  {alert.cadence} · created {formatDate(alert.created_at)} ·{" "}
                  {alert.active ? "active" : "paused"}
                </p>
              </div>
              <form action="/api/alerts/remove" method="post">
                <input type="hidden" name="id" value={alert.id} />
                <button className="button button-quiet" type="submit">
                  Remove
                </button>
              </form>
            </article>
          ))}
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
