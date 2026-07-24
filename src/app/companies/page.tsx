import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

import { CompanyLogo } from "@/components/companies/company-logo";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getCompaniesResult } from "@/lib/companies/repository";
import { countryAlternates } from "@/lib/country-packs/routing";
import { getAppOrigin } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { canIndexCompanyHub } from "@/lib/seo/indexability";

const PAGE_SIZE = 30;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const getCompaniesPageResult = cache(() => getCompaniesResult());

type DirectoryParams = {
  q?: string | string[];
  letter?: string | string[];
  hiring?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function parseDirectoryParams(input: DirectoryParams) {
  const q = single(input.q).trim().slice(0, 120);
  const letterInput = single(input.letter).toUpperCase();
  const letter = LETTERS.includes(letterInput) ? letterInput : "";
  const hiring = single(input.hiring) === "true";
  const pageNumber = Number.parseInt(single(input.page), 10);
  const page = Number.isFinite(pageNumber) && pageNumber > 1 ? pageNumber : 1;
  return { q, letter, hiring, page };
}

function directoryHref(
  filters: { q: string; letter: string; hiring: boolean },
  page?: number,
) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.letter) params.set("letter", filters.letter);
  if (filters.hiring) params.set("hiring", "true");
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/companies?${query}` : "/companies";
}

export async function generateMetadata(): Promise<Metadata> {
  const result = await getCompaniesPageResult();
  return {
    title: "Companies",
    description:
      "Search employers hiring across Africa. Inspect source-labelled facts, current jobs and safely published community intelligence.",
    alternates: {
      canonical: "/companies",
      languages: countryAlternates(getAppOrigin(), "/companies").languages,
    },
    robots: { index: canIndexCompanyHub(result), follow: true },
  };
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<DirectoryParams>;
}) {
  const filters = parseDirectoryParams(await searchParams);
  const result = await getCompaniesPageResult();
  const all = result.data;

  const query = filters.q.toLowerCase();
  const filtered = all.filter((company) => {
    if (filters.hiring && company.activeJobs.length === 0) return false;
    if (
      filters.letter &&
      !company.name.toUpperCase().startsWith(filters.letter)
    ) {
      return false;
    }
    if (!query) return true;
    return (
      company.name.toLowerCase().includes(query) ||
      (company.industry ?? "").toLowerCase().includes(query) ||
      company.categories.some((category) =>
        category.toLowerCase().includes(query),
      )
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const presentLetters = new Set(
    all.map((company) => company.name.charAt(0).toUpperCase()),
  );

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Company intelligence"
        title="Know more before you accept"
        description="Search employers, start with current vacancies, then look for approved salary, workplace and interview evidence. Missing data stays missing."
      />
      <RepositoryNotice result={result} resource="Company records" />

      <form className="filter-bar" action="/companies" method="get">
        <div className="field">
          <label htmlFor="company-search">Company, industry or category</label>
          <input
            className="input"
            id="company-search"
            name="q"
            maxLength={120}
            defaultValue={filters.q}
            placeholder="e.g. Moniepoint, fintech, engineering"
          />
        </div>
        <label className="checkbox-label" htmlFor="company-hiring">
          <input
            type="checkbox"
            id="company-hiring"
            name="hiring"
            value="true"
            defaultChecked={filters.hiring}
          />
          Hiring now
        </label>
        <button className="button" type="submit">
          Search companies
        </button>
      </form>

      <nav className="letter-index" aria-label="Companies by first letter">
        <Link
          className={filters.letter === "" ? "is-active" : undefined}
          href={directoryHref({ ...filters, letter: "" })}
        >
          All
        </Link>
        {LETTERS.map((letter) =>
          presentLetters.has(letter) ? (
            <Link
              className={filters.letter === letter ? "is-active" : undefined}
              href={directoryHref({ ...filters, letter })}
              key={letter}
            >
              {letter}
            </Link>
          ) : (
            <span aria-hidden="true" key={letter}>
              {letter}
            </span>
          ),
        )}
      </nav>

      {pageItems.length > 0 ? (
        <>
          <p className="text-muted m-0 text-sm" role="status">
            {filtered.length} {filtered.length === 1 ? "company" : "companies"}
            {filters.q ? ` matching “${filters.q}”` : ""}
            {filters.letter ? ` starting with ${filters.letter}` : ""}
            {filters.hiring ? " hiring now" : ""}
          </p>
          <div className="company-list">
            {pageItems.map((company) => (
              <article className="company-row" key={company.slug}>
                <CompanyLogo
                  name={company.name}
                  size={40}
                  slug={company.slug}
                />
                <div>
                  <h2>
                    <Link href={`/companies/${company.slug}`}>
                      {company.name}
                    </Link>
                  </h2>
                  {company.industry || company.categories.length > 0 ? (
                    <p>{company.industry || company.categories.join(", ")}</p>
                  ) : null}
                </div>
                <div className="company-row-meta">
                  <strong>{company.activeJobs.length}</strong>
                  <span>
                    active {company.activeJobs.length === 1 ? "job" : "jobs"}
                  </span>
                </div>
                <div className="company-row-meta">
                  <span>Checked</span>
                  <strong>{formatDate(company.lastCheckedAt)}</strong>
                </div>
              </article>
            ))}
          </div>
          {totalPages > 1 ? (
            <nav className="pagination" aria-label="Company pages">
              <span>
                {page > 1 ? (
                  <Link href={directoryHref(filters, page - 1)}>
                    ← Previous
                  </Link>
                ) : null}
              </span>
              <span>
                Page {page} of {totalPages}
              </span>
              <span>
                {page < totalPages ? (
                  <Link href={directoryHref(filters, page + 1)}>Next →</Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </>
      ) : result.state === "ready" ? (
        <div className="empty-state">
          <h2 className="section-title">
            {all.length > 0
              ? "No companies match this search"
              : "No company profiles are published yet"}
          </h2>
          <p>
            {all.length > 0
              ? "Try a shorter name, a different industry keyword, or clear the filters."
              : "The connected directory returned no approved records. This is a confirmed empty state; it is not being filled with invented company facts."}
          </p>
          <div className="cluster">
            {all.length > 0 ? (
              <Link className="button button-secondary" href="/companies">
                Clear filters
              </Link>
            ) : (
              <>
                <Link className="button button-secondary" href="/contribute">
                  Add company evidence
                </Link>
                <Link className="button button-quiet" href="/methodology">
                  Read the evidence policy
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
