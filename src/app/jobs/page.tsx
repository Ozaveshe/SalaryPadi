import type { Metadata } from "next";

import { JobsExperience } from "@/components/jobs/jobs-experience";
import { getViewer } from "@/lib/auth/dal";
import { readUnreadNotificationCount } from "@/lib/career/notifications";
import { countryAlternates } from "@/lib/country-packs/routing";
import { getAppOrigin } from "@/lib/env";

export const metadata: Metadata = {
  title: "Jobs open to Africans",
  description:
    "Search source-attributed local and remote jobs with explicit country-eligibility evidence.",
  alternates: {
    canonical: "/jobs",
    languages: countryAlternates(getAppOrigin(), "/jobs").languages,
  },
  robots: { index: false, follow: true },
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [input, viewer] = await Promise.all([searchParams, getViewer()]);
  // Search is the same for everyone; only the frame around it differs. A
  // signed-in viewer keeps their workspace navigation instead of being dropped
  // out of it every time they go looking for a role.
  const signedIn = viewer.state === "authenticated";
  return (
    <JobsExperience
      input={input}
      chrome={signedIn ? "workspace" : "public"}
      signedIn={signedIn}
      unreadNotifications={
        signedIn ? await readUnreadNotificationCount() : null
      }
    />
  );
}
