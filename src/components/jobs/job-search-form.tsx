import Link from "next/link";

import type { JobSearch } from "@/lib/jobs/search";

export function JobSearchForm({
  search,
  categories,
}: {
  search: JobSearch;
  categories: string[];
}) {
  return (
    <form
      className="job-search surface"
      action="/jobs"
      method="get"
      role="search"
    >
      <div className="job-search-primary">
        <div className="field">
          <label htmlFor="job-keyword">Role, skill or keyword</label>
          <input
            className="input"
            id="job-keyword"
            name="q"
            defaultValue={search.q}
            placeholder="e.g. product designer"
          />
        </div>
        <div className="field">
          <label htmlFor="job-location">Location or region</label>
          <input
            className="input"
            id="job-location"
            name="location"
            defaultValue={search.location}
            placeholder="e.g. Nigeria or Worldwide"
          />
        </div>
        <div className="field">
          <label htmlFor="job-eligibility">Can apply from</label>
          <select
            className="select"
            id="job-eligibility"
            name="eligibility"
            defaultValue={search.eligibility}
          >
            <option value="all">Any evidence</option>
            <option value="nigeria">Nigeria explicitly eligible</option>
            <option value="africa">Africa explicitly eligible</option>
            <option value="worldwide">Worldwide</option>
            <option value="unclear">Eligibility unclear</option>
          </select>
        </div>
        <button className="button" type="submit">
          Search jobs
        </button>
      </div>
      <details className="advanced-filters">
        <summary>More filters</summary>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="company">Company</label>
            <input
              className="input"
              id="company"
              name="company"
              defaultValue={search.company}
            />
          </div>
          <div className="field">
            <label htmlFor="workMode">Work mode</label>
            <select
              className="select"
              id="workMode"
              name="workMode"
              defaultValue={search.workMode}
            >
              <option value="all">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="employmentType">Employment type</label>
            <select
              className="select"
              id="employmentType"
              name="employmentType"
              defaultValue={search.employmentType}
            >
              <option value="all">Any</option>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
              <option value="freelance">Freelance</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="arrangement">Arrangement</label>
            <select
              className="select"
              id="arrangement"
              name="arrangement"
              defaultValue={search.arrangement}
            >
              <option value="all">Any</option>
              <option value="employee">Employee</option>
              <option value="contractor">Contractor</option>
              <option value="freelance">Freelance</option>
              <option value="unknown">Not stated</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="experience">Experience</label>
            <select
              className="select"
              id="experience"
              name="experience"
              defaultValue={search.experience}
            >
              <option value="all">Any</option>
              <option value="entry">Entry / graduate</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / principal</option>
              <option value="executive">Executive</option>
              <option value="unknown">Not stated</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              className="select"
              id="category"
              name="category"
              defaultValue={search.category}
            >
              <option value="all">Any</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="postedWithin">Date posted</label>
            <select
              className="select"
              id="postedWithin"
              name="postedWithin"
              defaultValue={search.postedWithin}
            >
              <option value="all">Any time</option>
              <option value="1">Past 24 hours</option>
              <option value="3">Past 3 days</option>
              <option value="7">Past week</option>
              <option value="14">Past 2 weeks</option>
              <option value="30">Past month</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="currency">Currency</label>
            <select
              className="select"
              id="currency"
              name="currency"
              defaultValue={search.currency}
            >
              <option value="all">Any</option>
              {["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR"].map(
                (currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="field">
            <label htmlFor="minSalary">Minimum annual salary</label>
            <input
              className="input"
              id="minSalary"
              name="minSalary"
              type="number"
              min="0"
              step="1000"
              defaultValue={search.minSalary}
            />
            <p className="field-help">
              Compared only when currency and pay period are explicit.
            </p>
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone overlap</label>
            <input
              className="input"
              id="timezone"
              name="timezone"
              defaultValue={search.timezone}
              placeholder="e.g. GMT+1"
            />
          </div>
          <div className="field">
            <label htmlFor="sort">Sort</label>
            <select
              className="select"
              id="sort"
              name="sort"
              defaultValue={search.sort}
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="salary">Salary</option>
            </select>
          </div>
        </div>
        <fieldset className="checkbox-grid">
          <legend>Additional evidence</legend>
          {[
            ["salaryDisclosed", "Salary disclosed", search.salaryDisclosed],
            ["visaSponsorship", "Visa sponsorship", search.visaSponsorship],
            [
              "relocationSupport",
              "Relocation support",
              search.relocationSupport,
            ],
            ["graduateTrainee", "Graduate trainee", search.graduateTrainee],
            ["internship", "Internship", search.internship],
            ["nyscRequired", "NYSC mentioned", search.nyscRequired],
            ["hndAccepted", "HND mentioned", search.hndAccepted],
            ["bscRequired", "BSc / bachelor mentioned", search.bscRequired],
          ].map(([name, label, checked]) => (
            <label className="checkbox" key={String(name)}>
              <input
                type="checkbox"
                name={String(name)}
                defaultChecked={Boolean(checked)}
              />
              {String(label)}
            </label>
          ))}
        </fieldset>
        <div className="cluster">
          <button className="button" type="submit">
            Apply filters
          </button>
          <Link className="button button-quiet" href="/jobs">
            Clear all
          </Link>
        </div>
      </details>
    </form>
  );
}
