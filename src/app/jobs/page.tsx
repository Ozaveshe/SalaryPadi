import type { Metadata } from "next";

import { JobsExperience } from "@/components/jobs/jobs-experience";

export const metadata: Metadata = {
  title: "Jobs open to Africans",
  description:
    "Search source-attributed local and remote jobs with explicit country-eligibility evidence.",
  alternates: { canonical: "/jobs" },
  robots: { index: false, follow: true },
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <JobsExperience input={await searchParams} />;
}
