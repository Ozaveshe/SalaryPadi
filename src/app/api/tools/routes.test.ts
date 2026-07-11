import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getAfroToolsConfig: () => ({
    baseUrl: "https://afrotools.com/api/v1",
    apiKey: "test-provider-secret",
  }),
  getAppOrigin: () => "https://salarypadi.test",
}));

import { POST as checkScam } from "@/app/api/tools/job-scam-check/route";
import { POST as compareOffer } from "@/app/api/tools/offer-compare/route";
import { POST as convertSalary } from "@/app/api/tools/salary-convert/route";
import { POST as calculatePaye } from "@/app/api/tools/take-home-pay/route";

const offerInput = {
  offerA: {
    id: "a",
    label: "Offer A",
    basePay: {
      amount: 500_000,
      currency: "NGN",
      payPeriod: "monthly" as const,
    },
    payBasis: "gross" as const,
    estimatedDeductions: [],
    terms: { arrangement: "employee" as const, workMode: "remote" as const },
  },
  offerB: {
    id: "b",
    label: "Offer B",
    basePay: {
      amount: 600_000,
      currency: "NGN",
      payPeriod: "monthly" as const,
    },
    payBasis: "gross" as const,
    estimatedDeductions: [],
    terms: { arrangement: "employee" as const, workMode: "hybrid" as const },
  },
  comparisonCurrency: "NGN",
};

function request(path: string, body: unknown) {
  return new Request(`https://salarypadi.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://salarypadi.test",
    },
    body: JSON.stringify(body),
  });
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("tool API boundaries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("compares same-currency offers locally without calling AfroTools", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const response = await compareOffer(
      request("/api/tools/offer-compare", { consent: true, input: offerInput }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.provider).toBe("salarypadi_deterministic");
    expect(body.fxEvidence).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not return an offer result when AfroTools FX is rate-limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({}, 429, { "Retry-After": "60" })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input = {
      ...offerInput,
      offerB: {
        ...offerInput.offerB,
        basePay: { ...offerInput.offerB.basePay, currency: "USD" },
      },
    };
    const response = await compareOffer(
      request("/api/tools/offer-compare", { consent: true, input }),
    );
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(body.result).toBeUndefined();
    expect(body.code).toBe("rate_limited");
  });

  it("does not send the salary amount to AfroTools FX", async () => {
    const provider = vi.fn().mockResolvedValue(
      json({
        base: "USD",
        target: "NGN",
        pair: "USD/NGN",
        rate: 1500,
        source: "AfroFX",
        updated_at: new Date().toISOString(),
        sandbox: false,
        data_policy: "provider data",
      }),
    );
    vi.stubGlobal("fetch", provider);
    const response = await convertSalary(
      request("/api/tools/salary-convert", {
        input: { amount: 123456, from: "USD", to: "NGN", period: "monthly" },
      }),
    );
    const body = await response.json();
    expect(body.result.convertedAmount).toBe(185184000);
    expect(
      (provider.mock.calls[0]?.[0] as URL).searchParams.get("amount"),
    ).toBe("1");
    expect((provider.mock.calls[0]?.[0] as URL).toString()).not.toContain(
      "123456",
    );
  });

  it("returns no PAYE result for a malformed provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ status: "success" })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await calculatePaye(
      request("/api/tools/take-home-pay", {
        consent: true,
        input: {
          country: "NG",
          mode: "gross_to_net",
          period: "monthly",
          amount: 500000,
        },
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.result).toBeUndefined();
    expect(body.code).toBe("invalid_response");
  });

  it("keeps the explainable scam checker local and deterministic", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const vacancyText = "Urgent private vacancy text";
    const response = await checkScam(
      request("/api/tools/job-scam-check", {
        consent: true,
        input: { vacancyText },
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.provider).toBe("salarypadi_deterministic");
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized inputs before provider access", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const malformed = await convertSalary(
      request("/api/tools/salary-convert", {
        input: { amount: -1, from: "US", to: "NGN", period: "monthly" },
      }),
    );
    expect(malformed.status).toBe(400);
    const oversized = await convertSalary(
      request("/api/tools/salary-convert", {
        input: {
          amount: 1,
          from: "USD",
          to: "NGN",
          period: "monthly",
          padding: "x".repeat(11_000),
        },
      }),
    );
    expect(oversized.status).toBe(413);
    expect(provider).not.toHaveBeenCalled();
  });
});
