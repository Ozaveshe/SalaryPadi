import {
  buildJobLandingMetadata,
  JobLandingPage,
} from "@/components/jobs/job-landing-page";

export const generateMetadata = () =>
  buildJobLandingMetadata("role_software_engineering");

export default function SoftwareEngineeringJobsPage() {
  return <JobLandingPage landingKey="role_software_engineering" />;
}
