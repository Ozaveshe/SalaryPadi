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
  resolve?: PublicHttpsResolver;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export type PublicHttpsResolver = (hostname: string) => Promise<string[]>;

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

export async function defaultPublicHttpsResolve(hostname: string) {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    ({ address }) => address,
  );
}

async function resolveWithSignal(
  hostname: string,
  resolve: NonNullable<Dependencies["resolve"]>,
  signal: AbortSignal,
) {
  if (signal.aborted) throw signal.reason;
  return new Promise<string[]>((resolvePromise, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    resolve(hostname).then(
      (addresses) => {
        signal.removeEventListener("abort", abort);
        resolvePromise(addresses);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export async function resolvePublicHttpsDestination(
  rawUrl: string,
  resolve: NonNullable<Dependencies["resolve"]>,
  signal: AbortSignal,
) {
  let destination: URL;
  try {
    destination = new URL(rawUrl);
  } catch {
    return { status: "unsafe" } as const;
  }
  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    destination.port ||
    destination.hostname === "localhost" ||
    destination.hostname.endsWith(".local")
  ) {
    return { status: "unsafe" } as const;
  }
  const hostname = destination.hostname.replace(/^\[|\]$/g, "");
  const literalVersion = isIP(hostname);
  let addresses: string[];
  try {
    addresses = literalVersion
      ? [hostname]
      : await resolveWithSignal(hostname, resolve, signal);
  } catch {
    return {
      status: signal.aborted ? "deadline_exceeded" : "unresolved",
    } as const;
  }
  if (addresses.length === 0) return { status: "unresolved" } as const;
  if (addresses.some((address) => !publicIp(address))) {
    return { status: "unsafe" } as const;
  }
  return { status: "allowed", destination, address: addresses[0]! } as const;
}

export function requestPinnedHttpsHead(
  destination: URL,
  address: string,
  signal: AbortSignal,
) {
  return new Promise<{ status: number; location: string | null }>(
    (resolve, reject) => {
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
          resolve({
            status: response.statusCode,
            location: response.headers.location ?? null,
          });
        },
      );
      request.once("error", reject);
      request.end();
    },
  );
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

function redirectLocation(
  response: Response | { status: number; location: string | null },
) {
  return response instanceof Response
    ? response.headers.get("location")
    : response.location;
}

const retryableStatus = new Set([408, 425, 500, 502, 503, 504]);

export async function checkApplyLink(
  rawUrl: string,
  parentSignal: AbortSignal,
  dependencies: Dependencies = {},
): Promise<ApplyLinkCheckResult> {
  const fetcher = dependencies.fetch;
  const resolve = dependencies.resolve ?? defaultPublicHttpsResolve;
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolveSleep) =>
        setTimeout(resolveSleep, milliseconds),
      ));
  const random = dependencies.random ?? Math.random;
  const startedAt = now();
  const allowed = await resolvePublicHttpsDestination(
    rawUrl,
    resolve,
    parentSignal,
  );
  if (allowed.status !== "allowed") {
    return {
      result: "indeterminate",
      httpStatus: null,
      errorCode:
        allowed.status === "unsafe"
          ? "unsafe_apply_destination"
          : allowed.status === "deadline_exceeded"
            ? "apply_link_deadline_exceeded"
            : "apply_link_resolution_failed",
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
        : await requestPinnedHttpsHead(destination, address, requestSignal);
      if (response.status >= 300 && response.status < 400) {
        const location = redirectLocation(response);
        if (!location) {
          return {
            result: "broken",
            httpStatus: response.status,
            errorCode: "apply_link_redirect_missing",
            responseMs: Math.max(0, now() - startedAt),
          };
        }
        let redirectUrl: string;
        try {
          redirectUrl = new URL(location, destination).toString();
        } catch {
          return {
            result: "broken",
            httpStatus: response.status,
            errorCode: "apply_link_redirect_invalid",
            responseMs: Math.max(0, now() - startedAt),
          };
        }
        const redirectDestination = await resolvePublicHttpsDestination(
          redirectUrl,
          resolve,
          requestSignal,
        );
        if (redirectDestination.status !== "allowed") {
          return {
            result:
              redirectDestination.status === "unsafe"
                ? "broken"
                : "indeterminate",
            httpStatus: response.status,
            errorCode:
              redirectDestination.status === "unsafe"
                ? "unsafe_apply_redirect"
                : redirectDestination.status === "deadline_exceeded"
                  ? "apply_link_redirect_deadline_exceeded"
                  : "apply_link_redirect_resolution_failed",
            responseMs: Math.max(0, now() - startedAt),
          };
        }
        return {
          result: "healthy",
          httpStatus: response.status,
          errorCode: null,
          responseMs: Math.max(0, now() - startedAt),
        };
      }
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
