import type { Metadata } from "next";

import { JobsExperience } from "@/components/jobs/jobs-experience";

export const metadata: Metadata = {
  title: "Remote jobs open to Nigerians",
  description:
    "Remote roles with explicit country evidence, including jobs that name Nigeria, Africa or Worldwide eligibility.",
  alternates: { canonical: "/jobs/remote" },
  robots: { index: false, follow: true },
};

export default async function RemoteJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  return (
    <JobsExperience
      input={input}
      forcedFilters={{
        workMode: "remote",
        eligibility:
          typeof input.eligibility === "string" ? input.eligibility : "nigeria",
      }}
      title="Remote jobs with Nigeria evidence"
      description="These roles say Nigeria, Africa or Worldwide in the source eligibility field. EMEA and vague regional wording remain unclear."
    />
  );
}
