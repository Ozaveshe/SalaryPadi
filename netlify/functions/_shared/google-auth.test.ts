import { generateKeyPairSync } from "node:crypto";

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getGoogleAccessToken } from "./google-auth";

const serviceAccountEmail =
  "salarypadi-indexing@test-project.iam.gserviceaccount.com";
let privateKey = "";

function stubEnvironment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    GOOGLE_SEARCH_SERVICE_ACCOUNT_EMAIL: serviceAccountEmail,
    GOOGLE_SEARCH_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
    ...overrides,
  };
  vi.stubGlobal("Netlify", {
    env: { get: (name: string) => values[name] },
  });
}

beforeAll(() => {
  privateKey = generateKeyPairSync("rsa", { modulusLength: 2_048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T05:00:00.000Z"));
  stubEnvironment();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Google service-account OAuth boundary", () => {
  it("rejects a non-service-account identity before any network request", async () => {
    stubEnvironment({
      GOOGLE_SEARCH_SERVICE_ACCOUNT_EMAIL: "user@example.com",
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGoogleAccessToken("scope", new AbortController().signal),
    ).rejects.toMatchObject({
      code: "invalid_google_service_account_email",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails before network access when the configured signing key is invalid", async () => {
    stubEnvironment({
      GOOGLE_SEARCH_SERVICE_ACCOUNT_PRIVATE_KEY: "not-a-private-key",
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGoogleAccessToken("scope", new AbortController().signal),
    ).rejects.toMatchObject({ code: "google_service_account_signing_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs the documented JWT grant without exposing the private key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: "opaque-access-token",
        token_type: "Bearer",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGoogleAccessToken(
        "https://www.googleapis.com/auth/indexing",
        new AbortController().signal,
      ),
    ).resolves.toBe("opaque-access-token");

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const assertion = form.get("assertion");
    expect(assertion).toBeTruthy();
    const payload = JSON.parse(
      Buffer.from(assertion!.split(".")[1]!, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_784_005_200,
      exp: 1_784_008_800,
    });
    expect(String(init?.body)).not.toContain("BEGIN PRIVATE KEY");
  });

  it("preserves only the provider status when OAuth rejects the grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403 })),
    );

    await expect(
      getGoogleAccessToken("scope", new AbortController().signal),
    ).rejects.toMatchObject({
      code: "google_oauth_403",
      summary: { provider_status: 403 },
    });
  });

  it("rejects an OAuth payload without the documented bearer shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          access_token: "opaque-access-token",
          token_type: "MAC",
        }),
      ),
    );

    await expect(
      getGoogleAccessToken("scope", new AbortController().signal),
    ).rejects.toMatchObject({ code: "google_oauth_invalid_response" });
  });
});
