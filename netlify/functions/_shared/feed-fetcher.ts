import { parse as parseHost } from "tldts";

import type { FeedFetchResult } from "../../../src/lib/jobs/feeds/runtime";
import { MAX_FEED_PAYLOAD_BYTES } from "../../../src/lib/jobs/feeds/types";
import { boundedSignal, OperationalError } from "./runtime";

/**
 * The production employer-feed fetcher.
 *
 * An employer feed URL is attacker-influenced input from SalaryPadi's point of
 * view: it arrives in a registry entry and points at a third party. This
 * fetcher therefore refuses more than it accepts.
 *
 *   - HTTPS only, no credentials in the URL, no non-standard port.
 *   - No IP literals, no localhost, no private or link-local hosts, so the
 *     request cannot be aimed at internal infrastructure.
 *   - Redirects are followed manually and each hop is re-validated, and a hop
 *     that leaves the original registrable domain is refused. `redirect:
 *     "manual"` is used rather than "follow" precisely so an off-domain
 *     redirect cannot be taken silently.
 *   - A byte-counted streaming reader cancels the body the moment it exceeds
 *     the cap, so an unbounded response is never buffered.
 *   - The deadline is an AbortSignal derived from the caller's, so the worker
 *     budget always wins.
 *
 * Documented limitation: this validates hostnames, not resolved addresses, so
 * it does not defeat DNS rebinding. Netlify functions have no raw socket hook
 * to pin an address; the destination allowlist and the redirect-domain check
 * are what bound the blast radius.
 */

const MAX_REDIRECTS = 3;
const ACCEPTED_CONTENT_TYPES = [
  "application/xml",
  "text/xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/json",
  "text/csv",
  "text/plain",
];

/** Hostnames that must never be fetched, whatever a registry entry says. */
function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;

  const parsed = parseHost(host, {
    allowPrivateDomains: false,
    detectIp: true,
  });
  // An IP literal cannot be an employer's registrable domain, and is the usual
  // shape of an SSRF attempt.
  if (parsed.isIp) return true;
  // A host with no registrable domain (single label, bare suffix) is not a
  // real external destination.
  if (!parsed.domain) return true;
  return false;
}

export class FeedFetchError extends OperationalError {}

function assertFetchableUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FeedFetchError("feed_url_invalid");
  }
  if (url.protocol !== "https:") throw new FeedFetchError("feed_url_not_https");
  if (url.username || url.password) {
    throw new FeedFetchError("feed_url_has_credentials");
  }
  if (url.port && url.port !== "443") {
    throw new FeedFetchError("feed_url_port_not_permitted");
  }
  if (isForbiddenHost(url.hostname)) {
    throw new FeedFetchError("feed_url_host_not_permitted");
  }
  return url;
}

function registrableDomainOf(hostname: string): string | null {
  return (
    parseHost(hostname, { allowPrivateDomains: false, detectIp: true })
      .domain ?? null
  );
}

function contentTypeAccepted(header: string | null): boolean {
  if (!header) return false;
  const mediaType = header.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return ACCEPTED_CONTENT_TYPES.includes(mediaType);
}

/**
 * Reads a body through a byte-counted reader, cancelling as soon as the cap is
 * passed. Returns `complete: false` when the body was cut short, which the
 * runtime treats as a non-authoritative retrieval — it can never close a job.
 */
async function readBoundedText(
  response: Response,
  maximumBytes: number,
): Promise<{ text: string; complete: boolean }> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { text: "", complete: false };
  }
  if (!response.body) throw new FeedFetchError("feed_response_has_no_body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let complete = true;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        complete = false;
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!complete) return { text: "", complete: false };

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), complete: true };
}

export interface FeedFetcherOptions {
  /** The worker's signal; the deadline is derived from it. */
  signal?: AbortSignal;
  timeoutMs: number;
  maximumBytes?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Fetches one employer feed. Never throws for an ordinary upstream problem —
 * it returns `{ok:false}` so the runtime records a partial snapshot that
 * closes nothing. It throws only for a URL the platform refuses to request at
 * all, which is a configuration fault rather than a transient failure.
 */
export async function fetchEmployerFeed(
  rawUrl: string,
  options: FeedFetcherOptions,
): Promise<FeedFetchResult> {
  const maximumBytes = options.maximumBytes ?? MAX_FEED_PAYLOAD_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const origin = assertFetchableUrl(rawUrl);
  const originDomain = registrableDomainOf(origin.hostname);

  let target = origin;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(target, {
        method: "GET",
        headers: {
          Accept: ACCEPTED_CONTENT_TYPES.join(", "),
          "User-Agent": "SalaryPadi-EmployerFeed/1.0 (+https://salarypadi.com)",
        },
        cache: "no-store",
        credentials: "omit",
        // Manual, so an off-domain redirect is refused rather than followed.
        redirect: "manual",
        signal: boundedSignal(options.signal, options.timeoutMs),
      });
    } catch {
      return { ok: false, text: "", complete: false };
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return { ok: false, text: "", complete: false };
      }
      let next: URL;
      try {
        next = assertFetchableUrl(new URL(location, target).toString());
      } catch {
        // A redirect to an unfetchable destination is an upstream problem,
        // not a configuration fault: report it as a failed retrieval.
        return { ok: false, text: "", complete: false };
      }
      // The employer's feed must stay on the employer's domain.
      if (registrableDomainOf(next.hostname) !== originDomain) {
        return { ok: false, text: "", complete: false };
      }
      target = next;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, text: "", complete: false };
    }
    if (!contentTypeAccepted(response.headers.get("content-type"))) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, text: "", complete: false };
    }

    const body = await readBoundedText(response, maximumBytes);
    // A cut-short body parses, so it must be reported as incomplete or the
    // runtime would treat a truncated feed as authoritative.
    return { ok: body.complete, text: body.text, complete: body.complete };
  }

  return { ok: false, text: "", complete: false };
}

/** Honours Retry-After only for the statuses where it is meaningful. */
export function retryAfterMs(response: {
  status: number;
  headers: { get(name: string): string | null };
}): number | null {
  if (response.status !== 429 && response.status !== 503) return null;
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds, 300) * 1_000;
  }
  const at = Date.parse(header);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.min(at - Date.now(), 300_000));
}
