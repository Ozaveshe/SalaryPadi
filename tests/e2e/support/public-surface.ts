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

export function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
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

    return {
      chunks,
      leaves,
      html: document.documentElement.outerHTML,
    };
  });

  return {
    text: normalize(raw.chunks.join(" ")),
    leaves: raw.leaves.map(normalize),
    html: raw.html,
    disclosuresOpened,
  };
}

export interface SurfaceViolation {
  kind: "phrase" | "standalone";
  value: string;
}

/** Every prohibited term present on the scanned surface. */
export function findViolations(scan: SurfaceScan): SurfaceViolation[] {
  const violations: SurfaceViolation[] = [];
  for (const phrase of PROHIBITED_PHRASES) {
    if (scan.text.includes(phrase)) {
      violations.push({ kind: "phrase", value: phrase });
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
  await page.locator("main, .site-shell").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
}
