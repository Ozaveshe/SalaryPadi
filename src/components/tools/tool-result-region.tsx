"use client";

import { Children, useEffect, useRef, type ReactNode } from "react";

/**
 * A live region that is always in the document.
 *
 * Each tool used to put `aria-live` on the result element itself, which is
 * only mounted once a result exists. Assistive technology has to be observing
 * a live region *before* its contents change, so a region that appears at the
 * same moment as its content is generally not announced — the calculated
 * answer arrived silently for screen-reader users. Keeping the region mounted
 * and empty until then makes the update an observable change.
 */
export function ToolResultRegion({ children }: { children: ReactNode }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const hadResult = useRef(false);
  const hasResult = Children.count(children) > 0;

  useEffect(() => {
    if (!hasResult || hadResult.current) {
      hadResult.current = hasResult;
      return;
    }

    hadResult.current = true;
    const region = regionRef.current;
    if (!region) return;

    // Keep a newly-calculated answer from arriving below the fold. This only
    // moves the page when the whole result starts beyond the viewport; nearby
    // content and repeat calculations stay put.
    if (region.getBoundingClientRect().top > window.innerHeight) {
      region.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }, [hasResult]);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="tool-result-region"
      data-has-result={hasResult ? "true" : undefined}
      ref={regionRef}
    >
      {children}
    </div>
  );
}
