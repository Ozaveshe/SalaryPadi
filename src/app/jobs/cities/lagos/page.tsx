import {
  buildJobLandingMetadata,
  JobLandingPage,
} from "@/components/jobs/job-landing-page";

export const generateMetadata = () => buildJobLandingMetadata("city_lagos");

export default function LagosJobsPage() {
  return <JobLandingPage landingKey="city_lagos" />;
}
