import "server-only";

import { createHmac } from "node:crypto";

import { trustedClientNetworkAddress } from "@/lib/security/client-network";

/** Returns a daily, unlinkable abuse key. Raw network addresses are discarded. */
export function hashContributionNetworkAddress(
  request: Request,
  secret: string,
  now = new Date(),
) {
  return createHmac("sha256", secret)
    .update(
      `salarypadi-contribution-abuse-v1\0${now.toISOString().slice(0, 10)}\0${trustedClientNetworkAddress(request)}`,
    )
    .digest("hex");
}
