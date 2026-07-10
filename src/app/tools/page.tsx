import type { Metadata } from "next";
import { BadgeDollarSign, BriefcaseBusiness, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = {
  title: "Career decision tools",
  description:
    "Calculate Nigeria take-home pay, compare offers and screen job warning signs.",
  alternates: { canonical: "/tools" },
};

const tools = [
  [
    "Nigeria take-home pay",
    "/tools/take-home-pay",
    "Versioned 2026 PAYE, explicit pension/NHF/health inputs and a full breakdown.",
    BadgeDollarSign,
  ],
  [
    "Offer compare",
    "/tools/offer-compare",
    "Normalize two offers across pay, benefits, work costs, currencies and contract terms.",
    BriefcaseBusiness,
  ],
  [
    "Job scam checker",
    "/tools/job-scam-checker",
    "Explainable warning flags and verification steps, with no URL fetching.",
    ShieldAlert,
  ],
] as const;

export default function ToolsPage() {
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Practical career tools"
        title="Move from a number to a decision"
        description="Each tool exposes its assumptions and limits. No AI-generated salary figure or hidden market claim is used."
      />
      <div className="tool-index-grid">
        {tools.map(([title, href, description, Icon]) => (
          <article className="surface surface-pad stack" key={href}>
            <Icon aria-hidden="true" size={28} />
            <h2 className="section-title">{title}</h2>
            <p className="text-muted m-0">{description}</p>
            <Link className="button button-secondary w-fit" href={href}>
              Open tool
            </Link>
          </article>
        ))}
      </div>
      <div className="notice">
        <strong>Future, not fabricated:</strong> negotiation assistance,
        interview coaching, skills-gap analysis, freelance rates and
        visa-sponsored search will be built only when they can be grounded in
        real SalaryPadi or official data. AfroTools remains the CV Builder
        integration path.
      </div>
    </div>
  );
}
