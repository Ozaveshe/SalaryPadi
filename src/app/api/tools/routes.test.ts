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
import { compareOffers } from "@/lib/offers";

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

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://salarypadi.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://salarypadi.test",
    },
    body: JSON.stringify(body),
  });
}

function providerJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("tool API provider fallbacks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    {
      label: "timeout",
      code: "timeout",
      status: 504,
      fetchResult: () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      },
    },
    {
      label: "401",
      code: "unauthorized",
      status: 401,
      fetchResult: () =>
        Promise.resolve(providerJson({ error: "private" }, 401)),
    },
    {
      label: "429",
      code: "rate_limited",
      status: 429,
      fetchResult: () =>
        Promise.resolve(providerJson({ error: "private" }, 429)),
    },
    {
      label: "500",
      code: "upstream_5xx",
      status: 500,
      fetchResult: () =>
        Promise.resolve(providerJson({ error: "private" }, 500)),
    },
  ])("uses the local scam fallback for provider $label", async (scenario) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(scenario.fetchResult));
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const vacancyText = "Urgent private vacancy text";

    const response = await checkScam(
      jsonRequest("/api/tools/job-scam-check", {
        consent: true,
        input: { vacancyText },
      }),
    );
    const body = (await response.json()) as {
      provider: string;
      result: { inputCoverage: { urlFetchPerformed: boolean } };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.provider).toBe("salarypadi_fallback");
    expect(body.result.inputCoverage.urlFetchPerformed).toBe(false);

    const log = String(warning.mock.calls[0]?.[0]);
    expect(JSON.parse(log)).toMatchObject({
      event: "provider_fallback",
      operation: "job_scam_check",
      code: scenario.code,
      status: scenario.status,
    });
    expect(log).not.toContain(vacancyText);
    expect(log).not.toContain("test-provider-secret");
  });

  it("rejects a success-shaped scam result with missing nested coverage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        providerJson({
          status: "success",
          result: {
            riskTier: "caution",
            riskLabel: "Caution",
            summary: "Review it.",
            flags: [],
            verificationSteps: [],
            safeNextActions: [],
            limitations: [],
          },
        }),
      ),
    );
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const response = await checkScam(
      jsonRequest("/api/tools/job-scam-check", {
        consent: true,
        input: { vacancyText: "A normal vacancy description" },
      }),
    );
    const body = (await response.json()) as { provider: string };

    expect(body.provider).toBe("salarypadi_fallback");
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toMatchObject({
      code: "invalid_response",
      status: 502,
    });
  });

  it("rejects a shallow offer result instead of sending it to the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        providerJson({
          status: "success",
          result: {
            comparisonCurrency: "NGN",
            offerA: {},
            offerB: {},
            differences: {},
            nonFinancialDifferences: [],
            negotiationTalkingPoints: [],
            normalizationNotes: [],
          },
        }),
      ),
    );
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const response = await compareOffer(
      jsonRequest("/api/tools/offer-compare", {
        consent: true,
        input: offerInput,
      }),
    );
    const body = (await response.json()) as { provider: string };

    expect(body.provider).toBe("salarypadi_fallback");
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toMatchObject({
      code: "invalid_response",
      status: 502,
    });
  });

  it("accepts a complete nested offer result", async () => {
    const result = compareOffers(offerInput);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(providerJson({ status: "success", result })),
    );

    const response = await compareOffer(
      jsonRequest("/api/tools/offer-compare", {
        consent: true,
        input: offerInput,
      }),
    );
    const body = (await response.json()) as { provider: string };

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.provider).toBe("afrotools");
  });

  it("returns 413 for an oversized streamed body without Content-Length", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("x".repeat(30_001)));
        controller.close();
      },
    });
    const request = new Request(
      "https://salarypadi.test/api/tools/job-scam-check",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://salarypadi.test",
        },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);

    const response = await checkScam(request);

    expect(request.headers.get("content-length")).toBeNull();
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(provider).not.toHaveBeenCalled();
  });
});
