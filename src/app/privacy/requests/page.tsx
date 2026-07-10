import type { Metadata } from "next";

import { PageHeading } from "@/components/page-heading";
import { requireViewer } from "@/lib/auth/dal";
import { formatDate, formatEnum } from "@/lib/format";
import { getMyPrivacyRequests } from "@/lib/privacy/repository";

export const metadata: Metadata = {
  title: "Privacy requests",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PrivacyRequestsPage() {
  await requireViewer("/privacy/requests");
  const requests = await getMyPrivacyRequests();
  return (
    <div className="reading-shell stack-lg">
      <PageHeading
        eyebrow="Private account control"
        title="Request an export, correction or deletion"
        description="Requests are linked to your signed-in account, rate-limited and visible only to you and authorised privacy operators."
      />
      <form
        className="surface surface-pad form-grid"
        action="/api/privacy-requests"
        method="post"
      >
        <div className="field">
          <label htmlFor="privacy-kind">Request type</label>
          <select className="select" id="privacy-kind" name="kind" required>
            <option value="data_export">Export my data</option>
            <option value="correction">Correct my data</option>
            <option value="contribution_deletion">Delete a contribution</option>
            <option value="account_deletion">Delete my account</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="privacy-target">
            Contribution ID (when applicable)
          </label>
          <input
            className="input"
            id="privacy-target"
            name="target_id"
            placeholder="UUID shown in your contribution history"
          />
        </div>
        <div className="field form-full">
          <label htmlFor="privacy-details">Minimum necessary details</label>
          <textarea
            className="textarea"
            id="privacy-details"
            name="details"
            maxLength={1000}
            placeholder="Describe the correction or identify the record without pasting sensitive documents."
          />
        </div>
        <label className="checkbox-row form-full">
          <input name="confirm" type="checkbox" value="yes" />
          <span>
            I understand that an account-deletion request immediately places my
            account into deletion-pending state and revokes staff roles.
          </span>
        </label>
        <button className="button w-fit" type="submit">
          Submit private request
        </button>
      </form>
      <section className="stack" aria-labelledby="privacy-history">
        <h2 className="section-title" id="privacy-history">
          Request history
        </h2>
        {requests.length > 0 ? (
          <div className="stack">
            {requests.map((request) => (
              <article className="private-row" key={request.id}>
                <div>
                  <h3 className="m-0 text-lg font-bold">
                    {formatEnum(request.kind)}
                  </h3>
                  <p>Requested {formatDate(request.requested_at)}</p>
                </div>
                <span className="status status-neutral">
                  {formatEnum(request.status)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">No privacy requests yet</h3>
            <p>
              Your submitted requests and their current status will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
