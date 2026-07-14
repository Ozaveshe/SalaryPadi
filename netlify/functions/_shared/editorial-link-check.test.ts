import { describe, expect, it, vi } from "vitest";

import { checkEditorialLink, type LinkTarget } from "./editorial";

const target: LinkTarget = {
  source_id: null,
  article_id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
  url: "https://example.com/evidence",
};

describe("editorial link destination boundary", () => {
  it("rejects a hostname that resolves to a private address before HEAD", async () => {
    const head = vi.fn();

    await expect(
      checkEditorialLink(target, new AbortController().signal, {
        resolve: async () => ["127.0.0.1"],
        head,
      }),
    ).resolves.toMatchObject({
      status: "broken",
      http_status: null,
      error_code: "unsafe_or_invalid_url",
    });
    expect(head).not.toHaveBeenCalled();
  });

  it.each([
    [204, null, "healthy", null],
    [302, "https://example.com/new-evidence", "redirected", null],
    [404, null, "broken", "http_404"],
  ] as const)(
    "pins a public address and maps HTTP %s to %s",
    async (status, location, expectedStatus, errorCode) => {
      const head = vi.fn().mockResolvedValue({ status, location });

      await expect(
        checkEditorialLink(target, new AbortController().signal, {
          resolve: async () => ["8.8.8.8"],
          head,
        }),
      ).resolves.toMatchObject({
        status: expectedStatus,
        http_status: status,
        final_url: status === 302 ? location : "https://example.com/evidence",
        error_code: errorCode,
      });
      expect(head).toHaveBeenCalledWith(
        new URL(target.url),
        "8.8.8.8",
        expect.any(AbortSignal),
      );
    },
  );

  it("distinguishes DNS failure from an unsafe destination", async () => {
    await expect(
      checkEditorialLink(target, new AbortController().signal, {
        resolve: async () => {
          throw new Error("DNS unavailable");
        },
      }),
    ).resolves.toMatchObject({
      status: "broken",
      error_code: "link_resolution_failed",
    });
  });

  it.each([
    [null, "redirect_location_missing"],
    ["http://example.com/insecure", "unsafe_redirect_location"],
    ["https://user:secret@example.com/private", "unsafe_redirect_location"],
  ] as const)(
    "rejects an unverified redirect location: %s",
    async (location, errorCode) => {
      await expect(
        checkEditorialLink(target, new AbortController().signal, {
          resolve: async () => ["8.8.8.8"],
          head: async () => ({ status: 302, location }),
        }),
      ).resolves.toMatchObject({
        status: "broken",
        http_status: 302,
        final_url: null,
        error_code: errorCode,
      });
    },
  );

  it("normalizes a safe relative redirect", async () => {
    await expect(
      checkEditorialLink(target, new AbortController().signal, {
        resolve: async () => ["8.8.8.8"],
        head: async () => ({ status: 301, location: "/new-evidence" }),
      }),
    ).resolves.toMatchObject({
      status: "redirected",
      final_url: "https://example.com/new-evidence",
      error_code: null,
    });
  });

  it("preserves a request timeout without exposing transport detail", async () => {
    await expect(
      checkEditorialLink(target, new AbortController().signal, {
        resolve: async () => ["8.8.8.8"],
        head: async () => {
          throw new DOMException("private timeout detail", "TimeoutError");
        },
      }),
    ).resolves.toMatchObject({
      status: "timeout",
      http_status: null,
      final_url: null,
      error_code: "link_request_failed",
    });
  });
});
