import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/env", () => ({ getAppOrigin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { POST as signIn } from "@/app/api/auth/sign-in/route";
import { POST as signOut } from "@/app/api/auth/sign-out/route";
import { GET as callback } from "@/app/auth/callback/route";
import { GET as confirm } from "@/app/auth/confirm/route";
import { getAppOrigin } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function formRequest(path: string, body?: URLSearchParams) {
  return new Request(`https://salarypadi.com${path}`, {
    method: "POST",
    headers: {
      Origin: "https://salarypadi.com",
      Referer: "https://salarypadi.com/account",
      "Sec-Fetch-Site": "same-origin",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getAppOrigin).mockReturnValue("https://salarypadi.com");
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth } as never);
});

afterEach(() => vi.restoreAllMocks());

describe("authentication route operation boundaries", () => {
  it("redirects a client-creation failure to an explicit unavailable state", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(
      new Error("client transport failed"),
    );

    const response = await signIn(
      formRequest(
        "/api/auth/sign-in",
        new URLSearchParams({ email: "person@example.com", next: "/saved" }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/auth/sign-in?status=unavailable",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not claim an email link was requested when the OTP call throws", async () => {
    auth.signInWithOtp.mockRejectedValue(new Error("provider unavailable"));

    const response = await signIn(
      formRequest(
        "/api/auth/sign-in",
        new URLSearchParams({ email: "person@example.com", next: "/saved" }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("status=unavailable");
  });

  it("redirects a successful OTP request to the check-email state", async () => {
    const response = await signIn(
      formRequest(
        "/api/auth/sign-in",
        new URLSearchParams({ email: "person@example.com", next: "/saved" }),
      ),
    );

    expect(response.headers.get("location")).toContain("status=check-email");
    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "person@example.com",
        options: {
          emailRedirectTo: "https://salarypadi.com/auth/confirm?next=%2Fsaved",
        },
      }),
    );
  });

  it("does not imply sign-out succeeded when the provider returns an error", async () => {
    auth.signOut.mockResolvedValue({ error: new Error("sign-out failed") });

    const response = await signOut(formRequest("/api/auth/sign-out"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?auth=sign-out-error",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not imply sign-out succeeded without an authentication backend", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(null);

    const response = await signOut(formRequest("/api/auth/sign-out"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?auth=sign-out-error",
    );
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("contains callback and confirmation transport failures", async () => {
    auth.exchangeCodeForSession.mockRejectedValue(
      new Error("exchange transport failed"),
    );
    const callbackResponse = await callback(
      new Request(
        "https://salarypadi.com/auth/callback?code=test-code&next=%2Fsaved",
      ),
    );
    expect(callbackResponse.headers.get("location")).toBe(
      "https://salarypadi.com/auth/sign-in?status=link-error",
    );
    expect(callbackResponse.headers.get("cache-control")).toBe("no-store");

    auth.verifyOtp.mockRejectedValue(
      new Error("verification transport failed"),
    );
    const confirmResponse = await confirm(
      new Request(
        "https://salarypadi.com/auth/confirm?token_hash=test-token&type=email&next=%2Fsaved",
      ),
    );
    expect(confirmResponse.headers.get("location")).toBe(
      "https://salarypadi.com/auth/sign-in?status=link-error",
    );
    expect(confirmResponse.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed link credentials before creating a provider client", async () => {
    const callbackResponse = await callback(
      new Request(
        `https://salarypadi.com/auth/callback?code=${"a".repeat(2_049)}`,
      ),
    );
    const confirmResponse = await confirm(
      new Request(
        "https://salarypadi.com/auth/confirm?token_hash=line%0Abreak&type=email",
      ),
    );

    expect(callbackResponse.headers.get("location")).toBe(
      "https://salarypadi.com/auth/sign-in?status=link-error",
    );
    expect(confirmResponse.headers.get("location")).toBe(
      "https://salarypadi.com/auth/sign-in?status=link-error",
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
