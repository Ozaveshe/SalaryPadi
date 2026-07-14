import "server-only";

import { isIP } from "node:net";

/**
 * Returns only the client address supplied by Netlify's overwritten platform
 * header. Outside that trusted boundary, all callers share one conservative
 * bucket instead of trusting forwarding headers supplied by the request.
 */
export function trustedClientNetworkAddress(request: Request): string {
  const value = request.headers.get("x-nf-client-connection-ip")?.trim();
  return value && value.length <= 64 && isIP(value) !== 0
    ? value.toLowerCase()
    : "unknown";
}
