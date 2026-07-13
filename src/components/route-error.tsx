"use client";

import { useEffect } from "react";

export interface RouteErrorProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export function RouteError({
  error,
  resource,
  unstable_retry,
}: RouteErrorProps & { resource: string }) {
  useEffect(() => {
    console.error("route_segment_error", {
      resource,
      digest: error.digest ?? "unavailable",
    });
  }, [error.digest, resource]);

  return (
    <div className="site-shell stack-lg" role="alert">
      <section className="empty-state stack">
        <p className="eyebrow">Temporarily unavailable</p>
        <h1 className="page-title">We could not load {resource}.</h1>
        <p className="lede">
          The underlying source may be temporarily unavailable. No replacement
          data has been invented.
        </p>
        <div>
          <button
            className="button"
            type="button"
            onClick={() => unstable_retry()}
          >
            Try again
          </button>
        </div>
      </section>
    </div>
  );
}
