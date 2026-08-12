"use client";

import { useEffect, useRef, type ReactNode } from "react";

const DESKTOP_FILTER_QUERY = "(min-width: 48rem)";
const MOBILE_FILTER_QUERY = "(max-width: 47.9rem)";

export function ResponsiveAdvancedFilters({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_FILTER_QUERY);
    const syncDisclosure = () => {
      if (detailsRef.current) {
        detailsRef.current.open = media.matches && active;
      }
    };

    syncDisclosure();
    media.addEventListener("change", syncDisclosure);
    return () => media.removeEventListener("change", syncDisclosure);
  }, [active]);

  function closeAndRestoreFocus() {
    if (!detailsRef.current) return;
    detailsRef.current.open = false;
    summaryRef.current?.focus();
  }

  return (
    <details
      className="advanced-filters"
      ref={detailsRef}
      onClick={(event) => {
        if (
          event.target === detailsRef.current &&
          window.matchMedia(MOBILE_FILTER_QUERY).matches
        ) {
          closeAndRestoreFocus();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && detailsRef.current?.open) {
          event.preventDefault();
          closeAndRestoreFocus();
        }
      }}
    >
      <summary ref={summaryRef}>
        {active ? "More filters · filters applied" : "More filters"}
      </summary>
      <div className="advanced-filters-body">{children}</div>
    </details>
  );
}
