import type { Config, Context } from "@netlify/edge-functions";

export default function authApiRateLimit(_request: Request, context: Context) {
  return context.next();
}

/**
 * The browser Origin check on /api/auth/sign-in is a CSRF control only; a
 * scripted client can set Origin freely. This edge limit bounds direct
 * scripted use of the OTP sign-in route, which would otherwise let one IP
 * flood arbitrary third-party mailboxes with magic-link email and burn the
 * transactional-email quota.
 */
export const config = {
  // Second (and last) rate-limit rule available on Personal/Starter plans;
  // the first is the /api/tools/* rule. Do not add a third without a plan
  // upgrade or Netlify will publish the deploy without enforcing the rules.
  path: "/api/auth/*",
  method: "POST",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowSize: 60,
    windowLimit: 10,
  },
} satisfies Config;
