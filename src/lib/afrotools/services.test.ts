import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getAfroToolsConfig: () => ({
    baseUrl: "https://afrotools.com/api/v1",
    apiKey: "secret",
  }),
}));

import {
  AFROTOOLS_FX_DATA_POLICY,
  calculateAfroToolsPaye,
  getAfroToolsFxRate,
} from "@/lib/afrotools/services";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calculation = {
  status: "success",
  input: { country: "NG", grossAnnual: 6_000_000 },
  deductions: { pension: 480_000, totalDeductions: 480_000 },
  tax: { taxableIncome: 5_520_000, netTax: 847_800, bands: [] },
  result: {
    netAnnual: 4_672_200,
    netMonthly: 389_350,
    effectiveRate: "14.13%",
  },
  _meta: {
    api: "AfroTax",
    version: "v1",
    timestamp: "2026-07-11T00:00:00.000Z",
    sandbox: false,
    dataPolicy: "deterministic",
    docs: "https://afrotools.com/api/docs/",
  },
};
const rules = {
  country: "NG",
  country_name: "Nigeria",
  currency: "NGN",
  tax_authority: "NRS",
  sandbox: false,
  data_policy: "official rules",
  paye: { regimes: ["NTA_2026"], year: "2026", source: "Nigeria Tax Act" },
};

describe("AfroTools verified services", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("supports documented gross PAYE input and attaches rule evidence", async () => {
    const provider = vi
      .fn()
      .mockResolvedValueOnce(json(calculation))
      .mockResolvedValueOnce(json(rules));
    vi.stubGlobal("fetch", provider);
    const result = await calculateAfroToolsPaye(
      {
        country: "NG",
        mode: "gross_to_net",
        period: "monthly",
        amount: 500_000,
      },
      new Date("2026-07-11T12:00:00.000Z"),
    );
    expect(result.netMonthly).toBe(389_350);
    expect(result.evidence.rulesVersion).toBe("NTA_2026");
    expect(
      JSON.parse(String((provider.mock.calls[0]?.[1] as RequestInit).body)),
    ).toEqual({ country: "NG", grossMonthly: 500_000 });
  });

  it("rejects a reverse PAYE response that does not match the requested net", async () => {
    const provider = vi
      .fn()
      .mockResolvedValueOnce(json(calculation))
      .mockResolvedValueOnce(json(rules));
    vi.stubGlobal("fetch", provider);
    await expect(
      calculateAfroToolsPaye(
        {
          country: "NG",
          mode: "net_to_gross",
          period: "monthly",
          amount: 400_000,
        },
        new Date("2026-07-11T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects stale verification timestamps and prior-year rules", async () => {
    const provider = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          ...calculation,
          _meta: {
            ...calculation._meta,
            timestamp: "2026-06-01T00:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(json(rules));
    vi.stubGlobal("fetch", provider);
    await expect(
      calculateAfroToolsPaye(
        {
          country: "NG",
          mode: "gross_to_net",
          period: "monthly",
          amount: 500_000,
        },
        new Date("2026-07-11T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("returns stale-but-bounded FX evidence and rejects rates older than 30 days", async () => {
    const base = {
      base: "USD",
      target: "NGN",
      pair: "USD/NGN",
      rate: 1500,
      source: "AfroFX",
      sandbox: false,
      data_policy: "provider data",
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ ...base, updated_at: "2026-07-01T00:00:00.000Z" }),
        ),
    );
    await expect(
      getAfroToolsFxRate("USD", "NGN", new Date("2026-07-11T00:00:00.000Z")),
    ).resolves.toMatchObject({ freshness: "stale" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ ...base, updated_at: "2026-05-01T00:00:00.000Z" }),
        ),
    );
    await expect(
      getAfroToolsFxRate("USD", "NGN", new Date("2026-07-11T00:00:00.000Z")),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("accepts the documented production FX shape without optional sandbox metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          base: "USD",
          target: "NGN",
          pair: "USD/NGN",
          rate: 1500,
          source: "AfroFX",
          updated_at: "2026-07-11T00:00:00.000Z",
        }),
      ),
    );

    await expect(
      getAfroToolsFxRate("USD", "NGN", new Date("2026-07-11T01:00:00.000Z")),
    ).resolves.toMatchObject({
      rate: 1500,
      source: "AfroFX",
      sandbox: false,
      dataPolicy: AFROTOOLS_FX_DATA_POLICY,
      freshness: "fresh",
    });
  });
});
