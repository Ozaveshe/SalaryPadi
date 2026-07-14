import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { normalizeRemotiveJob, parseSalary } from "@/lib/jobs/normalize";
import type { RemotiveJob } from "@/lib/jobs/remotive-schema";

const jobSchema = z.object({
  id: z.string().regex(/^remotive-\d+$/),
  slug: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  eligibility: z.enum([
    "Nigeria eligible",
    "Nigeria not listed",
    "Eligibility unclear",
  ]),
  source_url: z.string().url().startsWith("https://remotive.com/remote-jobs/"),
  last_checked: z.literal("13 Jul 2026"),
});

const sourceRunSchema = z.object({
  run_time: z.string().datetime({ offset: true }),
  status: z.enum(["succeeded", "failed"]),
  duration_seconds: z.number().nonnegative(),
  fetched: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative().nullable(),
  new_canonical_jobs: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative().nullable(),
  rejected: z.number().int().nonnegative().nullable(),
  closed: z.number().int().nonnegative(),
  nigeria_local: z.number().int().nonnegative().nullable(),
  explicit_nigeria_africa_eligible: z.number().int().nonnegative().nullable(),
  unclear_eligibility: z.number().int().nonnegative().nullable(),
  errors: z.number().int().nonnegative(),
});

const auditSchema = z.object({
  schema_version: z.literal(1),
  supabase_project_ref: z.literal("bxelrhklsznmpksgrqep"),
  baseline: z.object({
    visible_jobs: z.literal(38),
    nigeria_eligible_remote_jobs: z.literal(9),
    nigeria_local_jobs: z.literal(0),
    eligibility_unclear_jobs: z.literal(22),
    visible_company_profiles: z.literal(17),
    publishable_salary_aggregates: z.literal(0),
  }),
  source_policies: z.array(
    z.object({
      adapter_key: z.string(),
      may_store_full_description: z.boolean(),
      may_index_jobs: z.boolean(),
      may_emit_jobposting_schema: z.boolean(),
      may_email_jobs: z.boolean(),
    }),
  ),
  schedules: z.array(z.object({ task_key: z.string(), cron: z.string() })),
  source_run_report: z.array(
    z.object({ adapter_key: z.string(), runs: z.array(sourceRunSchema) }),
  ),
  current_job_provenance: z.array(jobSchema),
  defects: z.object({
    coalition_salary_decimal_comma: z.object({
      status: z.literal("fixed_local_not_deployed"),
      input: z.string(),
      observed_minimum: z.number(),
      observed_maximum: z.number(),
      observed_pay_period: z.string(),
      corrected_minimum: z.number(),
      corrected_maximum: z.number(),
      expected_annual_minimum_at_2080_hours: z.number(),
      expected_annual_maximum_at_2080_hours: z.number(),
    }),
    coalition_pacific_time: z.object({
      status: z.literal("fixed_local_not_deployed"),
      observed_required_timezone: z.null(),
      expected_required_timezone: z.string(),
      corrected_required_timezone: z.string(),
    }),
  }),
});

const audit = auditSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "reports/production-truth-audit.json"),
      "utf8",
    ),
  ),
);

const coalitionFixture: RemotiveJob = {
  id: 1680495,
  url: "https://remotive.com/remote-jobs/marketing/remote-office-assistant-1680495",
  title: "Remote Office Assistant",
  company_name: "Coalition Technologies",
  company_logo: null,
  category: "Marketing",
  tags: [],
  job_type: "full_time",
  publication_date: "2026-07-01T00:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$31,2k- $52k",
  description:
    "<p>Starting base pay is $15 to $25 per hour. Availability is 9:00 a.m. to 6:00 p.m. Pacific Time.</p>",
};

describe("production truth audit artifact", () => {
  it("accounts for every visible job with unique source provenance", () => {
    expect(audit.current_job_provenance).toHaveLength(38);
    expect(
      new Set(audit.current_job_provenance.map((job) => job.id)).size,
    ).toBe(38);
    expect(
      audit.current_job_provenance.filter(
        (job) => job.eligibility === "Nigeria eligible",
      ),
    ).toHaveLength(9);
    expect(
      audit.current_job_provenance.filter(
        (job) => job.eligibility === "Eligibility unclear",
      ),
    ).toHaveLength(22);
  });

  it("keeps every requested legacy run metric present and explicitly unknown", () => {
    const remotive = audit.source_run_report.find(
      (source) => source.adapter_key === "remotive",
    );
    expect(remotive?.runs).toHaveLength(15);
    expect(remotive?.runs.every((run) => run.accepted === null)).toBe(true);
    expect(remotive?.runs.every((run) => run.duplicates === null)).toBe(true);
    expect(audit.schedules).toHaveLength(15);
    expect(audit.schedules).toContainEqual(
      expect.objectContaining({ task_key: "ats_source_sync" }),
    );
  });

  it("preserves the Coalition defect reproduction and proves the correction", () => {
    const observed = parseSalary(
      audit.defects.coalition_salary_decimal_comma.input,
    );
    expect(observed).toMatchObject({
      minimum: audit.defects.coalition_salary_decimal_comma.corrected_minimum,
      maximum: audit.defects.coalition_salary_decimal_comma.corrected_maximum,
      payPeriod:
        audit.defects.coalition_salary_decimal_comma.observed_pay_period,
    });
    expect(audit.defects.coalition_salary_decimal_comma.observed_minimum).toBe(
      52_000,
    );
    expect(audit.defects.coalition_salary_decimal_comma.observed_maximum).toBe(
      312_000,
    );
    expect(
      audit.defects.coalition_salary_decimal_comma
        .expected_annual_minimum_at_2080_hours,
    ).toBe(31_200);
    expect(
      audit.defects.coalition_salary_decimal_comma
        .expected_annual_maximum_at_2080_hours,
    ).toBe(52_000);
  });

  it("preserves the Pacific-time defect reproduction and proves the correction", () => {
    const observed = normalizeRemotiveJob(
      coalitionFixture,
      "2026-07-13T13:07:22.886Z",
    );
    expect(observed.eligibility.requiredTimezone).toBe(
      audit.defects.coalition_pacific_time.corrected_required_timezone,
    );
    expect(
      audit.defects.coalition_pacific_time.observed_required_timezone,
    ).toBeNull();
    expect(
      audit.defects.coalition_pacific_time.expected_required_timezone,
    ).toBe("Pacific Time");
  });

  it("keeps Remotive storage and indexing permissions closed", () => {
    expect(audit.source_policies).toContainEqual(
      expect.objectContaining({
        adapter_key: "remotive",
        may_store_full_description: false,
        may_index_jobs: false,
        may_emit_jobposting_schema: false,
        may_email_jobs: false,
      }),
    );
  });
});
