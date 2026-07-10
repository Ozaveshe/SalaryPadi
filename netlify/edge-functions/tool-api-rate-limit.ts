import type { Config, Context } from "@netlify/edge-functions";

export default function toolApiRateLimit(_request: Request, context: Context) {
  return context.next();
}

/**
 * The browser Origin check protects users from cross-site form abuse. This
 * edge limit protects the server-held AfroTools key from direct scripted use.
 */
export const config = {
  // One wildcard is deliberately one Netlify rate-limit rule. A separate path
  // per tool would exceed the two-rule allowance on Personal/Starter plans and
  // Netlify would publish the deploy without enforcing the rejected ruleset.
  path: "/api/tools/*",
  method: "POST",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowSize: 60,
    windowLimit: 20,
  },
} satisfies Config;
