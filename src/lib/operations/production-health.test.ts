import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getJobSupplyHealth,
  getJobSupplyHealthResult,
  getProductionHealth,
  getProductionHealthResult,
  jobSupplyHealthSchema,
  productionHealthSchema,
} from "./production-health";

const minimalProductionHealth = {
  generated_at: "2026-07-14T00:00:00.000Z",
  window_start: "2026-06-30T00:00:00.000Z",
  workers: [],
  sources: [],
  open_alerts: [],
};

const minimalJobSupplyHealth = {
  generated_at: "2026-07-14T00:00:00.000Z",
  window_start: "2026-07-07T00:00:00.000Z",
  target_daily_new_canonical: 200,
  authorized_daily_capacity: 0,
  seven_day_new_canonical: 0,
  seven_day_raw_occurrences: 0,
  pending_fuzzy_reviews: 0,
  broken_apply_links: 0,
  daily: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-07-${String(8 + index).padStart(2, "0")}T00:00:00.000Z`,
    new_canonical_jobs: 0,
    raw_occurrences: 0,
  })),
  sources: [],
};

function operationsClient(error: unknown = null) {
  const rpc = vi.fn((name: string) =>
    Promise.resolve({
      data:
        name === "admin_get_production_health"
          ? minimalProductionHealth
          : minimalJobSupplyHealth,
      error,
    }),
  );
  return { client: { schema: () => ({ rpc }) } as never, rpc };
}

describe("production health DTO", () => {
  it("rejects worker and alert evidence that postdates the snapshot", () => {
    expect(
      productionHealthSchema.safeParse({
        ...minimalProductionHealth,
        workers: [
          {
            task_key: "job_lifecycle",
            enabled: true,
            expected_interval_seconds: 3_600,
            stale_after_seconds: 7_200,
            last_status: "succeeded",
            last_started_at: "2026-07-14T00:06:00.000Z",
            last_success_at: "2026-07-14T00:06:00.000Z",
            freshness: "healthy",
          },
        ],
        open_alerts: [
          {
            task_key: "job_lifecycle",
            severity: "critical",
            error_code: "worker_failed",
            created_at: "2026-07-14T00:06:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });

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

  it("rejects contradictory or duplicate worker evidence", () => {
    const worker = {
      task_key: "job_source_sync",
      enabled: true,
      expected_interval_seconds: 3_600,
      stale_after_seconds: 7_200,
      last_status: null,
      last_started_at: null,
      last_success_at: null,
      freshness: "never",
    };
    expect(
      productionHealthSchema.safeParse({
        ...minimalProductionHealth,
        workers: [worker, worker],
      }).success,
    ).toBe(false);
    expect(
      productionHealthSchema.safeParse({
        ...minimalProductionHealth,
        workers: [
          {
            ...worker,
            enabled: false,
            freshness: "healthy",
            stale_after_seconds: 1_800,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects source runs that complete before they start", () => {
    expect(
      productionHealthSchema.safeParse({
        ...minimalProductionHealth,
        sources: [
          {
            adapter_key: "direct_employer",
            name: "Direct employer",
            status: "active",
            allow_public_listing: true,
            may_store_full_description: true,
            may_index_jobs: true,
            may_emit_jobposting_schema: true,
            may_email_jobs: true,
            required_destination_kind: "canonical_url",
            refresh_interval_seconds: 3_600,
            last_successful_import_at: null,
            runs: [
              {
                started_at: "2026-07-14T02:00:00.000Z",
                completed_at: "2026-07-14T01:00:00.000Z",
                source_checked_at: null,
                status: "failed",
                duration_ms: 0,
                fetched: 0,
                accepted: 0,
                new_canonical_jobs: 0,
                updated: 0,
                duplicates: 0,
                rejected: 0,
                closed: 0,
                nigeria_local: 0,
                explicit_nigeria_africa_eligible: 0,
                unclear_eligibility: 0,
                errors: 1,
                error_code: "source_failed",
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects contradictory import lifecycle and error evidence", () => {
    const run = {
      started_at: "2026-07-14T01:00:00.000Z",
      completed_at: "2026-07-14T02:00:00.000Z",
      source_checked_at: "2026-07-14T01:30:00.000Z",
      status: "succeeded",
      duration_ms: 3_600_000,
      fetched: 1,
      accepted: 1,
      new_canonical_jobs: 1,
      updated: 0,
      duplicates: 0,
      rejected: 0,
      closed: 0,
      nigeria_local: 1,
      explicit_nigeria_africa_eligible: 0,
      unclear_eligibility: 0,
      errors: 0,
      error_code: null,
    };
    const source = {
      adapter_key: "direct_employer",
      name: "Direct employer",
      status: "active",
      allow_public_listing: true,
      may_store_full_description: true,
      may_index_jobs: true,
      may_emit_jobposting_schema: true,
      may_email_jobs: true,
      required_destination_kind: "canonical_url",
      refresh_interval_seconds: 3_600,
      last_successful_import_at: "2026-07-14T02:00:00.000Z",
      runs: [run],
    };

    for (const invalidRun of [
      { ...run, status: "running" },
      { ...run, status: "succeeded", errors: 1, error_code: "row_failed" },
      { ...run, errors: 0, error_code: "impossible_error" },
      {
        ...run,
        source_checked_at: "2026-07-14T02:05:00.001Z",
      },
    ]) {
      expect(
        productionHealthSchema.safeParse({
          ...minimalProductionHealth,
          sources: [{ ...source, runs: [invalidRun] }],
        }).success,
      ).toBe(false);
    }
  });
});

describe("job supply health DTO", () => {
  it("rejects a chronological daily series that postdates the snapshot", () => {
    const futureDays = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(15 + index).padStart(2, "0")}T00:00:00.000Z`,
      new_canonical_jobs: 0,
      raw_occurrences: 0,
    }));

    expect(
      jobSupplyHealthSchema.safeParse({
        ...minimalJobSupplyHealth,
        daily: futureDays,
      }).success,
    ).toBe(false);
  });

  it("keeps canonical creation separate from raw occurrences", () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(8 + index).padStart(2, "0")}T00:00:00.000Z`,
      new_canonical_jobs: index,
      raw_occurrences: index * 3,
    }));
    const health = jobSupplyHealthSchema.parse({
      generated_at: "2026-07-14T00:00:00.000Z",
      window_start: "2026-07-07T00:00:00.000Z",
      target_daily_new_canonical: 500,
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
    expect(health.target_daily_new_canonical).toBe(500);
    expect(health.authorized_daily_capacity).toBe(0);
    expect(health.seven_day_new_canonical).not.toBe(
      health.seven_day_raw_occurrences,
    );
  });

  it("rejects non-chronological days and contradictory runnable sources", () => {
    expect(
      jobSupplyHealthSchema.safeParse({
        ...minimalJobSupplyHealth,
        daily: [...minimalJobSupplyHealth.daily].reverse(),
        sources: [
          {
            adapter_key: "reviewed_source",
            name: "Reviewed source",
            authority: "employer_ats",
            policy_state: "disabled",
            runnable: true,
            review_due_at: null,
            missing_dependencies: ["api_key"],
            new_canonical_jobs: 0,
            raw_occurrences: 0,
            run_count: 0,
            last_run_status: null,
            fetched: 0,
            accepted: null,
            updated: 0,
            duplicates: null,
            rejected: null,
            closed: 0,
            nigeria_local: null,
            explicit_nigeria_africa_eligible: null,
            unclear_eligibility: null,
            errors: 0,
            last_successful_import_at: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects gaps, impossible daily totals, and repeated dependencies", () => {
    const source = {
      adapter_key: "reviewed_source",
      name: "Reviewed source",
      authority: "employer_ats" as const,
      policy_state: "disabled" as const,
      runnable: false,
      review_due_at: null,
      missing_dependencies: ["api_key", "api_key"],
      new_canonical_jobs: 0,
      raw_occurrences: 0,
      run_count: 0,
      last_run_status: null,
      fetched: 0,
      accepted: null,
      updated: 0,
      duplicates: null,
      rejected: null,
      closed: 0,
      nigeria_local: null,
      explicit_nigeria_africa_eligible: null,
      unclear_eligibility: null,
      errors: 0,
      last_successful_import_at: null,
    };
    const gap = minimalJobSupplyHealth.daily.map((day, index) =>
      index === 3 ? { ...day, date: "2026-07-12T00:00:00.000Z" } : day,
    );
    const impossible = minimalJobSupplyHealth.daily.map((day, index) =>
      index === 0 ? { ...day, new_canonical_jobs: 2, raw_occurrences: 1 } : day,
    );

    expect(
      jobSupplyHealthSchema.safeParse({
        ...minimalJobSupplyHealth,
        daily: gap,
      }).success,
    ).toBe(false);
    expect(
      jobSupplyHealthSchema.safeParse({
        ...minimalJobSupplyHealth,
        daily: impossible,
      }).success,
    ).toBe(false);
    expect(
      jobSupplyHealthSchema.safeParse({
        ...minimalJobSupplyHealth,
        sources: [source],
      }).success,
    ).toBe(false);
  });
});

describe("operations health readers", () => {
  it("returns typed, validated results from the requested RPCs", async () => {
    const { client, rpc } = operationsClient();

    await expect(getProductionHealth(client)).resolves.toEqual(
      minimalProductionHealth,
    );
    await expect(getJobSupplyHealth(client)).resolves.toEqual(
      minimalJobSupplyHealth,
    );
    expect((await getProductionHealthResult(client)).state).toBe("ready");
    expect((await getJobSupplyHealthResult(client)).state).toBe("ready");
    expect(rpc).toHaveBeenCalledWith("admin_get_production_health");
    expect(rpc).toHaveBeenCalledWith("admin_get_job_supply_health");
  });

  it("uses stable, operation-specific failure codes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = operationsClient({ code: "rpc_failed" });

    const production = await getProductionHealthResult(client);
    const supply = await getJobSupplyHealthResult(client);

    expect(production.issues[0]?.code).toBe("production_health_query_failed");
    expect(supply.issues[0]?.code).toBe("job_supply_health_query_failed");
  });
});
