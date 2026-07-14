import { z } from "zod";

export const companyLocationSchema = z.object({
  country_code: z.string(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  location_type: z.string().optional(),
  is_primary: z.boolean().optional(),
  last_verified_at: z.string().nullable().optional(),
});

const legalEntitySchema = z.object({
  legal_name: z.string(),
  registration_country: z.string().nullable(),
  entity_status: z.string(),
  citation_id: z.string().uuid(),
});
const aliasSchema = z.object({
  alias: z.string(),
  alias_kind: z.string(),
  citation_id: z.string().uuid().nullable(),
});
const officialDomainSchema = z.object({
  domain: z.string(),
  domain_kind: z.string(),
  verified_at: z.string(),
  review_due_at: z.string(),
  citation_id: z.string().uuid(),
});
export const companyCitationSchema = z.object({
  id: z.string().uuid(),
  fact_key: z.string(),
  source_kind: z.enum([
    "official_site",
    "public_filing",
    "public_registry",
    "verified_employer_submission",
  ]),
  source_url: z.string().url(),
  source_title: z.string(),
  source_published_at: z.string().nullable(),
  retrieved_at: z.string(),
  fact_checked_at: z.string(),
  review_due_at: z.string(),
  status: z.enum(["current", "review_due"]),
});

export const companyRowSchema = z.object({
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
  legal_entities: z.array(legalEntitySchema).catch([]),
  aliases: z.array(aliasSchema).catch([]),
  official_domains: z.array(officialDomainSchema).catch([]),
  citations: z.array(companyCitationSchema).catch([]),
});

export const reviewSchema = z.object({
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
  provenance_label: z.string(),
});

export const interviewSchema = z.object({
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
  provenance_label: z.string(),
});

export const ratingSchema = z.object({
  company_slug: z.string(),
  sample_size: z.coerce.number().int().min(5),
  independent_contributors: z.coerce.number().int().min(5).optional(),
  overall_rating: z.coerce.number(),
  confidence_label: z.string(),
  country_scope: z.array(z.string()).optional(),
  source_month_from: z.string().nullable().optional(),
  source_month_to: z.string().nullable().optional(),
  verification_mix: z
    .record(z.string(), z.coerce.number().int().nonnegative())
    .optional(),
  computed_at: z.string(),
});

export const benefitSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  benefit_code: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  source_kind: z.string(),
  sample_size: z.coerce.number().int().nonnegative().nullable(),
  confidence_label: z.string().nullable(),
  last_verified_at: z.string().nullable(),
  country_code: z.string().nullable().optional(),
  source_month_from: z.string().nullable().optional(),
  source_month_to: z.string().nullable().optional(),
  verification_mix: z
    .record(z.string(), z.coerce.number().int().nonnegative())
    .optional(),
});

export const employerResponseSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  response_kind: z.enum(["factual_correction", "right_of_reply"]),
  statement: z.string().max(3_000),
  source_url: z.string().url().nullable(),
  published_at: z.string(),
  updated_at: z.string(),
  provenance_label: z.string(),
});

export const companyRatingThresholdSchema = z.object({
  metric: z.literal("company_overall_rating"),
  min_distinct_contributors: z.coerce.number().int().min(5),
});

export const companyEvidenceRowSchema = z.object({
  company_slug: z.string().nullable(),
  published_at: z.string().nullable().optional(),
  computed_at: z.string().nullable().optional(),
  calculated_at: z.string().nullable().optional(),
  last_verified_at: z.string().nullable().optional(),
  source_kind: z.string().optional(),
});

export type CompanyLocation = z.infer<typeof companyLocationSchema>;
export type CompanyRow = z.infer<typeof companyRowSchema>;
export type CompanyLegalEntity = z.infer<typeof legalEntitySchema>;
export type CompanyAlias = z.infer<typeof aliasSchema>;
export type CompanyOfficialDomain = z.infer<typeof officialDomainSchema>;
export type CompanyCitation = z.infer<typeof companyCitationSchema>;
export type CompanyReview = z.infer<typeof reviewSchema>;
export type InterviewExperience = z.infer<typeof interviewSchema>;
export type CompanyRating = z.infer<typeof ratingSchema>;
export type CompanyBenefit = z.infer<typeof benefitSchema>;
export type EmployerResponse = z.infer<typeof employerResponseSchema>;
