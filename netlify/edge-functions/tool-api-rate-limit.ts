import type { Config } from "@netlify/functions";

type EdgeContext = {
  next(): Promise<Response>;
};

export default function toolApiRateLimit(
  _request: Request,
  context: EdgeContext,
) {
  return context.next();
}

/**
 * The browser Origin check protects users from cross-site form abuse. This
 * edge limit protects the server-held AfroTools key from direct scripted use.
 */
export const config = {
  path: [
    "/api/tools/take-home-pay",
    "/api/tools/offer-compare",
    "/api/tools/job-scam-check",
  ],
  method: "POST",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowSize: 60,
    windowLimit: 20,
  },
} satisfies Config;
