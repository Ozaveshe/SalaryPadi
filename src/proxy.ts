import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { authClaimSubjectSchema } from "@/lib/auth/claims";
import { getSupabasePublicConfig } from "@/lib/env";
import { safeRelativePath } from "@/lib/security/urls";
import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";
import type { Database } from "@/lib/supabase/database.types";

const SUPABASE_PROXY_TIMEOUT_MS = 4_000;

const protectedPrefixes = [
  "/account",
  "/saved",
  "/applications",
  "/alerts",
  "/admin",
  "/post-a-job",
  "/contribute/salary",
  "/contribute/review",
  "/contribute/interview",
  "/contribute/benefits",
  "/contribute/pay-reliability",
  "/privacy/requests",
  "/company-intelligence/requests",
  "/auth/mfa-required",
];

const protectedCompanyActionPattern =
  /^\/companies\/[^/]+\/(?:claim|respond)\/?$/;

export function isProtectedPagePath(pathname: string) {
  return (
    protectedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) || protectedCompanyActionPattern.test(pathname)
  );
}

function buildContentSecurityPolicy(
  nonce: string,
  supabaseOrigin: string | undefined,
) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const connectSources = ["'self'"];
  const imageSources = ["'self'", "blob:", "data:"];

  if (supabaseOrigin) connectSources.push(supabaseOrigin);

  if (process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID) {
    connectSources.push(
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
    );
    imageSources.push(
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
    );
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-inline'" : ""}`,
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applyCsp(response: NextResponse, policy: string) {
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const configuration = getSupabasePublicConfig();
  const policy = buildContentSecurityPolicy(nonce, configuration?.url);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const isProtected = isProtectedPagePath(request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  let authenticationState: "anonymous" | "authenticated" | "unavailable" =
    configuration || !isProtected ? "anonymous" : "unavailable";

  if (configuration) {
    const supabase = createServerClient<Database>(
      configuration.url,
      configuration.publishableKey,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({
              request: { headers: requestHeaders },
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
        global: {
          fetch: createBoundedFetch(SUPABASE_PROXY_TIMEOUT_MS),
        },
      },
    );

    try {
      const { data, error } = await supabase.auth.getClaims();
      const subject = data?.claims?.sub;
      authenticationState = error
        ? "unavailable"
        : subject === undefined || subject === null
          ? "anonymous"
          : authClaimSubjectSchema.safeParse(subject).success
            ? "authenticated"
            : "unavailable";
    } catch {
      authenticationState = "unavailable";
    }
  }

  if (isProtected && authenticationState === "unavailable") {
    return applyCsp(
      new NextResponse("Authentication is temporarily unavailable.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      }),
      policy,
    );
  }

  if (isProtected && authenticationState === "anonymous") {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set(
      "next",
      safeRelativePath(`${request.nextUrl.pathname}${request.nextUrl.search}`),
    );
    const redirect = NextResponse.redirect(signInUrl);
    redirect.headers.set("Cache-Control", "private, no-store");
    return applyCsp(redirect, policy);
  }

  return applyCsp(response, policy);
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
