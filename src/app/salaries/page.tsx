import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { searchSalaryAggregates } from "@/lib/salaries/repository";

export const metadata: Metadata = {
  title: "Salary intelligence",
  description:
    "Search privacy-thresholded, confidence-labelled salary evidence by role, company and country.",
  alternates: { canonical: "/salaries" },
  robots: { index: false, follow: true },
};

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const role = typeof input.role === "string" ? input.role.slice(0, 120) : "";
  const country =
    typeof input.country === "string" ? input.country.slice(0, 2) : "NG";
  const company =
    typeof input.company === "string" ? input.company.slice(0, 120) : "";
  const hasSearch = Boolean(role || company);
  const results = hasSearch
    ? await searchSalaryAggregates({ role, country, company })
    : [];
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Salary intelligence"
        title="Compare pay without exposing a person"
        description="Search approved aggregates. Original currency, pay period, location, sample size, date range and confidence stay visible."
      />
      <form
        className="home-search"
        action="/salaries"
        method="get"
        role="search"
      >
        <div className="field">
          <label htmlFor="salary-role">Role</label>
          <input
            className="input"
            id="salary-role"
            name="role"
            defaultValue={role}
            placeholder="e.g. product manager"
          />
        </div>
        <div className="field">
          <label htmlFor="salary-company">Company (optional)</label>
          <input
            className="input"
            id="salary-company"
            name="company"
            defaultValue={company}
          />
        </div>
        <div className="field">
          <label htmlFor="salary-country">Country</label>
          <select
            className="select"
            id="salary-country"
            name="country"
            defaultValue={country}
          >
            <option value="NG">Nigeria</option>
            <option value="GH">Ghana</option>
            <option value="KE">Kenya</option>
            <option value="ZA">South Africa</option>
          </select>
        </div>
        <button className="button" type="submit">
          Search salaries
        </button>
      </form>
      {results.length > 0 ? (
        <section className="stack" aria-labelledby="salary-results">
          <h2 className="section-title" id="salary-results">
            Published aggregates
          </h2>
          <div className="aggregate-grid">
            {results.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <h2 className="section-title">
            {hasSearch
              ? "No safe aggregate matches yet"
              : "Search a role to begin"}
          </h2>
          <p>
            {hasSearch
              ? "The data may be too sparse, still pending moderation, or absent. SalaryPadi does not invent a market number."
              : "Employer-role-country cells require at least three sufficiently similar approved contributions from distinct accounts."}
          </p>
          <div className="cluster">
            <Link className="button" href="/contribute/salary">
              Contribute salary privately
            </Link>
            <Link className="button button-secondary" href="/methodology">
              Read the methodology
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
