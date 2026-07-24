import type { Metadata } from "next";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  HeartPulse,
  History,
  MessagesSquare,
} from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { getAppOrigin } from "@/lib/env";
import { buildWhatsAppShareUrl } from "@/lib/share/whatsapp";

export const metadata: Metadata = {
  title: "Contribute career evidence",
  description:
    "Privately submit salary, workplace or interview evidence for moderation.",
  alternates: { canonical: "/contribute" },
  robots: { index: false, follow: true },
};

/**
 * The secondary lane. Sharing a workplace experience is one intent with four
 * shapes; presenting them as four peers of "share your salary" buried the
 * primary action.
 */
const workplaceOptions = [
  [
    "Review",
    "/contribute/review",
    "What it is actually like to work there, without naming individuals.",
    MessagesSquare,
  ],
  [
    "Benefits",
    "/contribute/benefits",
    "Structured benefits you receive. Cohort thresholds apply before publication.",
    HeartPulse,
  ],
  [
    "Pay reliability",
    "/contribute/pay-reliability",
    "Whether pay arrives on time, as a coarse pattern — never an individual allegation.",
    History,
  ],
  [
    "Interview",
    "/contribute/interview",
    "Stages, timing and themes — never proprietary questions or answers.",
    BriefcaseBusiness,
  ],
] as const;

export default async function ContributePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const status = Array.isArray(input.status) ? input.status[0] : input.status;
  const kind = Array.isArray(input.kind) ? input.kind[0] : input.kind;
  const salaryShareUrl = buildWhatsAppShareUrl(
    `Help others see real salaries. Share your own pay privately on SalaryPadi: ${new URL("/contribute/salary", getAppOrigin()).toString()}`,
  );
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="First-party community data"
        title="Help the next person see more clearly"
        description="Contributions require sign-in, stay privately account-linked, and are moderated before anything is published. Individual records are never shown publicly."
      />
      {status === "submitted" ? (
        <div className="notice" role="status">
          <strong>Contribution received.</strong> It is pending moderation and
          is not public.
        </div>
      ) : null}
      {status === "submitted" && kind === "salary" ? (
        <div className="surface surface-pad stack">
          <h2 className="m-0 text-xl font-bold">
            Help others see real salaries
          </h2>
          <p className="text-muted m-0">
            Invite someone you trust to add their own private, moderated salary
            evidence too.
          </p>
          <a
            className="button button-secondary w-fit"
            href={salaryShareUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on WhatsApp
          </a>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="notice notice-danger" role="alert">
          We could not save that contribution. Check the fields and try again.
        </div>
      ) : null}

      <section
        className="surface surface-pad stack contribute-primary"
        aria-labelledby="primary-contribution"
      >
        <BadgeDollarSign aria-hidden="true" size={28} />
        <h2 className="m-0 text-2xl font-bold" id="primary-contribution">
          Share your salary anonymously
        </h2>
        <p className="text-muted m-0 max-w-2xl">
          The single most useful thing you can add. Your figure is never shown
          on its own — it only ever appears inside a cohort of at least three
          similar approved contributions from different people.
        </p>
        <Link className="button w-fit" href="/contribute/salary">
          Share your salary
        </Link>
      </section>

      <section
        className="rule-section stack"
        aria-labelledby="workplace-contribution"
      >
        <div>
          <h2 className="section-title" id="workplace-contribution">
            Share a workplace experience
          </h2>
          <p className="text-muted m-0">
            Already shared your pay, or want to tell people something else?
            Choose what you want to describe.
          </p>
        </div>
        <div className="contribution-options">
          {workplaceOptions.map(([label, href, description, Icon]) => (
            <article className="surface surface-pad stack" key={href}>
              <Icon aria-hidden="true" size={24} />
              <h3 className="m-0 text-lg font-bold">{label}</h3>
              <p className="text-muted m-0 text-sm">{description}</p>
              <Link className="text-link" href={href}>
                Start
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rule-section rich-copy">
        <h2>Before you submit</h2>
        <ul>
          <li>
            Do not include names, emails, phone numbers or identity documents.
          </li>
          <li>
            Do not disclose confidential test answers or private company
            material.
          </li>
          <li>Use the original salary currency and pay period.</li>
          <li>
            Do not upload a payslip or document. Document verification is not
            enabled.
          </li>
          <li>Be factual and separate your experience from assumptions.</li>
        </ul>
      </section>

      <p className="text-muted m-0 text-sm">
        Hiring instead?{" "}
        <Link className="text-link" href="/for-employers">
          Employer options are on a separate page
        </Link>
        .
      </p>
    </div>
  );
}
