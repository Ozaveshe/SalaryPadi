import { PageHeading } from "@/components/page-heading";
import { CombinedRepositoryNotice } from "@/components/repository-notice";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate, formatEnum } from "@/lib/format";
import {
  getEmployerFeedHealthResult,
  getJobSupplyHealthResult,
  getProductionHealthResult,
} from "@/lib/operations/production-health";

function recorded(value: number | null) {
  return value === null ? "Not recorded" : value.toLocaleString("en-NG");
}

export default async function SourceHealthPage() {
  await requireAdmin();
  const [healthResult, supplyResult, feedResult] = await Promise.all([
    getProductionHealthResult(),
    getJobSupplyHealthResult(),
    getEmployerFeedHealthResult(),
  ]);
  const health = healthResult.data;
  const supply = supplyResult.data;
  const feedHealth = feedResult.data;

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected operations"
        title="Source and worker health"
        description="Fourteen-day source evidence, schedule execution, policy gates and durable failures. Missing historical metrics remain visibly unrecorded."
      />

      <CombinedRepositoryNotice
        results={[healthResult, supplyResult, feedResult]}
        resource="Operational evidence"
      />

      {feedHealth ? (
        <section className="stack" aria-labelledby="employer-feed-health">
          <h2 className="section-title" id="employer-feed-health">
            Employer feeds
          </h2>
          <p className="text-muted m-0 max-w-3xl text-sm">
            Every feed-shaped source config, authorized or not, with the reason
            it is not running. Global policies:{" "}
            {feedHealth.global_policies.length === 0
              ? "not registered"
              : feedHealth.global_policies
                  .map((policy) => `${policy.adapter_key} ${policy.status}`)
                  .join(", ")}
            .
          </p>
          {feedHealth.feeds.length === 0 ? (
            <p className="surface surface-pad m-0">
              No employer feed is configured. No employer has authorized a feed,
              so nothing runs and no record has been processed by this path.
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Feed</th>
                    <th>Employer</th>
                    <th>Kind</th>
                    <th>Authorization</th>
                    <th>Next review</th>
                    <th>Open jobs</th>
                    <th>Last attempt</th>
                    <th>Outcome</th>
                    <th>Last complete</th>
                    <th>Fetched</th>
                    <th>Accepted</th>
                    <th>Filtered</th>
                    <th>Quarantined</th>
                    <th>Dropped</th>
                    <th>Inserted</th>
                    <th>Updated</th>
                    <th>Unchanged</th>
                    <th>Closed</th>
                    <th>Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {feedHealth.feeds.map((feed) => (
                    <tr key={feed.adapter_key}>
                      <td>{feed.source_name}</td>
                      <td>{feed.employer_name}</td>
                      <td>{formatEnum(feed.feed_kind)}</td>
                      <td>{formatEnum(feed.authorization_state)}</td>
                      <td>
                        {feed.next_rights_review
                          ? formatDate(feed.next_rights_review)
                          : "Not recorded"}
                      </td>
                      <td>{feed.current_job_count.toLocaleString("en-NG")}</td>
                      <td>
                        {feed.last_attempt_at
                          ? formatDate(feed.last_attempt_at)
                          : "Never run"}
                      </td>
                      <td>
                        {feed.last_outcome
                          ? `${formatEnum(feed.last_outcome)}${
                              feed.last_snapshot_complete === false
                                ? " (partial)"
                                : ""
                            }`
                          : "Never run"}
                      </td>
                      <td>
                        {feed.last_complete_snapshot_at
                          ? formatDate(feed.last_complete_snapshot_at)
                          : "None"}
                      </td>
                      <td>{recorded(feed.fetched)}</td>
                      <td>{recorded(feed.accepted)}</td>
                      <td>{recorded(feed.filtered)}</td>
                      <td>{recorded(feed.quarantined)}</td>
                      <td>{recorded(feed.destination_dropped)}</td>
                      <td>{recorded(feed.inserted)}</td>
                      <td>{recorded(feed.updated)}</td>
                      <td>{recorded(feed.unchanged)}</td>
                      <td>{recorded(feed.closed)}</td>
                      <td>{feed.last_error_code ?? "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {supply ? (
        <>
          <section className="stack" aria-labelledby="job-supply-seven-day">
            <h2 className="section-title" id="job-supply-seven-day">
              Seven-day canonical supply
            </h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Daily target</th>
                    <th>Authorized capacity</th>
                    <th>New canonical jobs</th>
                    <th>Raw occurrences</th>
                    <th>Quality queue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {supply.target_daily_new_canonical.toLocaleString(
                        "en-NG",
                      )}
                    </td>
                    <td>
                      {supply.authorized_daily_capacity.toLocaleString("en-NG")}
                    </td>
                    <td>
                      {supply.seven_day_new_canonical.toLocaleString("en-NG")}
                    </td>
                    <td>
                      {supply.seven_day_raw_occurrences.toLocaleString("en-NG")}
                    </td>
                    <td>
                      {supply.pending_fuzzy_reviews.toLocaleString("en-NG")}{" "}
                      fuzzy ·{" "}
                      {supply.broken_apply_links.toLocaleString("en-NG")} broken
                      links
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted">
              Capacity counts only reviewed, runnable source policies with an
              evidenced daily estimate. Raw imports never count toward the
              200-job target.
            </p>
          </section>

          <section className="stack" aria-labelledby="job-supply-rights">
            <h2 className="section-title" id="job-supply-rights">
              Source rights and canonical yield
            </h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Rights state</th>
                    <th>Review due</th>
                    <th>7-day yield</th>
                    <th>7-day run quality</th>
                    <th>Dependencies</th>
                  </tr>
                </thead>
                <tbody>
                  {supply.sources.map((source) => (
                    <tr key={source.adapter_key}>
                      <td>
                        <strong>{source.name}</strong>
                        <span>{formatEnum(source.authority)}</span>
                      </td>
                      <td>
                        <span className="status status-neutral">
                          {source.runnable
                            ? "Runnable"
                            : formatEnum(source.policy_state)}
                        </span>
                      </td>
                      <td>{formatDate(source.review_due_at ?? "")}</td>
                      <td>
                        {source.new_canonical_jobs.toLocaleString("en-NG")}{" "}
                        canonical ·{" "}
                        {source.raw_occurrences.toLocaleString("en-NG")}{" "}
                        occurrences
                      </td>
                      <td>
                        <span>
                          {source.run_count.toLocaleString("en-NG")} runs ·{" "}
                          {formatEnum(source.last_run_status ?? "never")} ·
                          fetched {source.fetched.toLocaleString("en-NG")} ·
                          accepted {recorded(source.accepted)} · duplicates{" "}
                          {recorded(source.duplicates)} · rejected{" "}
                          {recorded(source.rejected)} · closed{" "}
                          {source.closed.toLocaleString("en-NG")} · errors{" "}
                          {source.errors.toLocaleString("en-NG")}
                        </span>
                      </td>
                      <td>
                        {source.missing_dependencies.length > 0
                          ? source.missing_dependencies
                              .map(formatEnum)
                              .join(", ")
                          : "Complete"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {health ? (
        <>
          <section className="stack" aria-labelledby="source-health-sources">
            <h2 className="section-title" id="source-health-sources">
              Active source policies
            </h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Policy</th>
                    <th>Last run</th>
                    <th>Latest counts</th>
                  </tr>
                </thead>
                <tbody>
                  {health.sources.map((source) => {
                    const latest = source.runs[0];
                    return (
                      <tr key={source.adapter_key}>
                        <td>
                          <strong>{source.name}</strong>
                          <span>{source.adapter_key}</span>
                        </td>
                        <td>
                          <span>
                            List {source.allow_public_listing ? "yes" : "no"} ·
                            index {source.may_index_jobs ? "yes" : "no"} ·
                            schema{" "}
                            {source.may_emit_jobposting_schema ? "yes" : "no"}
                          </span>
                        </td>
                        <td>
                          {latest ? (
                            <>
                              <span className="status status-neutral">
                                {formatEnum(latest.status)}
                              </span>
                              <span>{formatDate(latest.started_at ?? "")}</span>
                            </>
                          ) : (
                            "No run recorded"
                          )}
                        </td>
                        <td>
                          {latest ? (
                            <span>
                              fetched {latest.fetched.toLocaleString("en-NG")} ·
                              accepted {recorded(latest.accepted)} · duplicates{" "}
                              {recorded(latest.duplicates)} · errors{" "}
                              {latest.errors}
                            </span>
                          ) : (
                            "Not available"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="stack" aria-labelledby="source-health-workers">
            <h2 className="section-title" id="source-health-workers">
              Scheduler execution
            </h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Freshness</th>
                    <th>Last status</th>
                    <th>Last execution</th>
                    <th>Last success</th>
                  </tr>
                </thead>
                <tbody>
                  {health.workers.map((worker) => (
                    <tr key={worker.task_key}>
                      <td>{worker.task_key}</td>
                      <td>
                        <span className="status status-neutral">
                          {formatEnum(worker.freshness)}
                        </span>
                      </td>
                      <td>{formatEnum(worker.last_status ?? "never")}</td>
                      <td>{formatDate(worker.last_started_at ?? "")}</td>
                      <td>{formatDate(worker.last_success_at ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="stack" aria-labelledby="source-health-alerts">
            <h2 className="section-title" id="source-health-alerts">
              Open operational alerts
            </h2>
            {health.open_alerts.length === 0 ? (
              <div className="empty-state">No open durable alerts.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Severity</th>
                      <th>Code</th>
                      <th>Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.open_alerts.map((alert) => (
                      <tr
                        key={`${alert.task_key}:${alert.error_code}:${alert.created_at}`}
                      >
                        <td>{alert.task_key}</td>
                        <td>{formatEnum(alert.severity)}</td>
                        <td>{alert.error_code}</td>
                        <td>{formatDate(alert.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
