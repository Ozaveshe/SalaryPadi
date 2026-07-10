import { afterEach, describe, expect, it, vi } from "vitest";

import { runAlertDelivery } from "../alert-delivery.mjs";
import { runCurrencyRates } from "../currency-rates";
import { runJobSourceSync } from "../job-source-sync.mjs";
import type { WorkerExecution } from "./runtime";

function setEnvironment(values: Record<string, string | undefined>) {
  vi.stubGlobal("Netlify", {
    env: { get: (name: string) => values[name] },
  });
}

function execution(): WorkerExecution {
  return {
    signal: new AbortController().signal,
    remainingMs: () => 20_000,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scheduled provider controls", () => {
  it("skips disabled providers before any claim, fetch, or write", async () => {
    setEnvironment({
      REMOTIVE_SOURCE_ENABLED: "false",
      EMAIL_PROVIDER: "none",
      CURRENCY_RATE_PROVIDER: "none",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(runJobSourceSync(execution())).resolves.toMatchObject({
      status: "skipped",
      summary: { reason: "remotive_source_disabled" },
    });
    await expect(runAlertDelivery(execution())).resolves.toMatchObject({
      status: "skipped",
      summary: { reason: "email_provider_disabled" },
    });
    await expect(runCurrencyRates(execution())).resolves.toMatchObject({
      status: "skipped",
      summary: { reason: "currency_provider_disabled" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caps an enabled alert claim at one and threads an abort signal", async () => {
    setEnvironment({
      EMAIL_PROVIDER: "resend",
      NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(runAlertDelivery(execution())).resolves.toMatchObject({
      status: "succeeded",
      summary: { claimed: 0 },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/rest/v1/rpc/worker_claim_alert_deliveries");
    expect(JSON.parse(String(init?.body))).toEqual({ p_limit: 1 });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
