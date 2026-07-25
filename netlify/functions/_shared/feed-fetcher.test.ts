import { describe, expect, it, vi } from "vitest";

import { fetchEmployerFeed, retryAfterMs } from "./feed-fetcher";

const XML = '<?xml version="1.0"?><jobs></jobs>';

function xmlResponse(body = XML, headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml", ...headers },
  });
}

function options(fetchImpl: typeof fetch) {
  return { timeoutMs: 5_000, fetchImpl };
}

describe("employer feed fetcher — destinations it refuses outright", () => {
  const refused: Array<[string, string]> = [
    ["http://careers.acme.com/f.xml", "feed_url_not_https"],
    ["https://user:pw@careers.acme.com/f.xml", "feed_url_has_credentials"],
    ["https://careers.acme.com:8443/f.xml", "feed_url_port_not_permitted"],
    ["https://localhost/f.xml", "feed_url_host_not_permitted"],
    ["https://127.0.0.1/f.xml", "feed_url_host_not_permitted"],
    ["https://10.0.0.5/f.xml", "feed_url_host_not_permitted"],
    ["https://169.254.169.254/latest/meta-data", "feed_url_host_not_permitted"],
    ["https://[::1]/f.xml", "feed_url_host_not_permitted"],
    ["https://internal/f.xml", "feed_url_host_not_permitted"],
    ["https://build.internal/f.xml", "feed_url_host_not_permitted"],
    ["https://svc.local/f.xml", "feed_url_host_not_permitted"],
    ["not-a-url", "feed_url_invalid"],
  ];

  for (const [url, code] of refused) {
    it(`refuses ${url} without making a request`, async () => {
      const fetchImpl = vi.fn();
      await expect(
        fetchEmployerFeed(url, options(fetchImpl as never)),
      ).rejects.toMatchObject({ code });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  }

  it("refuses the cloud metadata endpoint even by hostname", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchEmployerFeed(
        "https://metadata.google.internal/computeMetadata/v1/",
        options(fetchImpl as never),
      ),
    ).rejects.toMatchObject({ code: "feed_url_host_not_permitted" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("employer feed fetcher — request shape", () => {
  it("sends a credential-free, non-following, deadlined GET", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse());
    await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      options(fetchImpl),
    );

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the body for an accepted content type", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse());
    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      options(fetchImpl),
    );
    expect(result).toEqual({ ok: true, text: XML, complete: true });
  });
});

describe("employer feed fetcher — upstream problems are failures, not throws", () => {
  it("reports a non-2xx as a failed retrieval", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      fetchEmployerFeed(
        "https://careers.acme.com/jobs.xml",
        options(fetchImpl),
      ),
    ).resolves.toMatchObject({ ok: false, complete: false });
  });

  it("reports a network error as a failed retrieval", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket hang up"));
    await expect(
      fetchEmployerFeed(
        "https://careers.acme.com/jobs.xml",
        options(fetchImpl),
      ),
    ).resolves.toMatchObject({ ok: false });
  });

  it("rejects an unexpected content type", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(
      fetchEmployerFeed(
        "https://careers.acme.com/jobs.xml",
        options(fetchImpl),
      ),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("employer feed fetcher — redirect policy", () => {
  function redirect(location: string) {
    return new Response(null, { status: 302, headers: { location } });
  }

  it("follows a same-domain redirect", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirect("https://cdn.acme.com/jobs.xml"))
      .mockResolvedValueOnce(xmlResponse());

    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      options(fetchImpl),
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect that leaves the employer's domain", async () => {
    // The case redirect:"follow" would have taken silently.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirect("https://evil.example/jobs.xml"));

    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      options(fetchImpl),
    );
    expect(result).toMatchObject({ ok: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to an internal host", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirect("https://169.254.169.254/latest/"));
    await expect(
      fetchEmployerFeed(
        "https://careers.acme.com/jobs.xml",
        options(fetchImpl),
      ),
    ).resolves.toMatchObject({ ok: false });
  });

  it("stops after the redirect limit", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(redirect("https://careers.acme.com/again.xml"));
    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      options(fetchImpl),
    );
    expect(result).toMatchObject({ ok: false });
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

describe("employer feed fetcher — byte bounds", () => {
  it("refuses a declared over-limit body without reading it", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      xmlResponse(XML, {
        "content-length": String(10 * 1024 * 1024),
      }),
    );
    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      { ...options(fetchImpl), maximumBytes: 1_024 },
    );
    expect(result).toMatchObject({ ok: false, complete: false });
  });

  it("cancels a streamed body that passes the cap and reports it incomplete", async () => {
    // No content-length: the cap can only be enforced while streaming.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(2_048)));
        controller.enqueue(new TextEncoder().encode("y".repeat(2_048)));
        controller.close();
      },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
    );

    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      { ...options(fetchImpl), maximumBytes: 1_024 },
    );
    // ok:false AND complete:false — an over-limit body must never be treated
    // as an authoritative snapshot.
    expect(result).toEqual({ ok: false, text: "", complete: false });
  });

  it("accepts a body inside the cap", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse());
    const result = await fetchEmployerFeed(
      "https://careers.acme.com/jobs.xml",
      { ...options(fetchImpl), maximumBytes: 1_024 },
    );
    expect(result).toMatchObject({ ok: true, complete: true });
  });
});

describe("Retry-After", () => {
  function headers(value: string | null) {
    return { get: () => value };
  }

  it("is honoured only for 429 and 503", () => {
    expect(retryAfterMs({ status: 429, headers: headers("30") })).toBe(30_000);
    expect(retryAfterMs({ status: 503, headers: headers("5") })).toBe(5_000);
    expect(retryAfterMs({ status: 500, headers: headers("30") })).toBeNull();
    expect(retryAfterMs({ status: 200, headers: headers("30") })).toBeNull();
  });

  it("is bounded so a hostile header cannot stall the worker", () => {
    expect(retryAfterMs({ status: 429, headers: headers("99999") })).toBe(
      300_000,
    );
  });

  it("ignores an unparseable header", () => {
    expect(retryAfterMs({ status: 429, headers: headers("soon") })).toBeNull();
    expect(retryAfterMs({ status: 429, headers: headers(null) })).toBeNull();
  });
});
