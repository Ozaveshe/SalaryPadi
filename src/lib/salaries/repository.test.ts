import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import {
  getSalaryCellProgressResult,
  listPublishedSalaryAggregatesResult,
  searchSalaryAggregatesResult,
} from "@/lib/salaries/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    select: () => query,
    order: () => query,
    limit: () => query,
    ilike: () => query,
    eq: () => query,
    then: result.then.bind(result),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function clientReturningWithLimit(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const limit = vi.fn();
  const query = {
    select: () => query,
    order: () => query,
    limit: (value: number) => {
      limit(value);
      return query;
    },
    ilike: () => query,
    eq: () => query,
    then: result.then.bind(result),
  };
  return {
    client: { schema: () => ({ from: () => query }) } as never,
    limit,
  };
}

function clientCapturingSearch(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const ilike = vi.fn();
  const order = vi.fn();
  const query = {
    select: () => query,
    order: (column: string, options: unknown) => {
      order(column, options);
      return query;
    },
    limit: () => query,
    ilike: (column: string, pattern: string) => {
      ilike(column, pattern);
      return query;
    },
    eq: () => query,
    then: result.then.bind(result),
  };
  return {
    client: { schema: () => ({ from: () => query }) } as never,
    ilike,
    order,
  };
}

function clientReturningProgress(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    client: { schema: () => ({ rpc }) } as never,
    rpc,
  };
}

function clientReturningPublishedPages(
  pages: Array<{ data: unknown; error: unknown }>,
) {
  let page = 0;
  const range = vi.fn().mockImplementation(() => {
    const result = pages[Math.min(page, pages.length - 1)];
    page += 1;
    return Promise.resolve(result);
  });
  const query = {
    select: () => query,
    order: () => query,
    range,
  };
  return {
    client: { schema: () => ({ from: () => query }) } as never,
    range,
  };
}

const validAggregate = {
  id: "e6aa35b4-5694-4c56-ac86-3df86d466296",
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
  evidence_lane: "first_party_contributions",
  source_name: "SalaryPadi community",
  source_url: null,
  methodology_url: null,
  source_role_label: null,
  source_pay_period: null,
  source_median_amount: null,
  provenance_label: "Privacy-thresholded approved contributions",
};

describe("salary repository", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns validated public aggregates", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validAggregate]));
    const result = await searchSalaryAggregatesResult({ role: "product" });
    expect(result.state).toBe("ready");
    expect(result.data[0]?.sampleSize).toBe(5);
    expect(result.data[0]?.evidenceLane).toBe("first_party_contributions");
  });

  it("treats role wildcard characters literally and orders the bounded window", async () => {
    const { client, ilike, order } = clientCapturingSearch([]);
    mockedCreateClient.mockResolvedValue(client);

    await searchSalaryAggregatesResult({ role: "100%_engineer\\" });

    expect(ilike).toHaveBeenCalledWith(
      "role_family",
      "%100\\%\\_engineer\\\\%",
    );
    expect(order.mock.calls).toEqual([
      ["calculated_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("keeps a reviewed online benchmark separate from contribution evidence", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          ...validAggregate,
          id: "753aaf0d-7958-4458-8dff-f94e05ff7c77",
          company_slug: null,
          sample_size: null,
          evidence_lane: "verified_online_benchmark",
          source_name: "Official statistics publisher",
          source_url: "https://example.gov/wages",
          methodology_url: "https://example.gov/wages/methodology",
          source_role_label: "Software developers",
          source_pay_period: "annual",
          source_median_amount: 120000,
          provenance_label: "Reviewed official statistics",
        },
      ]),
    );

    const result = await searchSalaryAggregatesResult({ role: "software" });

    expect(result.state).toBe("ready");
    expect(result.data[0]).toMatchObject({
      evidenceLane: "verified_online_benchmark",
      sampleSize: null,
      sourceName: "Official statistics publisher",
      sourceRoleLabel: "Software developers",
    });
  });

  it("rejects an online benchmark without HTTPS source evidence", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          ...validAggregate,
          evidence_lane: "verified_online_benchmark",
          source_name: "Unknown source",
          source_url: "http://example.test/wages",
        },
      ]),
    );

    expect((await searchSalaryAggregatesResult({})).state).toBe("degraded");
  });

  it("rejects online benchmark evidence URLs with embedded credentials", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          ...validAggregate,
          evidence_lane: "verified_online_benchmark",
          sample_size: null,
          source_url: "https://user:secret@example.test/wages",
          methodology_url: "https://example.test/methodology",
          source_role_label: "Software developers",
          source_pay_period: "annual",
          source_median_amount: 120_000,
        },
      ]),
    );

    expect((await searchSalaryAggregatesResult({})).state).toBe("degraded");
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

  it("quarantines duplicate aggregate identities", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([validAggregate, validAggregate]),
    );

    const result = await searchSalaryAggregatesResult({});

    expect(result).toMatchObject({
      state: "degraded",
      data: [{ id: validAggregate.id }],
      issues: [{ code: "salaries_duplicate_rows" }],
    });
  });

  it("reports search-result overflow instead of silently truncating", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = clientReturningWithLimit(
      Array.from({ length: 51 }, (_, index) => ({
        ...validAggregate,
        id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      })),
    );
    mockedCreateClient.mockResolvedValue(store.client);

    const result = await searchSalaryAggregatesResult({});

    expect(result.state).toBe("degraded");
    expect(result.data).toHaveLength(50);
    expect(result.issues[0]?.code).toBe("salaries_capacity_exceeded");
    expect(store.limit).toHaveBeenCalledWith(51);
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

  it("keeps an unconfigured backend distinct across every public read", async () => {
    mockedCreateClient.mockResolvedValue(null);

    const search = await searchSalaryAggregatesResult({});
    const progress = await getSalaryCellProgressResult({
      role: "Product Management",
      country: "NG",
    });
    const sitemap = await listPublishedSalaryAggregatesResult();

    expect(search).toMatchObject({ state: "unconfigured", data: [] });
    expect(progress).toMatchObject({ state: "unconfigured", data: null });
    expect(sitemap).toMatchObject({ state: "unconfigured", data: [] });
  });

  it("rejects malformed progress containers and duplicate cells", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invalidContainer = clientReturningProgress({});
    mockedCreateClient.mockResolvedValueOnce(invalidContainer.client);
    const invalid = await getSalaryCellProgressResult({
      role: "Product Management",
      country: "NG",
    });
    expect(invalid.state).toBe("unavailable");
    expect(invalid.issues[0]?.code).toBe("salary_progress_invalid_container");

    const duplicateCells = clientReturningProgress([{}, {}]);
    mockedCreateClient.mockResolvedValueOnce(duplicateCells.client);
    const duplicate = await getSalaryCellProgressResult({
      role: "Product Management",
      country: "NG",
    });
    expect(duplicate.state).toBe("invalid");
    expect(duplicate.issues[0]?.code).toBe("salary_progress_invalid_rows");
  });

  it("maps thrown client failures without swallowing Next.js control flow", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("client unavailable");
    mockedCreateClient.mockRejectedValue(failure);

    const result = await searchSalaryAggregatesResult({});

    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
    expect(result.state).toBe("unavailable");
    expect(result.issues[0]?.code).toBe("salaries_query_failed");
  });

  it("paginates published aggregates and validates the combined result", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      ...validAggregate,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    const { client, range } = clientReturningPublishedPages([
      { data: firstPage, error: null },
      { data: [validAggregate], error: null },
    ]);
    mockedCreateClient.mockResolvedValue(client);

    const result = await listPublishedSalaryAggregatesResult();

    expect(result.state).toBe("ready");
    expect(result.data).toHaveLength(1_001);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });

  it("fails sitemap reads closed on page errors and capacity overflow", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = clientReturningPublishedPages([
      { data: null, error: { code: "database_unavailable" } },
    ]);
    mockedCreateClient.mockResolvedValueOnce(failed.client);
    const failedResult = await listPublishedSalaryAggregatesResult();
    expect(failedResult.state).toBe("unavailable");
    expect(failedResult.issues[0]?.code).toBe("salary_sitemap_query_failed");

    const fullPage = Array(1_000).fill(validAggregate);
    const capacity = clientReturningPublishedPages([
      { data: fullPage, error: null },
    ]);
    mockedCreateClient.mockResolvedValueOnce(capacity.client);
    const capacityResult = await listPublishedSalaryAggregatesResult();
    expect(capacityResult.state).toBe("invalid");
    expect(capacityResult.issues[0]?.code).toBe(
      "salary_sitemap_capacity_exceeded",
    );
    expect(capacity.range).toHaveBeenCalledTimes(40);
  });

  it("quarantines malformed sitemap rows while retaining valid evidence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = clientReturningPublishedPages([
      { data: [validAggregate, { id: "broken" }], error: null },
    ]);
    mockedCreateClient.mockResolvedValue(client);

    const result = await listPublishedSalaryAggregatesResult();

    expect(result.state).toBe("degraded");
    expect(result.data).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("salary_sitemap_invalid_rows");
  });
});
