import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why SalaryPadi is building clearer job eligibility, compensation and workplace evidence for Africans.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <PolicyPage
      eyebrow="Our purpose"
      title="Career decisions deserve better evidence."
      description="SalaryPadi helps Africans find jobs they can actually apply for, understand what an offer is worth, and judge the evidence behind a vacancy or workplace claim."
    >
      <h2>What we are building</h2>
      <p>
        A compact job-discovery and career-intelligence platform for Nigeria
        first, designed to expand country by country. We combine explicit remote
        eligibility, source freshness, compensation context, moderated workplace
        contributions and practical decision tools.
      </p>
      <p>
        We are not building a social feed, follower network, course marketplace
        or candidate database. Applications leave SalaryPadi for the employer’s
        trusted external page during the MVP.
      </p>
      <h2>How we earn trust</h2>
      <ul>
        <li>
          We preserve the exact evidence behind a location-eligibility label.
        </li>
        <li>
          We distinguish published pay, community data and modelled estimates.
        </li>
        <li>
          We suppress salary aggregates that are too sparse to publish safely.
        </li>
        <li>We moderate contributions before they become public.</li>
        <li>We show source, date and confidence instead of fake certainty.</li>
      </ul>
      <p>
        Read the <Link href="/methodology">methodology</Link> for the detailed
        rules, or use the{" "}
        <Link href="/trust-and-safety">reporting process</Link> if something
        looks wrong.
      </p>
    </PolicyPage>
  );
}
