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
      <p className="text-muted m-0 max-w-2xl text-xs">
        Limitations: only jobs from reviewed, authorized sources are counted;
        jobs whose source does not state a work mode or location are excluded
        from those breakdowns rather than guessed; counts change as sources are
        checked and roles close.
      </p>
    </section>
  );
}
