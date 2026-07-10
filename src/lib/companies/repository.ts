import "server-only";

import { getLiveJobFeed } from "@/lib/jobs/repository";
import type { Job } from "@/lib/jobs/types";

export interface CompanySummary {
  name: string;
  slug: string;
  activeJobs: Job[];
  categories: string[];
  remoteLocations: string[];
  verification: "source_listed" | "employer_verified" | "unverified";
  lastCheckedAt: string;
}

export async function getCompanies(): Promise<CompanySummary[]> {
  const feed = await getLiveJobFeed();
  const grouped = new Map<string, CompanySummary>();

  for (const job of feed.jobs) {
    const current = grouped.get(job.company.slug);
    if (current) {
      current.activeJobs.push(job);
      if (job.category && !current.categories.includes(job.category))
        current.categories.push(job.category);
      if (!current.remoteLocations.includes(job.locationDisplay))
        current.remoteLocations.push(job.locationDisplay);
      if (Date.parse(job.lastCheckedAt) > Date.parse(current.lastCheckedAt))
        current.lastCheckedAt = job.lastCheckedAt;
      continue;
    }

    grouped.set(job.company.slug, {
      name: job.company.name,
      slug: job.company.slug,
      activeJobs: [job],
      categories: job.category ? [job.category] : [],
      remoteLocations: [job.locationDisplay],
      verification: job.company.verification,
      lastCheckedAt: job.lastCheckedAt,
    });
  }

  return [...grouped.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function getCompany(slug: string) {
  return (
    (await getCompanies()).find((company) => company.slug === slug) ?? null
  );
}
