import type { Metadata } from "next";

import {
  buildJobLandingMetadata,
  JobLandingPage,
} from "@/components/jobs/job-landing-page";

export async function generateMetadata(): Promise<Metadata> {
  return buildJobLandingMetadata("remote_nigeria");
}

export default function RemoteJobsPage() {
  return <JobLandingPage landingKey="remote_nigeria" />;
}
