import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import registry from "../../../../config/job-source-policy-registry.json";

const pilotDay = z.object({
  day: z.number().int().min(1).max(14),
  date: z.iso.date(),
  new_canonical_jobs: z.number().int().nonnegative().nullable(),
  raw_occurrences: z.number().int().nonnegative().nullable(),
  status: z.enum(["not_run", "complete", "partial", "failed"]),
});

const sourceRollup = z.object({
  adapter_key: z.string().min(2),
  policy_state: z.string().min(2),
  run_time: z.string().datetime({ offset: true }).nullable(),
  status: z.literal("not_run"),
  duration_seconds: z.number().nonnegative().nullable(),
  fetched: z.number().int().nonnegative().nullable(),
  accepted: z.number().int().nonnegative().nullable(),
  new_canonical_jobs: z.number().int().nonnegative().nullable(),
  updated: z.number().int().nonnegative().nullable(),
  duplicates: z.number().int().nonnegative().nullable(),
  rejected: z.number().int().nonnegative().nullable(),
  closed: z.number().int().nonnegative().nullable(),
  nigeria_local: z.number().int().nonnegative().nullable(),
  explicit_nigeria_africa_eligible: z.number().int().nonnegative().nullable(),
  unclear_eligibility: z.number().int().nonnegative().nullable(),
  errors: z.number().int().nonnegative().nullable(),
});

const pilotSchema = z.object({
  schema_version: z.literal(1),
  pilot_state: z.enum(["not_started", "running", "complete"]),
  deployment_state: z.string(),
  source_activation_state: z.string(),
  target_daily_new_canonical: z.literal(200),
  pre_pilot_evidence: z.object({
    visible_jobs: z.number().int().nonnegative(),
    durable_raw_records: z.number().int().nonnegative(),
    durable_canonical_jobs: z.number().int().nonnegative(),
    authorized_external_daily_capacity: z.number().int().nonnegative(),
  }),
  source_rollup: z.array(sourceRollup).length(registry.sources.length),
  days: z.array(pilotDay).length(14),
  external_dependencies: z.array(z.string().min(10)).min(1),
});

describe("job supply machine artifacts", () => {
  it("keeps the policy matrix documentation and registry in sync", () => {
    const documentation = readFileSync(
      resolve(process.cwd(), "docs/JOB_SOURCE_POLICY_MATRIX.md"),
      "utf8",
    );
    for (const source of registry.sources) {
      expect(documentation).toContain(source.name);
    }
  });

  it("provides fourteen honest, non-fabricated pilot days", () => {
    const pilot = pilotSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(process.cwd(), "reports/job-supply-pilot-14-day.json"),
          "utf8",
        ),
      ),
    );
    expect(pilot.pilot_state).toBe("not_started");
    expect(pilot.pre_pilot_evidence).toMatchObject({
      durable_raw_records: 0,
      durable_canonical_jobs: 0,
      authorized_external_daily_capacity: 0,
    });
    expect(pilot.days.every((day) => day.new_canonical_jobs === null)).toBe(
      true,
    );
    expect(
      new Set(pilot.source_rollup.map((source) => source.adapter_key)),
    ).toEqual(new Set(registry.sources.map((source) => source.adapterKey)));
    expect(
      pilot.source_rollup.every((source) => source.new_canonical_jobs === null),
    ).toBe(true);
  });
});
