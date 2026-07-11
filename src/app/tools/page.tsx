import type { Metadata } from "next";
import { ArrowUpRight, Wrench } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { getCareerToolCatalog } from "@/lib/afrotools/catalog-repository";

export const metadata: Metadata = {
  title: "Career decision tools",
  description:
    "A synchronized directory of AfroTools-powered salary, payroll and career tools with visible freshness and provenance.",
  alternates: { canonical: "/tools" },
};

const integratedRoutes: Record<string, string> = {
  "ng-paye": "/tools/take-home-pay",
  "currency-converter": "/tools/salary-converter",
  "job-offer-evaluator": "/tools/offer-compare",
};

export default async function ToolsPage() {
  const catalog = await getCareerToolCatalog();
  const snapshot = catalog.snapshot;
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Practical career tools"
        title="Move from a number to a decision"
        description="SalaryPadi synchronizes this directory from the deployed AfroTools catalog. Integrated tools show their API evidence; other tools open on AfroTools."
      />
      {snapshot ? (
        <div
          className={
            catalog.state === "stale" ? "notice notice-warning" : "notice"
          }
          role="status"
        >
          <strong>
            {catalog.state === "live"
              ? "Catalog verified"
              : "Last-known-good catalog"}
          </strong>
          <p>
            Source checked {new Date(snapshot.checkedAt).toLocaleString()}.
            Catalog updated {snapshot.catalogLastUpdated}.{" "}
            {catalog.cache === "bundled_lkg"
              ? "Using the bundled last-known-good snapshot."
              : "Using the synchronized cache."}
          </p>
          <a href={snapshot.sourceUrl}>View source catalog</a>
        </div>
      ) : (
        <div className="notice notice-danger" role="alert">
          <strong>Tools catalog unavailable</strong>
          <p>
            The catalog is missing or older than 30 days, so SalaryPadi will not
            present unverified tools as live.
          </p>
        </div>
      )}
      {snapshot ? (
        <div className="tool-index-grid">
          {snapshot.tools.map((tool) => {
            const localRoute = integratedRoutes[tool.id];
            const href =
              localRoute ??
              new URL(tool.url, "https://afrotools.com").toString();
            return (
              <article className="surface surface-pad stack" key={tool.id}>
                <Wrench aria-hidden="true" size={26} />
                <h2 className="section-title">{tool.name}</h2>
                <p className="text-muted m-0">{tool.description}</p>
                <p className="field-help">
                  Source: AfroTools · Updated {tool.last_updated} ·{" "}
                  {tool.countries.includes("ALL")
                    ? "Africa-wide"
                    : tool.countries.join(", ")}
                </p>
                {localRoute ? (
                  <Link className="button button-secondary w-fit" href={href}>
                    Open integrated tool
                  </Link>
                ) : (
                  <a
                    className="button button-secondary w-fit"
                    href={href}
                    rel="noopener noreferrer"
                  >
                    Open on AfroTools{" "}
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </a>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
