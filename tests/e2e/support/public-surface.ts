import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

/**
 * Shared helpers for auditing the public customer surface.
 *
 * Two rules drive the design:
 *
 * 1. Disclosures must be OPEN before scanning. A prohibited label hidden
 *    inside a collapsed <details> is still shipped to customers, and
 *    `body.innerText` does not report it while the disclosure is closed.
 * 2. Only customer-readable text counts. Script source, JSON payloads,
 *    comments and bundled JavaScript routinely contain words like "null" or
 *    "unknown"; matching those produces false failures that teach people to
 *    ignore the suite.
 */

export const ARTIFACT_DIR = resolve(process.cwd(), "output/acceptance");

/**
 * Phrases that must never reach the customer interface, matched
 * case-insensitively on whitespace-normalised text.
 */
export const PROHIBITED_PHRASES = [
  "job truth card",
  "structured data",
  "not permitted for this source",
  "jobposting permitted and published",
  "deterministic coverage",
  "coverage complete",
  "checks applied",
  "evidence lane",
  "parser confidence",
  "extraction confidence",
  "moderation state",
  "bounded to 10 per page",
  "interleaved before pagination",
  "result balance",
  "does not provide requirements as a separate structured field",
  "does not provide benefits as a separate structured field",
  // Implementation vocabulary found on the live customer surface by the
  // 2026-07 audit. "confidence" alone is deliberately NOT banned: it is
  // legitimate plain language when it helps a reader judge statistical
  // reliability. Only the engineering compounds are.
  "deterministic counts",
  "snapshot counts",
  "verified job snapshot",
  "timestamped snapshots",
  "privacy-thresholded",
  "confidence-labelled",
  "retained per contribution",
  "not exposed in this aggregate",
] as const;

/**
 * Internal null-state labels. These are only illegal as a STANDALONE visible
 * value (a whole leaf node), because the same words appear legitimately
 * inside prose such as "we do not estimate what is unclear".
 */
export const PROHIBITED_STANDALONE_LABELS = [
  "unknown",
  "unclear",
  "not stated",
  "not provided by the source",
  "none applied",
  "n/a",
  "null",
  "undefined",
] as const;

/**
 * Normalises text for matching: collapses whitespace, folds the punctuation
 * variants a CMS or typographic transform introduces (curly quotes, en/em
 * dashes, non-breaking hyphens and spaces), and lower-cases. Without the
 * punctuation folding, "privacy‑thresholded" written with a non-breaking
 * hyphen would slip past a denylist entry spelled with an ASCII hyphen.
 */
export function normalize(value: string): string {
  return value
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Opens every <details> on the page and waits for the revealed content to
 * render, so collapsed disclosures are audited too.
 */
export async function openAllDisclosures(page: Page): Promise<number> {
  const opened = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("details"));
    let count = 0;
    for (const element of all) {
      if (!element.open) {
        element.open = true;
        count += 1;
      }
    }
    return count;
  });
  if (opened > 0) {
    // Let any content revealed by opening a disclosure paint.
    await page.waitForTimeout(250);
  }
  return opened;
}

export interface SurfaceScan {
  /** Whitespace-normalised, lower-cased customer-readable text. */
  text: string;
  /** Normalised text of every leaf element, for standalone-value checks. */
  leaves: string[];
  /** Leaf text exactly as rendered, for case-sensitive checks (e.g. telling
   * the brand name "Jobicy" apart from the internal key "jobicy"). */
  rawLeaves: string[];
  /**
   * Customer-facing text that is NOT body copy: meta/OG/Twitter descriptions,
   * JSON-LD descriptions, aria-labels, user-facing title attributes and
   * accessible names. A search result, a screen reader and an AI crawler all
   * read these, so implementation vocabulary hiding here still reaches people.
   */
  metadataText: string;
  /** The individual metadata strings, for precise assertions. */
  metadata: {
    metaDescription: string | null;
    openGraphDescription: string | null;
    twitterDescription: string | null;
    jsonLdDescriptions: string[];
    ariaLabels: string[];
    titleAttributes: string[];
    accessibleNames: string[];
  };
  html: string;
  disclosuresOpened: number;
}

/**
 * Collects customer-readable text after opening disclosures. Script, style,
 * template and noscript subtrees are excluded so bundled JavaScript cannot
 * trigger a false positive.
 */
export async function scanCustomerSurface(page: Page): Promise<SurfaceScan> {
  const disclosuresOpened = await openAllDisclosures(page);
  const raw = await page.evaluate(() => {
    const EXCLUDED = new Set([
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
      "TEMPLATE",
      "SVG",
      "PATH",
    ]);
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          let parent = node.parentElement;
          while (parent) {
            if (EXCLUDED.has(parent.tagName.toUpperCase())) {
              return NodeFilter.FILTER_REJECT;
            }
            parent = parent.parentElement;
          }
          return (node.textContent ?? "").trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
    );
    const chunks: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      chunks.push(node.textContent ?? "");
    }

    const leaves: string[] = [];
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      if (EXCLUDED.has(element.tagName.toUpperCase())) continue;
      if (element.children.length > 0) continue;
      const value = (element.textContent ?? "").trim();
      if (value) leaves.push(value);
    }

    const attribute = (selector: string, name: string): string | null =>
      document.querySelector(selector)?.getAttribute(name)?.trim() || null;

    /**
     * JSON-LD carries customer-facing prose into search results. Only
     * description-shaped values are collected — identifiers, URLs and types are
     * implementation detail no reader sees as language.
     */
    const jsonLdDescriptions: string[] = [];
    const collectDescriptions = (node: unknown, depth: number): void => {
      if (depth > 6 || node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) collectDescriptions(item, depth + 1);
        return;
      }
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        if (
          typeof value === "string" &&
          /^(description|abstract|headline|caption|disambiguatingDescription)$/i.test(
            key,
          )
        ) {
          jsonLdDescriptions.push(value);
        } else {
          collectDescriptions(value, depth + 1);
        }
      }
    };
    for (const script of Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    )) {
      try {
        collectDescriptions(JSON.parse(script.textContent ?? ""), 0);
      } catch {
        // A malformed JSON-LD block is a separate concern; skip it here.
      }
    }

    const ariaLabels = Array.from(
      document.querySelectorAll("[aria-label]"),
    ).flatMap((element) => {
      const value = element.getAttribute("aria-label")?.trim();
      return value ? [value] : [];
    });

    // `title` on an element the user can reach is a tooltip they will read.
    // `title` on <head> elements or SVG internals is not user-facing copy.
    const titleAttributes = Array.from(
      document.body.querySelectorAll("[title]"),
    ).flatMap((element) => {
      if (EXCLUDED.has(element.tagName.toUpperCase())) return [];
      const value = element.getAttribute("title")?.trim();
      return value ? [value] : [];
    });

    /**
     * Accessible names of the interactive and landmark elements a screen
     * reader announces. Computed the pragmatic way — explicit label wins,
     * otherwise the element's own text — rather than reimplementing accname.
     */
    const accessibleNames = Array.from(
      document.querySelectorAll(
        'a, button, [role="button"], [role="link"], [role="region"], section, nav, figure, figcaption, img, [role="img"]',
      ),
    ).flatMap((element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelled = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
        : "";
      const value = (
        element.getAttribute("aria-label") ||
        labelled ||
        element.getAttribute("alt") ||
        (element.textContent ?? "")
      ).trim();
      return value ? [value] : [];
    });

    return {
      chunks,
      leaves,
      metaDescription: attribute('meta[name="description"]', "content"),
      openGraphDescription: attribute(
        'meta[property="og:description"]',
        "content",
      ),
      twitterDescription:
        attribute('meta[name="twitter:description"]', "content") ??
        attribute('meta[property="twitter:description"]', "content"),
      jsonLdDescriptions,
      ariaLabels,
      titleAttributes,
      accessibleNames,
      html: document.documentElement.outerHTML,
    };
  });

  const metadata = {
    metaDescription: raw.metaDescription,
    openGraphDescription: raw.openGraphDescription,
    twitterDescription: raw.twitterDescription,
    jsonLdDescriptions: raw.jsonLdDescriptions,
    ariaLabels: raw.ariaLabels,
    titleAttributes: raw.titleAttributes,
    accessibleNames: raw.accessibleNames,
  };

  return {
    text: normalize(raw.chunks.join(" ")),
    leaves: raw.leaves.map(normalize),
    rawLeaves: raw.leaves.map((value) => value.replace(/\s+/g, " ").trim()),
    metadataText: normalize(
      [
        raw.metaDescription ?? "",
        raw.openGraphDescription ?? "",
        raw.twitterDescription ?? "",
        ...raw.jsonLdDescriptions,
        ...raw.ariaLabels,
        ...raw.titleAttributes,
        ...raw.accessibleNames,
      ].join("   "),
    ),
    metadata,
    html: raw.html,
    disclosuresOpened,
  };
}

export interface SurfaceViolation {
  kind: "phrase" | "standalone" | "metadata";
  value: string;
}

/** Every prohibited term present on the scanned surface. */
export function findViolations(scan: SurfaceScan): SurfaceViolation[] {
  const violations: SurfaceViolation[] = [];
  for (const phrase of PROHIBITED_PHRASES) {
    if (scan.text.includes(phrase)) {
      violations.push({ kind: "phrase", value: phrase });
    }
    // Metadata is reported separately so a failure says whether the language
    // is in the page or in what search engines and screen readers see.
    if (scan.metadataText.includes(phrase)) {
      violations.push({ kind: "metadata", value: phrase });
    }
  }
  for (const label of PROHIBITED_STANDALONE_LABELS) {
    if (scan.leaves.includes(label)) {
      violations.push({ kind: "standalone", value: label });
    }
  }
  return violations;
}

function slug(routeLabel: string): string {
  return routeLabel.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

/** Writes the captured HTML and a full-page screenshot for a route. */
export async function captureRoute(
  page: Page,
  routeLabel: string,
  scan: SurfaceScan,
  suffix = "",
): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const name = `${slug(routeLabel)}${suffix ? `_${slug(suffix)}` : ""}`;
  writeFileSync(resolve(ARTIFACT_DIR, `${name}.html`), scan.html);
  await page.screenshot({
    path: resolve(ARTIFACT_DIR, `${name}.png`),
    fullPage: true,
  });
}

/**
 * Navigates and waits for the shell plus hydration. `networkidle` is
 * unreliable here because analytics beacons and streamed Suspense boundaries
 * keep the connection busy.
 */
export async function visit(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await settle(page);
}

/**
 * Waits for the shell AND for streamed Suspense content to arrive. Pages that
 * stream (company profiles, job lists) briefly render a "Loading …"
 * placeholder; asserting against that is a race, and it fails first on slower
 * viewports. Waiting for every placeholder to detach makes the audit
 * deterministic.
 */
export async function settle(page: Page): Promise<void> {
  await page.locator("main, .site-shell").first().waitFor({ timeout: 20_000 });
  const loading = page.getByText(/^Loading .*…$/);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await loading.count()) === 0) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
}
