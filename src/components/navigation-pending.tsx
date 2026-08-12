"use client";

import { useLinkStatus } from "next/link";

/**
 * A fixed-size navigation hint for links that need more than an instant.
 *
 * Next skips the pending phase for already-prefetched routes, so the hint is
 * invisible during the common fast path and appears only when it can explain
 * a real wait. Keeping it in the link also avoids a global navigation event
 * shim, which the App Router does not expose or require.
 */
export function NavigationPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className="navigation-pending"
      data-pending={pending ? "true" : undefined}
    />
  );
}
