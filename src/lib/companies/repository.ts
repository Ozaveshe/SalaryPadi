import "server-only";

import { z } from "zod";

import { getLiveJobFeed } from "@/lib/jobs/repository";
import type { Job } from "@/lib/jobs/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const companyLocationSchema = z.object({
  country_code: z.string(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  location_type: z.string().optional(),
  is_primary: z.boolean().optional(),
});

const companyRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  display_name: z.string(),
  website_url: z.string().nullable(),
  industry: z.string().nullable(),
  size_band: z.string().nullable(),
  description: z.string().nullable(),
  headquarters_country: z.string().nullable(),
  verification_status: z.string(),
  updated_at: z.string(),
  locations: z.array(companyLocationSchema).catch([]),
});

const reviewSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  role_family: z.string().nullable(),
  country_code: z.string(),
  employment_status: z.string().nullable(),
  employment_period_label: z.string().nullable(),
  compensation_rating: z.coerce.number().nullable(),
  pay_reliability_rating: z.coerce.number().nullable(),
  management_rating: z.coerce.number().nullable(),
  work_life_rating: z.coerce.number().nullable(),
  career_growth_rating: z.coerce.number().nullable(),
  overall_rating: z.coerce.number().nullable(),
  pros: z.string().nullable(),
  cons: z.string().nullable(),
  advice_to_management: z.string().nullable(),
  published_at: z.string(),
});

const interviewSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  role_family: z.string().nullable(),
  seniority: z.string().nullable(),
  country_code: z.string(),
  application_source: z.string().nullable(),
  stages: z.array(z.string()).catch([]),
  approximate_duration_label: z.string().nullable(),
  difficulty: z.coerce.number().nullable(),
  feedback_received: z.boolean().nullable(),
  outcome: z.string().nullable(),
  question_themes: z.string().nullable(),
  general_experience: z.string().nullable(),
  published_at: z.string(),
});

const ratingSchema = z.object({
  company_slug: z.string(),
  sample_size: z.coerce.number().int().nonnegative(),
  overall_rating: z.coerce.number(),
  confidence_label: z.string(),
  computed_at: z.string(),
});

const benefitSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  benefit_code: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  source_kind: z.string(),
  sample_size: z.coerce.number().int().nonnegative().nullable(),
  confidence_label: z.string().nullable(),
  last_verified_at: z.string().nullable(),
});

export type CompanyReview = z.infer<typeof reviewSchema>;
export type InterviewExperience = z.infer<typeof interviewSchema>;
export type CompanyRating = z.infer<typeof ratingSchema>;
export type CompanyBenefit = z.infer<typeof benefitSchema>;

export interface CompanySummary {
  databaseId: string | null;
  name: string;
  slug: string;
  websiteUrl: string | null;
  industry: string | null;
  sizeBand: string | null;
  description: string | null;
  headquartersCountry: string | null;
  activeJobs: Job[];
  categories: string[];
  remoteLocations: string[];
  verification: "source_listed" | "employer_verified" | "unverified";
  lastCheckedAt: string;
}

function mapVerification(value: string): CompanySummary["verification"] {
  return value === "domain_verified" || value === "organization_verified"
    ? "employer_verified"
    : "unverified";
}

function formatCompanyLocation(
  location: z.infer<typeof companyLocationSchema>,
) {
  return [location.city, location.region, location.country_code]
    .filter(Boolean)
    .join(", ");
}

async function getDatabaseCompanies(): Promise<CompanySummary[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .schema("api")
    .from("companies")
    .select("*")
    .order("display_name")
    .limit(500);
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = companyRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const company = parsed.data;
    return [
      {
        databaseId: company.id,
        name: company.display_name,
        slug: company.slug,
        websiteUrl: company.website_url,
        industry: company.industry,
        sizeBand: company.size_band,
        description: company.description,
        headquartersCountry: company.headquarters_country,
        activeJobs: [],
        categories: [],
        remoteLocations: company.locations
          .map(formatCompanyLocation)
          .filter(Boolean),
        verification: mapVerification(company.verification_status),
        lastCheckedAt: company.updated_at,
      } satisfies CompanySummary,
    ];
  });
}

export async function getCompanies(): Promise<CompanySummary[]> {
  const [feed, databaseCompanies] = await Promise.all([
    getLiveJobFeed(),
    getDatabaseCompanies(),
  ]);
  const grouped = new Map(
    databaseCompanies.map((company) => [company.slug, company]),
  );

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
      if (job.company.verification === "employer_verified")
        current.verification = "employer_verified";
      continue;
    }

    grouped.set(job.company.slug, {
      databaseId: null,
      name: job.company.name,
      slug: job.company.slug,
      websiteUrl: null,
      industry: null,
      sizeBand: null,
      description: null,
      headquartersCountry: null,
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

async function readCompanyRows<T>(
  table:
    | "company_reviews"
    | "interview_experiences"
    | "company_ratings"
    | "company_benefits",
  slug: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .schema("api")
    .from(table)
    .select("*")
    .eq("company_slug", slug)
    .limit(100);
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function getCompanyReviews(slug: string) {
  const rows = await readCompanyRows("company_reviews", slug, reviewSchema);
  return rows.toSorted(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
  );
}

export async function getInterviewExperiences(slug: string) {
  const rows = await readCompanyRows(
    "interview_experiences",
    slug,
    interviewSchema,
  );
  return rows.toSorted(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
  );
}

export async function getCompanyRating(slug: string) {
  return (
    (await readCompanyRows("company_ratings", slug, ratingSchema))[0] ?? null
  );
}

export async function getCompanyBenefits(slug: string) {
  return readCompanyRows("company_benefits", slug, benefitSchema);
}
