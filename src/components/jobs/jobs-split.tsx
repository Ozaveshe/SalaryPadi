"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

/**
 * One row of the results list: the server-rendered card and the server-rendered
 * quick-view panel for the same job. Both arrive as already-rendered output, so
 * this client component never imports the card, the company catalogue or the
 * presentation boundary into the browser bundle.
 */
export interface JobSplitEntry {
  slug: string;
  card: ReactNode;
  preview: ReactNode;
}

/**
 * The two-column jobs layout with client-side quick-view selection.
 *
 * Selecting a job used to be a URL change, which re-ran the whole results
 * server component — reassembling the live feed from every reviewed source
 * before anything could repaint. Every panel on the current page is rendered
 * once with the page it belongs to, so switching between them is a local state
 * change and costs no request at all. The `selected` parameter is still kept in
 * the address bar so a quick view stays linkable and survives a reload.
 */
export function JobsSplit({
  entries,
  initialSlug,
}: {
  entries: JobSplitEntry[];
  /** Slug selected by the incoming request, if it is on this page. */
  initialSlug: string | null;
}) {
  const router = useRouter();
  const previewColumn = useRef<HTMLElement | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const selected =
    entries.find((entry) => entry.slug === selectedSlug) ?? entries[0];

  const select = useCallback((slug: string) => {
    setSelectedSlug(slug);
    // Shallow update: keeps the quick view linkable without asking the server
    // to rebuild the feed. Replace, not push, so the browser Back button still
    // leaves the results rather than stepping through every preview.
    const url = new URL(window.location.href);
    url.searchParams.set("selected", slug);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  const handleCardClick = useCallback(
    (event: MouseEvent<HTMLLIElement>, slug: string) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      // A click that landed on a real control belongs to that control, and a
      // click that ends a text selection is not a click on the card.
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, input, select, textarea, summary")) return;
      const button = target?.closest("button");
      if (button && !button.hasAttribute("data-quick-view")) return;
      if (window.getSelection()?.toString()) return;

      // Ask the layout whether the panel is actually on screen rather than
      // guessing from the viewport: the column is sized by its container, so
      // the same width shows it on the public route and hides it beside the
      // workspace navigation.
      const column = previewColumn.current;
      if (column && getComputedStyle(column).display !== "none") {
        select(slug);
        return;
      }
      // Nowhere to preview into, so the card opens the full role instead.
      router.push(`/jobs/${slug}`);
    },
    [router, select],
  );

  return (
    // The wrapper is the query container: the split decides its own columns
    // from the space it was given, not from the width of the window.
    <div className="jobs-split-container">
      <div className="jobs-split">
        <ul className="job-list">
          {entries.map((entry) => (
            <li
              className="job-list-item"
              data-selected={entry.slug === selected?.slug ? "true" : undefined}
              key={entry.slug}
              onClick={(event) => handleCardClick(event, entry.slug)}
            >
              {entry.card}
            </li>
          ))}
        </ul>
        {selected ? (
          <aside className="jobs-preview-column" ref={previewColumn}>
            <div className="job-preview-swap" key={selected.slug}>
              {selected.preview}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
