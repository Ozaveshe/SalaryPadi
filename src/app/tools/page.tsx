import type { Metadata } from "next";
import { ArrowUpRight, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";

import { BrandArt } from "@/components/media/brand-art";
import { PageHeading } from "@/components/page-heading";
import { getCareerToolCatalog } from "@/lib/afrotools/catalog-repository";
import { groupCareerTools } from "@/lib/afrotools/tool-presentation";

export const metadata: Metadata = {
  title: "Career decision tools",
  description:
    "Choose practical career tools for applying, understanding pay, comparing offers and planning your next move.",
  alternates: { canonical: "/tools" },
};

export default async function ToolsPage() {
  const catalog = await getCareerToolCatalog();
  const snapshot = catalog.snapshot;
  const grouped = groupCareerTools(snapshot?.tools ?? [], {
    catalogAvailable: snapshot !== null,
  });

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Practical career tools"
        title="Start with the career moment you are in"
        description="Check an opportunity, understand the pay, compare an offer or plan what comes next. Every card says whether the experience stays in SalaryPadi or opens AfroTools."
      />
      <BrandArt className="page-art" id="tools-index" />

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
          Provider destinations below come only from that reviewed list.
        </div>
      ) : (
        <div className="notice notice-danger" role="alert">
          <strong>Career tools are temporarily unavailable.</strong> SalaryPadi
          will not present an unreviewed AfroTools destination as current. Its
          own calculators, evidence and warning-sign checker remain available
          below.
        </div>
      )}

      <section
        className="tool-handoffs stack"
        aria-labelledby="tool-handoffs-heading"
      >
        <div>
          <p className="eyebrow">Clear handoffs</p>
          <h2 className="section-title" id="tool-handoffs-heading">
            Know where the next step happens
          </h2>
        </div>
        <dl className="data-list">
          <div>
            <dt>Runs in SalaryPadi · {grouped.inside.length}</dt>
            <dd>
              The page and result stay in SalaryPadi. A calculation may request
              reviewed AfroTools evidence only after explaining the data handoff
              and asking for any required consent.
            </dd>
          </div>
          <div>
            <dt>Opens AfroTools · {grouped.external.length}</dt>
            <dd>
              The link leaves SalaryPadi for a focused external tool. Check its
              displayed sources, dates and assumptions before relying on the
              result.
            </dd>
          </div>
        </dl>
      </section>

      {grouped.moments.map((moment) => (
        <section
          className="rule-section stack"
          aria-labelledby={`career-moment-${moment.id}`}
          key={moment.id}
        >
          <div className="section-intro">
            <p className="eyebrow">{moment.eyebrow}</p>
            <h2 className="section-title" id={`career-moment-${moment.id}`}>
              {moment.title}
            </h2>
            <p className="text-muted m-0">{moment.description}</p>
          </div>
          <div className="tool-index-grid">
            {moment.tools.map((tool) => (
              <article className="surface surface-pad stack" key={tool.id}>
                <div className="split">
                  {tool.source === "salarypadi_native" ? (
                    <ShieldCheck aria-hidden="true" size={26} />
                  ) : (
                    <Wrench aria-hidden="true" size={26} />
                  )}
                  <span className="status status-neutral">
                    {tool.disclosure}
                  </span>
                </div>
                <h3 className="m-0 text-lg font-bold">{tool.title}</h3>
                <p className="text-muted m-0">{tool.description}</p>
                {tool.destination === "salarypadi" ? (
                  <Link className="button w-fit" href={tool.href}>
                    {tool.actionLabel}
                  </Link>
                ) : (
                  <a
                    className="button button-secondary w-fit"
                    href={tool.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {tool.actionLabel}
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
