import type { Metadata } from "next";
import { BriefcaseBusiness, Building2, MessagesSquare } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = {
  title: "For employers",
  description:
    "Post an authorised vacancy, claim your company profile, or request a right of reply on SalaryPadi.",
  alternates: { canonical: "/for-employers" },
};

/**
 * Employer actions live on their own route so the candidate contribution
 * flow is not competing with hiring-side calls to action.
 */
export default function ForEmployersPage() {
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="For employers"
        title="Publish, claim or respond with evidence"
        description="A claim or reply request starts a human review. Neither route creates a verification badge automatically, and community evidence is never removed merely because an employer disagrees with it."
      />
      <div className="employer-path-grid">
        <article className="surface surface-pad stack">
          <BriefcaseBusiness aria-hidden="true" size={24} />
          <h2 className="m-0 text-xl font-bold">Post a job</h2>
          <p className="text-muted m-0">
            Submit an authorised vacancy with exact eligibility, pay and
            application evidence. It remains pending until moderated.
          </p>
          <Link className="button button-secondary w-fit" href="/post-a-job">
            Post a job
          </Link>
        </article>
        <article className="surface surface-pad stack">
          <Building2 aria-hidden="true" size={24} />
          <h2 className="m-0 text-xl font-bold">Claim your company</h2>
          <p className="text-muted m-0">
            Ask SalaryPadi to review corporate-domain and organisational
            evidence before connecting an employer to a profile.
          </p>
          <Link className="button button-secondary w-fit" href="/companies">
            Find your company
          </Link>
        </article>
        <article className="surface surface-pad stack">
          <MessagesSquare aria-hidden="true" size={24} />
          <h2 className="m-0 text-xl font-bold">Request a right of reply</h2>
          <p className="text-muted m-0">
            Provide a factual correction or response to published community
            evidence about your organisation.
          </p>
          <Link className="button button-secondary w-fit" href="/companies">
            Find your company
          </Link>
        </article>
      </div>
      <section className="rule-section rich-copy">
        <h2>What SalaryPadi will and will not do</h2>
        <ul>
          <li>
            Every published job keeps its original source attribution and sends
            applicants to your own application destination.
          </li>
          <li>
            A claim starts a review of domain and organisational evidence. It
            does not automatically mark a profile verified.
          </li>
          <li>
            Moderated community evidence stays published unless it breaches the
            content policy. A reply is added alongside it, not in place of it.
          </li>
          <li>
            Takedown and correction requests are handled through the{" "}
            <Link className="text-link" href="/company-intelligence/requests">
              company intelligence request route
            </Link>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
