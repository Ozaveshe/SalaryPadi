import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import {
  getSalaryCellProgressResult,
  searchSalaryAggregatesResult,
} from "@/lib/salaries/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    select: () => query,
    limit: () => query,
    ilike: () => query,
    eq: () => query,
    then: result.then.bind(result),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function clientReturningProgress(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    client: { schema: () => ({ rpc }) } as never,
    rpc,
  };
}

const validAggregate = {
  id: "aggregate-1",
  company_slug: "acme",
  role_slug: "product-manager",
  role_family: "Product Manager",
  country_code: "NG",
  seniority: "mid",
  arrangement: "employee",
  currency: "NGN",
  gross_net: "gross",
  median_annual: 12_000_000,
  percentile_25_annual: 10_000_000,
  percentile_75_annual: 14_000_000,
  sample_size: 5,
  submission_month_start: "2026-01-01",
  submission_month_end: "2026-06-01",
  confidence: "medium",
  calculated_at: "2026-07-11T00:00:00.000Z",
};

describe("salary repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns validated public aggregates", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validAggregate]));
    const result = await searchSalaryAggregatesResult({ role: "product" });
    expect(result.state).toBe("ready");
    expect(result.data[0]?.sampleSize).toBe(5);
  });

  it("quarantines malformed rows while preserving valid aggregates", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([validAggregate, { id: "broken" }]),
    );
    const result = await searchSalaryAggregatesResult({});
    expect(result.state).toBe("degraded");
    expect(result.data).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("salaries_invalid_rows");
  });

  it("distinguishes a query outage from no matching aggregate", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    expect((await searchSalaryAggregatesResult({})).state).toBe("unavailable");
  });

  it("returns only validated broad-cell progress", async () => {
    const { client, rpc } = clientReturningProgress([
      {
        role_slug: "product-management",
        role_family: "Product Management",
        country_code: "NG",
        displayed_contributions: null,
        privacy_threshold: 3,
        progress_status: "fewer_than_threshold",
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);

    const result = await getSalaryCellProgressResult({
      role: "Product Management",
      country: "ng",
    });

    expect(result.state).toBe("ready");
    expect(result.data?.status).toBe("fewer_than_threshold");
    expect(rpc).toHaveBeenCalledWith("get_salary_cell_progress", {
      p_role_slug: "product-management",
      p_country_code: "NG",
    });
  });

  it("treats a missing role cell as an honest empty result", async () => {
    const { client } = clientReturningProgress([]);
    mockedCreateClient.mockResolvedValue(client);

    const result = await getSalaryCellProgressResult({
      role: "Unknown",
      country: "NG",
    });

    expect(result.state).toBe("ready");
    expect(result.data).toBeNull();
  });

  it.each([1, 2])(
    "rejects an exact sub-threshold count of %i from the repository boundary",
    async (displayedContributions) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { client } = clientReturningProgress([
        {
          role_slug: "product-management",
          role_family: "Product Management",
          country_code: "NG",
          displayed_contributions: displayedContributions,
          privacy_threshold: 3,
          progress_status: "fewer_than_threshold",
        },
      ]);
      mockedCreateClient.mockResolvedValue(client);

      const result = await getSalaryCellProgressResult({
        role: "Product Management",
        country: "NG",
      });

      expect(result.state).toBe("invalid");
      expect(result.data).toBeNull();
      expect(result.issues[0]?.code).toBe(
        "salary_progress_privacy_gate_rejected",
      );
    },
  );
});
