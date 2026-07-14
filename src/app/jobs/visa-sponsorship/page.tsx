import type { Metadata } from "next";

import {
  buildJobLandingMetadata,
  JobLandingPage,
} from "@/components/jobs/job-landing-page";

export async function generateMetadata(): Promise<Metadata> {
  return buildJobLandingMetadata("visa_sponsorship_nigeria");
}

export default function VisaSponsorshipJobsPage() {
  return <JobLandingPage landingKey="visa_sponsorship_nigeria" />;
}
