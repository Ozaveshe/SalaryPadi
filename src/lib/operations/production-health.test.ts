import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  jobSupplyHealthSchema,
  productionHealthSchema,
} from "./production-health";

describe("production health DTO", () => {
  it("keeps unmeasured source metrics distinct from zero", () => {
    const result = productionHealthSchema.parse({
      generated_at: "2026-07-13T19:00:00.000Z",
      window_start: "2026-06-29T19:00:00.000Z",
      workers: [
        {
          task_key: "ats_source_sync",
          enabled: true,
          expected_interval_seconds: 21_600,
          stale_after_seconds: 50_400,
          last_status: "skipped",
          last_started_at: "2026-07-13T14:36:35.719Z",
          last_success_at: null,
          freshness: "healthy",
        },
      ],
      sources: [
        {
          adapter_key: "remotive",
          name: "Remotive",
          status: "active",
          allow_public_listing: true,
          may_store_full_description: false,
          may_index_jobs: false,
          may_emit_jobposting_schema: false,
          may_email_jobs: false,
          required_destination_kind: "source_url",
          refresh_interval_seconds: 43_200,
          last_successful_import_at: "2026-07-13T13:07:22.886Z",
          runs: [
            {
              started_at: "2026-07-13T13:07:22.886Z",
              completed_at: "2026-07-13T13:07:22.886Z",
              source_checked_at: null,
              status: "succeeded",
              duration_ms: 0,
              fetched: 39,
              accepted: null,
              new_canonical_jobs: 0,
              updated: 0,
              duplicates: null,
              rejected: null,
              closed: 0,
              nigeria_local: null,
              explicit_nigeria_africa_eligible: null,
              unclear_eligibility: null,
              errors: 0,
              error_code: null,
            },
          ],
        },
      ],
      open_alerts: [],
    });

    expect(result.sources[0]?.runs[0]?.accepted).toBeNull();
    expect(result.sources[0]?.runs[0]?.new_canonical_jobs).toBe(0);
    expect(result.workers[0]).toMatchObject({
      task_key: "ats_source_sync",
      last_status: "skipped",
      last_success_at: null,
      freshness: "healthy",
    });
  });
});

describe("job supply health DTO", () => {
  it("keeps canonical creation separate from raw occurrences", () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(8 + index).padStart(2, "0")}T00:00:00.000Z`,
      new_canonical_jobs: index,
      raw_occurrences: index * 3,
    }));
    const health = jobSupplyHealthSchema.parse({
      generated_at: "2026-07-14T00:00:00.000Z",
      window_start: "2026-07-07T00:00:00.000Z",
      target_daily_new_canonical: 200,
      authorized_daily_capacity: 0,
      seven_day_new_canonical: 21,
      seven_day_raw_occurrences: 63,
      pending_fuzzy_reviews: 2,
      broken_apply_links: 1,
      daily: days,
      sources: [
        {
          adapter_key: "salarypadi_employer_submissions",
          name: "Direct employer submissions",
          authority: "direct_employer",
          policy_state: "enabled",
          runnable: true,
          review_due_at: "2026-08-10T00:00:00.000Z",
          missing_dependencies: [],
          new_canonical_jobs: 4,
          raw_occurrences: 4,
          run_count: 2,
          last_run_status: "succeeded",
          fetched: 5,
          accepted: 4,
          updated: 1,
          duplicates: 1,
          rejected: 0,
          closed: 0,
          nigeria_local: 2,
          explicit_nigeria_africa_eligible: 4,
          unclear_eligibility: 0,
          errors: 0,
          last_successful_import_at: null,
        },
      ],
    });
    expect(health.target_daily_new_canonical).toBe(200);
    expect(health.authorized_daily_capacity).toBe(0);
    expect(health.seven_day_new_canonical).not.toBe(
      health.seven_day_raw_occurrences,
    );
  });
});
