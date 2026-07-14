import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { fullJitterDelayMs } from "../../../src/lib/jobs/supply/schedules";

export type ApplyLinkCheckResult = {
  result: "healthy" | "broken" | "indeterminate";
  httpStatus: number | null;
  errorCode: string | null;
  responseMs: number;
};

type Dependencies = {
  fetch?: typeof globalThis.fetch;
  resolve?: (hostname: string) => Promise<string[]>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

function publicIpv4(value: string) {
  const octets = value.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  return !(
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function publicIp(value: string) {
  const version = isIP(value);
  if (version === 4) return publicIpv4(value);
  if (version !== 6) return false;
  const normalized = value.toLowerCase();
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("2001:db8:") ||
    !/^[23]/.test(normalized)
  );
}

async function defaultResolve(hostname: string) {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    ({ address }) => address,
  );
}

async function allowedDestination(
  rawUrl: string,
  resolve: NonNullable<Dependencies["resolve"]>,
) {
  let destination: URL;
  try {
    destination = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    destination.port ||
    destination.hostname === "localhost" ||
    destination.hostname.endsWith(".local")
  ) {
    return null;
  }
  const hostname = destination.hostname.replace(/^\[|\]$/g, "");
  const literalVersion = isIP(hostname);
  const addresses = literalVersion
    ? [hostname]
    : await resolve(hostname).catch(() => []);
  if (
    addresses.length === 0 ||
    addresses.some((address) => !publicIp(address))
  ) {
    return null;
  }
  return { destination, address: addresses[0]! };
}

function pinnedHead(destination: URL, address: string, signal: AbortSignal) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: address,
        servername: destination.hostname.replace(/^\[|\]$/g, ""),
        path: `${destination.pathname}${destination.search}`,
        method: "HEAD",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Host: destination.host,
        },
        signal,
      },
      (response) => {
        response.resume();
        if (response.statusCode === undefined) {
          reject(new Error("apply_link_missing_status"));
          return;
        }
        resolve({ status: response.statusCode });
      },
    );
    request.once("error", reject);
    request.end();
  });
}

function resultForStatus(
  status: number,
  responseMs: number,
): ApplyLinkCheckResult {
  if (status >= 200 && status < 400) {
    return {
      result: "healthy",
      httpStatus: status,
      errorCode: null,
      responseMs,
    };
  }
  if ([404, 410, 451].includes(status)) {
    return {
      result: "broken",
      httpStatus: status,
      errorCode: `apply_link_http_${status}`,
      responseMs,
    };
  }
  return {
    result: "indeterminate",
    httpStatus: status,
    errorCode: `apply_link_http_${status}`,
    responseMs,
  };
}

const retryableStatus = new Set([408, 425, 500, 502, 503, 504]);

export async function checkApplyLink(
  rawUrl: string,
  parentSignal: AbortSignal,
  dependencies: Dependencies = {},
): Promise<ApplyLinkCheckResult> {
  const fetcher = dependencies.fetch;
  const resolve = dependencies.resolve ?? defaultResolve;
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolveSleep) =>
        setTimeout(resolveSleep, milliseconds),
      ));
  const random = dependencies.random ?? Math.random;
  const startedAt = now();
  const allowed = await allowedDestination(rawUrl, resolve);
  if (!allowed) {
    return {
      result: "indeterminate",
      httpStatus: null,
      errorCode: "unsafe_apply_destination",
      responseMs: Math.max(0, now() - startedAt),
    };
  }
  const { destination, address } = allowed;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const requestSignal = AbortSignal.any([
        parentSignal,
        AbortSignal.timeout(5_000),
      ]);
      const response = fetcher
        ? await fetcher(destination, {
            method: "HEAD",
            headers: { Accept: "text/html,application/xhtml+xml" },
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            signal: requestSignal,
          })
        : await pinnedHead(destination, address, requestSignal);
      if (!retryableStatus.has(response.status) || attempt === 2) {
        return resultForStatus(response.status, Math.max(0, now() - startedAt));
      }
    } catch {
      if (attempt === 2 || parentSignal.aborted) {
        return {
          result: "indeterminate",
          httpStatus: null,
          errorCode: parentSignal.aborted
            ? "apply_link_deadline_exceeded"
            : "apply_link_request_failed",
          responseMs: Math.max(0, now() - startedAt),
        };
      }
    }
    await sleep(fullJitterDelayMs(attempt, 100, 500, random));
  }
  throw new Error("unreachable_apply_link_check");
}
