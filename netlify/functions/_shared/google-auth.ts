import { createSign } from "node:crypto";
import { z } from "zod";

import { discardResponseBody } from "../../../src/lib/http/body";
import {
  OperationalError,
  getRuntimeEnvironment,
  readBoundedOperationalJson,
} from "./runtime";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_MAX_RESPONSE_BYTES = 16 * 1024;
const googleOAuthResponseSchema = z
  .object({
    access_token: z
      .string()
      .min(16)
      .max(4_096)
      .regex(/^[\x21-\x7E]+$/),
    token_type: z.literal("Bearer"),
  })
  .passthrough();

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function googlePrivateKey() {
  const value = getRuntimeEnvironment(
    "GOOGLE_SEARCH_SERVICE_ACCOUNT_PRIVATE_KEY",
  ).replaceAll("\\n", "\n");
  if (
    value.length < 1_000 ||
    value.length > 10_000 ||
    !value.includes("BEGIN PRIVATE KEY") ||
    !value.includes("END PRIVATE KEY")
  ) {
    throw new OperationalError("invalid_google_service_account_private_key");
  }
  return value;
}

export async function getGoogleAccessToken(scope: string, signal: AbortSignal) {
  const email = getRuntimeEnvironment("GOOGLE_SEARCH_SERVICE_ACCOUNT_EMAIL");
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)) {
    throw new OperationalError("invalid_google_service_account_email");
  }
  const issuedAt = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: email,
      scope,
      aud: GOOGLE_TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3_600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  let signature: string;
  try {
    signature = base64Url(
      createSign("RSA-SHA256").update(unsigned).sign(googlePrivateKey()),
    );
  } catch {
    throw new OperationalError("google_service_account_signing_failed");
  }
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  });
  if (!response.ok) {
    await discardResponseBody(response);
    throw new OperationalError(`google_oauth_${response.status}`, {
      provider_status: response.status,
    });
  }
  const payloadJson = googleOAuthResponseSchema.safeParse(
    await readBoundedOperationalJson(
      response,
      GOOGLE_OAUTH_MAX_RESPONSE_BYTES,
      "google_oauth_invalid_response",
    ),
  );
  if (!payloadJson.success) {
    throw new OperationalError("google_oauth_invalid_response");
  }
  return payloadJson.data.access_token;
}
