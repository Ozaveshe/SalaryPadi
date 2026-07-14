import type { Metadata } from "next";

import {
  buildJobLandingMetadata,
  JobLandingPage,
} from "@/components/jobs/job-landing-page";

export async function generateMetadata(): Promise<Metadata> {
  return buildJobLandingMetadata("nigeria_software");
}

export default function SoftwareJobsPage() {
  return <JobLandingPage landingKey="nigeria_software" />;
}
