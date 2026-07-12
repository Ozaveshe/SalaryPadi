import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What SalaryPadi collects, why it is used, what is never sent to analytics, and user data choices.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy notice"
      title="Your career data is not advertising inventory"
      description="SalaryPadi uses data minimisation, private ownership controls and moderated publication. This notice describes the current production service; it is not a claim of legal compliance or a substitute for jurisdiction-specific advice."
    >
      <p>
        <strong>Last updated:</strong> 12 July 2026.
      </p>
      <h2>Data we need</h2>
      <p>
        Account identity and session data support sign-in, ownership and abuse
        prevention. Saved jobs, application notes, alert settings and
        contribution drafts are private. Submitted reviews, salary information
        and interview experiences are retained for moderation and, only after
        approval, used in redacted publications or aggregates.
      </p>
      <h2>Public anonymity</h2>
      <p>
        Feed posts, forum discussions and other community contributions use a
        public name and random SalaryPadi handle, but remain privately linked to
        an account for ownership, moderation, deletion and manipulation
        controls. Employers and other users do not receive that identity link.
        Feed and forum text is public immediately after submission; do not put
        contact details, private people or confidential information in it.
      </p>
      <h2>Analytics boundaries</h2>
      <p>
        Salary amounts, review or interview text, private notes, email
        addresses, CV content, identity documents and other personal data are
        prohibited from analytics events. Analytics is off until you make an
        explicit choice. If allowed, SalaryPadi stores only an allowlisted event
        name, a coarse route group, the day and an aggregate count in its
        dedicated database. It does not store an account, email, IP address,
        user agent, session identifier or event-level record, and daily counts
        are deleted after 90 days.
      </p>
      <p>
        The same optional choice can enable Google Analytics on public pages.
        SalaryPadi sends a query-free page path, page title, coarse allowlisted
        event names and Core Web Vitals. It does not load Google Analytics on
        account, application, alert, admin, authentication, contribution,
        privacy-request or employer-submission routes, and it does not attach a
        SalaryPadi account or stable user ID. Google necessarily receives
        network and browser/device context, including the connection IP, while
        processing a request. Advertising storage, ad personalisation and Google
        signals are disabled. You can reopen “Analytics choices” at any time to
        withdraw consent and clear SalaryPadi-domain Google Analytics cookies.
      </p>
      <h2>Your choices</h2>
      <p>
        Authenticated users can request data export, correction, contribution
        deletion and account deletion. Some narrowly scoped audit or abuse
        records may be retained when a documented legal or safety reason
        applies. Contact{" "}
        <a href="mailto:privacy@salarypadi.com">privacy@salarypadi.com</a>
        for a privacy request or use the authenticated request centre below.
      </p>
      <p>
        <Link className="button w-fit" href="/privacy/requests">
          Open my private request centre
        </Link>
      </p>
      <h2>Hosting and processors</h2>
      <p>
        Account, career, moderation and aggregate first-party analytics data is
        stored in a dedicated Supabase project in AWS eu-north-1. Netlify hosts
        the web application and scheduled operations through its managed
        platform. When optional analytics is allowed, Google Analytics processes
        the limited public-page and performance data described above under
        Google’s provider terms. Hostinger provides DNS and the operational
        mailbox. Resend sends authentication and job-alert email through its
        eu-west-1 sending region; email delivery necessarily shares the
        recipient address and message with that provider, but tracking metrics
        are not enabled. The European Commission InforEuro endpoint supplies
        public monthly reference rates and receives no account or career data.
      </p>
      <p>
        AfroTools processes take-home-pay inputs, offer values and job-vacancy
        warning-check inputs only after the user accepts the disclosure beside
        the relevant tool. SalaryPadi sends those values from its server through
        a protected API connection. AfroTools uses them for the requested
        calculation, does not intentionally retain the submitted input and does
        not open or fetch links entered in the job-scam checker. Remove
        unnecessary personal or confidential information before submitting a
        vacancy message.
      </p>
      <p>
        Provider subprocessor and international-transfer terms can change. The
        privacy owner reviews the live provider contracts rather than treating
        this repository as a frozen subprocessor list.
      </p>
      <p>
        These controls are designed around the Nigeria Data Protection Act and
        future multi-country needs, but a design or policy page is not itself a
        claim of legal compliance.
      </p>
    </PolicyPage>
  );
}
