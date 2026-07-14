import "server-only";

import { createHmac } from "node:crypto";

function clientNetworkAddress(request: Request) {
  const platformAddress = request.headers
    .get("x-nf-client-connection-ip")
    ?.trim();
  const forwardedAddress = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return (platformAddress || forwardedAddress || "unknown").slice(0, 256);
}

/** Returns a daily, unlinkable abuse key. Raw network addresses are discarded. */
export function hashContributionNetworkAddress(
  request: Request,
  secret: string,
  now = new Date(),
) {
  return createHmac("sha256", secret)
    .update(
      `salarypadi-contribution-abuse-v1\0${now.toISOString().slice(0, 10)}\0${clientNetworkAddress(request)}`,
    )
    .digest("hex");
}
