import { getLiveJobFeed } from "@/lib/jobs/repository";
import { formatDate } from "@/lib/format";
import { publicEnum } from "@/lib/presentation/public-field";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Deterministic counts computed from the current verified job snapshot at
 * request time. No modelling, no extrapolation: every number is a count over
 * the same feed the public jobs page renders, and the section states its
 * scope and limitations alongside the figures.
 */
export async function JobMarketPulse() {
  const feed = await getLiveJobFeed();
  if (feed.jobs.length === 0) return null;

  const jobs = feed.jobs;
  // The snapshot's own freshest check is the time reference, keeping every
  // figure deterministic for a given snapshot.
  const checkedAt = jobs.reduce(
    (latest, job) =>
      Date.parse(job.lastCheckedAt) > Date.parse(latest)
        ? job.lastCheckedAt
        : latest,
    jobs[0]?.lastCheckedAt ?? feed.sources[0]?.checkedAt ?? "",
  );
  const reference = Date.parse(checkedAt);
  const newThisWeek = jobs.filter((job) => {
    const posted = Date.parse(job.postedAt);
    return Number.isFinite(posted) && reference - posted <= WEEK_MS;
  }).length;
  const hiringCompanies = new Set(jobs.map((job) => job.company.slug)).size;
  const disclosed = jobs.filter((job) => job.salary !== null).length;
  const workModes = new Map<string, number>();
  for (const job of jobs) {
    const label = publicEnum(job.workMode);
    if (!label) continue;
    workModes.set(label, (workModes.get(label) ?? 0) + 1);
  }
  const statedWorkModes = [...workModes.entries()].toSorted(
    (a, b) => b[1] - a[1],
  );
  const locations = new Map<string, number>();
  for (const job of jobs) {
    // Some sources append prose or long country enumerations to the location
    // field; the breakdown lists only clean, short stated locations and
    // skips the rest rather than truncating them into something misleading.
    const location = job.locationDisplay.split(/[.<]/, 1)[0]?.trim() ?? "";
    if (!location || location.length > 40) continue;
    locations.set(location, (locations.get(location) ?? 0) + 1);
  }
  const topLocations = [...locations.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Categories, source mix, Africa-eligible remote and closing dates: all
  // plain counts over the same snapshot, each omitted when the underlying
  // field is unstated rather than guessed.
  const categories = new Map<string, number>();
  for (const job of jobs) {
    const category = job.category?.trim();
    if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const topCategories = [...categories.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 6);

  const sourceMix = feed.sources
    .filter((source) => source.count > 0)
    .map((source) => [source.key, source.count] as const)
    .toSorted((a, b) => b[1] - a[1]);

  const africaEligibleRemote = jobs.filter(
    (job) =>
      job.workMode === "remote" &&
      (job.eligibility.nigeria === "eligible" ||
        job.eligibility.africa === "eligible"),
  ).length;

  const withClosingDate = jobs.filter(
    (job) => job.validThrough !== null,
  ).length;
  const closingWithin30Days = jobs.filter((job) => {
    if (!job.validThrough) return false;
    const closes = Date.parse(job.validThrough);
    return (
      Number.isFinite(closes) &&
      closes >= reference &&
      closes - reference <= 30 * 24 * 60 * 60 * 1_000
    );
  }).length;

  return (
    <section className="stack" aria-labelledby="job-market-pulse">
      <h2 className="section-title" id="job-market-pulse">
        Job market pulse
      </h2>
      <p className="text-muted m-0 max-w-2xl text-sm">
        Counts over the current verified snapshot ({jobs.length} active jobs
        across {feed.sources.filter((s) => s.state === "live").length} live
        sources, most recently checked {formatDate(checkedAt)}). These are
        counts of what SalaryPadi can verify — not an estimate of the whole
        market, and not a forecast.
      </p>
      <div className="feature-grid" aria-label="Snapshot counts">
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">Active verified jobs</p>
          <p className="m-0 text-3xl font-bold">
            {jobs.length.toLocaleString("en-NG")}
          </p>
        </article>
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">Posted in the last 7 days</p>
          <p className="m-0 text-3xl font-bold">
            {newThisWeek.toLocaleString("en-NG")}
          </p>
        </article>
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">Companies hiring</p>
          <p className="m-0 text-3xl font-bold">
            {hiringCompanies.toLocaleString("en-NG")}
          </p>
        </article>
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">State a salary</p>
          <p className="m-0 text-3xl font-bold">
            {disclosed.toLocaleString("en-NG")}
            <span className="text-muted text-base font-normal">
              {" "}
              of {jobs.length} ({Math.round((disclosed / jobs.length) * 100)}%)
            </span>
          </p>
        </article>
      </div>
      {statedWorkModes.length > 0 ? (
        <div className="stack-sm">
          <h3 className="m-0 text-base font-bold">
            Work mode, where the source states one
          </h3>
          <ul className="pulse-bars">
            {statedWorkModes.map(([label, count]) => (
              <li key={label}>
                <span>{label}</span>
                <span
                  className="pulse-bar"
                  style={{
                    width: `${Math.max(4, Math.round((count / jobs.length) * 100))}%`,
                  }}
                  aria-hidden="true"
                />
                <span>{count.toLocaleString("en-NG")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {topLocations.length > 0 ? (
        <div className="stack-sm">
          <h3 className="m-0 text-base font-bold">
            Most common stated locations
          </h3>
          <ul className="pulse-bars">
            {topLocations.map(([label, count]) => (
              <li key={label}>
                <span>{label}</span>
                <span
                  className="pulse-bar"
                  style={{
                    width: `${Math.max(4, Math.round((count / jobs.length) * 100))}%`,
                  }}
                  aria-hidden="true"
                />
                <span>{count.toLocaleString("en-NG")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {topCategories.length > 0 ? (
        <div className="stack-sm">
          <h3 className="m-0 text-base font-bold">
            Most common categories, where the source states one
          </h3>
          <ul className="pulse-bars">
            {topCategories.map(([label, count]) => (
              <li key={label}>
                <span>{label}</span>
                <span
                  className="pulse-bar"
                  style={{
                    width: `${Math.max(4, Math.round((count / jobs.length) * 100))}%`,
                  }}
                  aria-hidden="true"
                />
                <span>{count.toLocaleString("en-NG")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sourceMix.length > 0 ? (
        <div className="stack-sm">
          <h3 className="m-0 text-base font-bold">
            Where these jobs come from
          </h3>
          <ul className="pulse-bars">
            {sourceMix.map(([label, count]) => (
              <li key={label}>
                <span>{label}</span>
                <span
                  className="pulse-bar"
                  style={{
                    width: `${Math.max(4, Math.round((count / jobs.length) * 100))}%`,
                  }}
                  aria-hidden="true"
                />
                <span>{count.toLocaleString("en-NG")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="feature-grid" aria-label="Eligibility and deadlines">
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">Remote and explicitly open to Africa</p>
          <p className="m-0 text-3xl font-bold">
            {africaEligibleRemote.toLocaleString("en-NG")}
          </p>
          <p className="text-muted m-0 text-sm">
            Remote roles whose source names Nigeria or Africa as eligible.
            Generic &quot;remote&quot; wording is never counted here.
          </p>
        </article>
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">State a closing date</p>
          <p className="m-0 text-3xl font-bold">
            {withClosingDate.toLocaleString("en-NG")}
          </p>
          <p className="text-muted m-0 text-sm">
            {closingWithin30Days.toLocaleString("en-NG")} of them close within
            30 days of the last check. Most sources publish no deadline.
          </p>
        </article>
      </div>
      <p className="text-muted m-0 max-w-2xl text-xs">
        <strong>Scope:</strong> every figure is a count over the one verified
        snapshot described above — {jobs.length} active jobs from reviewed,
        authorized sources. <strong>Period:</strong> the snapshot as last
        checked {formatDate(checkedAt)}; &quot;posted in the last 7 days&quot;
        and the closing-date window are measured from that check, so the figures
        are stable for a given snapshot. <strong>Limitations:</strong> jobs
        whose source does not state a work mode, location, category or closing
        date are excluded from those breakdowns rather than guessed; this is not
        an estimate of the whole market and not a forecast; counts change as
        sources are re-checked and roles close. Expired jobs and skills
        extraction are not reported here because SalaryPadi does not yet hold
        those to a publishable standard.
      </p>
    </section>
  );
}
