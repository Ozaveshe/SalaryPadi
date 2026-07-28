import type { ReactNode } from "react";

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
  return (
    <div aria-live="polite" aria-atomic="false">
      {children}
    </div>
  );
}
