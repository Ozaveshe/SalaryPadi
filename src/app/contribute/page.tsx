import type { Metadata } from "next";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
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

const options = [
  [
    "Salary",
    "/contribute/salary",
    "Add structured compensation and benefit information. Individual values are never public.",
    BadgeDollarSign,
  ],
  [
    "Workplace review",
    "/contribute/review",
    "Share African workplace realities without naming private individuals.",
    MessagesSquare,
  ],
  [
    "Interview experience",
    "/contribute/interview",
    "Describe stages, timing and themes without proprietary answers.",
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
        description="Contributions require sign-in, remain privately account-linked, and enter a moderation queue before any redacted publication or aggregate."
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
      <div className="contribution-options">
        {options.map(([label, href, description, Icon]) => (
          <article className="surface surface-pad stack" key={href}>
            <Icon aria-hidden="true" size={24} />
            <h2 className="m-0 text-xl font-bold">{label}</h2>
            <p className="text-muted m-0">{description}</p>
            <Link className="button button-secondary w-fit" href={href}>
              Start contribution
            </Link>
          </article>
        ))}
      </div>
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
          <li>Be factual and separate your experience from assumptions.</li>
        </ul>
      </section>
    </div>
  );
}
