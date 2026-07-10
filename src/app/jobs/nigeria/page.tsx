import type { Metadata } from "next";

import { JobsExperience } from "@/components/jobs/jobs-experience";

export const metadata: Metadata = {
  title: "Jobs in Nigeria",
  description:
    "A dedicated search for onsite and hybrid Nigerian roles from approved sources.",
  alternates: { canonical: "/jobs/nigeria" },
  robots: { index: false, follow: true },
};

export default async function NigeriaJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <JobsExperience
      input={await searchParams}
      forcedFilters={{ workMode: "onsite", location: "Nigeria" }}
      title="Local jobs in Nigeria"
      description="The current permitted pilot source is remote-only, so this lane stays empty until a reviewed local employer or partner source supplies real Nigerian vacancies. No fake listings are used."
    />
  );
}
