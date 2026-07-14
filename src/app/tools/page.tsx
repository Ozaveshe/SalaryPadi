import type { Metadata } from "next";
import { ArrowUpRight, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { getCareerToolCatalog } from "@/lib/afrotools/catalog-repository";
import { groupCareerTools } from "@/lib/afrotools/tool-presentation";

export const metadata: Metadata = {
  title: "Career decision tools",
  description:
    "Use practical salary, payroll and career tools, with clear boundaries between in-product calculations and AfroTools destinations.",
  alternates: { canonical: "/tools" },
};

export default async function ToolsPage() {
  const catalog = await getCareerToolCatalog();
  const snapshot = catalog.snapshot;
  const grouped = snapshot ? groupCareerTools(snapshot.tools) : null;

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Practical career tools"
        title="Start with the decision you need to make"
        description="Use two calculation experiences inside SalaryPadi or continue to thirteen reviewed AfroTools destinations. Each card describes the outcome, not the plumbing."
      />
      {snapshot ? (
        <div
          className={
            catalog.state === "live" ? "notice" : "notice notice-warning"
          }
          role="status"
        >
          <strong>
            {catalog.state === "live"
              ? "The reviewed tool list is available."
              : catalog.state === "stale"
                ? "Using the last-known reviewed catalog."
                : "Using the reviewed bundled fallback catalog."}
          </strong>{" "}
          {catalog.state === "degraded"
            ? "The refreshed tool list is not currently usable. "
            : null}
          Links and in-product calculations remain separated below.
        </div>
      ) : (
        <div className="notice notice-danger" role="alert">
          <strong>Career tools are temporarily unavailable.</strong> SalaryPadi
          will not present an unreviewed destination as current.
        </div>
      )}

      {grouped ? (
        <>
          <section className="stack" aria-labelledby="inside-tools-heading">
            <div className="section-intro">
              <p className="eyebrow">Use inside SalaryPadi · 2</p>
              <h2 className="section-title" id="inside-tools-heading">
                Keep the calculation in this decision path
              </h2>
              <p className="text-muted m-0">
                SalaryPadi asks for consent before sending the necessary inputs
                to AfroTools and shows the returned evidence or fails closed.
              </p>
            </div>
            <div className="tool-index-grid tool-index-featured">
              {grouped.inside.map((tool) => (
                <article className="surface surface-pad stack" key={tool.id}>
                  <Wrench aria-hidden="true" size={26} />
                  <h3 className="section-title">{tool.title}</h3>
                  <p className="text-muted m-0">{tool.description}</p>
                  <Link className="button w-fit" href={tool.href}>
                    Use in SalaryPadi
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="stack" aria-labelledby="external-tools-heading">
            <div className="section-intro">
              <p className="eyebrow">Continue on AfroTools · 13</p>
              <h2 className="section-title" id="external-tools-heading">
                Open a focused tool for the next task
              </h2>
              <p className="text-muted m-0">
                These links leave SalaryPadi. Review the destination’s sources
                and assumptions before relying on a result.
              </p>
            </div>
            <div className="tool-index-grid tool-index-compact">
              {grouped.external.map((tool) => (
                <article className="surface surface-pad stack" key={tool.id}>
                  <h3 className="m-0 text-lg font-bold">{tool.title}</h3>
                  <p className="text-muted m-0">{tool.description}</p>
                  <a
                    className="text-link w-fit"
                    href={tool.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Continue on AfroTools
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </a>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section
        className="native-tool-callout"
        aria-labelledby="scam-tool-heading"
      >
        <ShieldCheck aria-hidden="true" size={26} />
        <div>
          <p className="eyebrow">SalaryPadi safety tool</p>
          <h2 className="section-title" id="scam-tool-heading">
            Check a vacancy for scam warning signs
          </h2>
          <p className="text-muted m-0">
            The approved local checker analyses only the text and answers you
            enter. It does not fetch the vacancy and it does not verify an
            employer as legitimate.
          </p>
        </div>
        <Link
          className="button button-secondary"
          href="/tools/job-scam-checker"
        >
          Check warning signs
        </Link>
      </section>
    </div>
  );
}
