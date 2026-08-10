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
  // Null-state labels the 2026-08 audit found shipping as standalone <dd>
  // values on the company reviews and interviews subroutes. An unscored or
  // unpublished field is omitted, never labelled. Bare "not published" is
  // deliberately NOT banned: formatCountryNumber/formatSalaryAmount pin it
  // as the honest absence statement for a figure the source did not publish.
  "not scored",
  "unrated",
  "role not published",
  "outcome not published",
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
    // Metadata fields are joined with a NON-WHITESPACE sentinel. `normalize`
    // collapses runs of whitespace into a single space, so a whitespace
    // separator would let a prohibited phrase match across two unrelated
    // fields: a meta description ending "...coverage" followed by an
    // aria-label starting "complete" would be reported as "coverage
    // complete". "|||" survives normalisation, appears in no prohibited
    // phrase, and never occurs in customer copy. Keep it printable ASCII --
    // a raw NUL byte here makes grep and ripgrep classify this whole file as
    // binary and hide every match in it.
    metadataText: normalize(
      [
        raw.metaDescription ?? "",
        raw.openGraphDescription ?? "",
        raw.twitterDescription ?? "",
        ...raw.jsonLdDescriptions,
        ...raw.ariaLabels,
        ...raw.titleAttributes,
        ...raw.accessibleNames,
      ].join(" ||| "),
    ),
    metadata,
    html: raw.html,
    disclosuresOpened,
  };
}

/* ------------------------- edge bot protection ------------------------- */

/**
 * Netlify's bot-detection interstitial answers 403 with a JS challenge page in
 * place of the requested route. To a test client that reads like a dead route:
 * on 2026-08-03 it turned a challenged run into "Pinned company
 * /companies/zipline did not return 200", which sent the investigation at the
 * company page instead of at the edge.
 *
 * A challenge means production was NOT verified. It is never evidence that the
 * customer surface is broken, and it must never be reported as such.
 */
const EDGE_CHALLENGE_MARKERS = [
  "we are verifying your connection",
  "challenge id",
  "security by",
] as const;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Whether `baseURL` points at something outside this machine — i.e. at a
 * target that can sit behind a CDN and its bot protection. A dev server never
 * challenges, so guards keyed on this stay inert for local runs.
 */
export function isRemoteTarget(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  try {
    return !LOCAL_HOSTNAMES.has(new URL(baseURL).hostname);
  } catch {
    // An unparseable baseURL is a configuration problem the suite will hit on
    // its first navigation; it is not this guard's job to report it.
    return false;
  }
}

/**
 * Whether rendered page text is an edge challenge rather than the site.
 *
 * Two markers are required, not one: "security by" is ordinary English and
 * appears in trust and privacy copy, so a single-marker rule would classify
 * real pages as challenges — and a false positive is the dangerous direction,
 * because it would excuse a genuine outage as "we were only blocked".
 *
 * Kept pure and exported so the decision is unit-tested rather than existing
 * only as a branch inside a browser helper.
 */
export function looksLikeEdgeChallenge(pageText: string): boolean {
  const text = normalize(pageText);
  return (
    EDGE_CHALLENGE_MARKERS.filter((marker) => text.includes(marker)).length >= 2
  );
}

/**
 * The challenge ID when the current page is an edge challenge, `null`
 * otherwise.
 */
export async function detectEdgeChallenge(page: Page): Promise<string | null> {
  const found = await page.evaluate(() => ({
    text: document.body?.innerText ?? "",
    // The ID is rendered in a <code> element by the challenge template.
    id: document.querySelector("code")?.textContent?.trim() ?? "",
  }));
  if (!looksLikeEdgeChallenge(found.text)) return null;
  return found.id || "unreported";
}

/**
 * Fails with the actual condition — challenged, not broken — so a blocked run
 * is never mistaken for a customer-facing defect.
 */
export async function assertNotChallenged(
  page: Page,
  route: string,
): Promise<void> {
  const challengeId = await detectEdgeChallenge(page);
  if (challengeId === null) return;
  throw new Error(
    `Edge bot protection challenged this run at ${route}, so production was ` +
      `NOT verified. This is the test client being blocked at the edge, not a ` +
      `defect on the customer surface — do not treat it as a failed release. ` +
      `Challenge ID: ${challengeId}.`,
  );
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
  // Before settle(): the challenge page has no shell, so settle() would spend
  // its timeout waiting for `main` and then report a missing-locator error.
  await assertNotChallenged(page, route);
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
  let remaining = await loading.count();
  while (Date.now() < deadline && remaining > 0) {
    await page.waitForTimeout(250);
    remaining = await loading.count();
  }
  /**
   * Giving up quietly here used to let every later assertion run against the
   * loading skeleton, which reports the symptom instead of the cause: on
   * 2026-08-03 a page that never streamed was reported as `insights is missing
   * its "scope:" statement`. Content that never arrives is its own failure and
   * says so.
   */
  if (remaining > 0) {
    const placeholders = (await loading.allInnerTexts())
      .map((value) => value.trim())
      .join("; ");
    throw new Error(
      `Streamed content never arrived at ${page.url()}: ${remaining} loading ` +
        `placeholder(s) still present after 20s (${placeholders}). Assertions ` +
        `after this point would have run against a loading skeleton.`,
    );
  }
  await page.waitForTimeout(400);
}
