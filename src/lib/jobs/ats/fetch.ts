import { z } from "zod";

import {
  BodyReadError,
  discardResponseBody,
  readBoundedBody,
} from "@/lib/http/body";
import { sourceResponseCheckedAt } from "../freshness";
import {
  ashbyAdapter,
  greenhouseAdapter,
  leverAdapter,
  workableAdapter,
} from "./adapters";
import { atsAdapterError } from "./errors";
import type {
  AtsAuthorizedSource,
  AtsFetchOptions,
  AtsFetchResult,
  AtsInvalidRecordSummary,
  AtsProvider,
  AtsProviderAdapter,
  AtsSourceConfig,
  AtsSourceRecord,
} from "./types";

/** A hard ceiling; callers may only choose a smaller per-source limit. */
export const ATS_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);

const pathPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^\/(?!\/)[^?#\\]*$/)
  .refine((prefix) => {
    const parsed = new URL(prefix, "https://destination.invalid");
    return parsed.pathname === prefix;
  });

const allowedDestinationSchema = z
  .object({
    host: hostnameSchema,
    pathPrefixes: z.array(pathPrefixSchema).max(20).optional(),
  })
  .strict();

const authorizationSchema = z
  .object({
    kind: z.literal("employer"),
    authorizedBy: z.string().trim().min(1).max(300),
    reviewedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    evidenceReference: z.string().trim().min(1).max(500),
    allowedDestinations: z
      .array(allowedDestinationSchema)
      .max(20)
      .refine(
        (destinations) =>
          new Set(destinations.map(({ host }) => host)).size ===
          destinations.length,
      ),
  })
  .strict()
  .superRefine((authorization, context) => {
    if (
      authorization.expiresAt !== null &&
      authorization.expiresAt <= authorization.reviewedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "ATS authorization must expire after its review",
      });
    }
  });

const sourceBaseShape = {
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  employerName: z.string().trim().min(1).max(300),
  tenant: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  state: z.literal("authorized"),
  authorization: authorizationSchema,
};

const authorizedSourceSchema = z.discriminatedUnion("provider", [
  z.object({ ...sourceBaseShape, provider: z.literal("greenhouse") }).strict(),
  z
    .object({
      ...sourceBaseShape,
      provider: z.literal("lever"),
      region: z.enum(["global", "eu"]).optional(),
    })
    .strict(),
  z.object({ ...sourceBaseShape, provider: z.literal("ashby") }).strict(),
  z.object({ ...sourceBaseShape, provider: z.literal("workable") }).strict(),
]);

function isAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(
    value &&
    typeof value === "object" &&
    "aborted" in value &&
    typeof (value as { aborted?: unknown }).aborted === "boolean" &&
    "addEventListener" in value &&
    typeof (value as { addEventListener?: unknown }).addEventListener ===
      "function",
  );
}

function isAbortFailure(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function resolveOptions(options: AtsFetchOptions): {
  signal: AbortSignal;
  requestedAt: Date;
  maxBytes: number;
} {
  if (!isAbortSignal(options?.signal)) {
    throw atsAdapterError("ats_deadline_required");
  }
  if (options.signal.aborted) {
    throw atsAdapterError("ats_request_aborted");
  }

  const requestedAt = new Date(options.requestedAt?.valueOf() ?? Date.now());
  if (!Number.isFinite(requestedAt.valueOf())) {
    throw atsAdapterError("ats_invalid_source");
  }

  const maxBytes = options.maxResponseBytes ?? ATS_MAX_RESPONSE_BYTES;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > ATS_MAX_RESPONSE_BYTES
  ) {
    throw atsAdapterError("ats_invalid_source");
  }

  return { signal: options.signal, requestedAt, maxBytes };
}

function isJsonResponse(response: Response): boolean {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
  );
}

async function readBoundedJson(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  provider: AtsProvider,
): Promise<unknown> {
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBody(response, maxBytes);
  } catch (error) {
    if (error instanceof BodyReadError && error.code === "too_large") {
      throw atsAdapterError("ats_response_too_large", provider);
    }
    throw atsAdapterError(
      signal.aborted || isAbortFailure(error)
        ? "ats_request_aborted"
        : "ats_response_read_failed",
      provider,
    );
  }

  if (signal.aborted) {
    throw atsAdapterError("ats_request_aborted", provider);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw atsAdapterError("ats_invalid_json", provider);
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (signal.aborted) {
      throw atsAdapterError("ats_request_aborted", provider);
    }
    return payload;
  } catch {
    if (signal.aborted) {
      throw atsAdapterError("ats_request_aborted", provider);
    }
    throw atsAdapterError("ats_invalid_json", provider);
  }
}

function issuePaths(error: z.ZodError): string[] {
  return [
    ...new Set(
      error.issues.map((issue) =>
        issue.path.length
          ? issue.path.map((segment) => String(segment)).join(".")
          : "record",
      ),
    ),
  ].slice(0, 10);
}

async function fetchWithAdapter<P extends AtsProvider, TPayload, TRecord>(
  adapter: AtsProviderAdapter<P, TPayload, TRecord>,
  source: AtsAuthorizedSource<P>,
  options: AtsFetchOptions,
): Promise<AtsFetchResult> {
  const { signal, requestedAt, maxBytes } = resolveOptions(options);
  const reviewedAt = Date.parse(source.authorization.reviewedAt);
  const expiresAt = source.authorization.expiresAt
    ? Date.parse(source.authorization.expiresAt)
    : null;
  if (
    reviewedAt > requestedAt.valueOf() + 5 * 60_000 ||
    (expiresAt !== null && expiresAt <= requestedAt.valueOf())
  ) {
    throw atsAdapterError("ats_invalid_source", adapter.provider);
  }
  const endpoint = adapter.buildEndpoint(source);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      body: null,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    throw atsAdapterError(
      signal.aborted || isAbortFailure(error)
        ? "ats_request_aborted"
        : "ats_request_failed",
      adapter.provider,
    );
  }

  if (!response.ok) {
    await discardResponseBody(response);
    throw atsAdapterError("ats_http_error", adapter.provider, response.status);
  }
  if (!isJsonResponse(response)) {
    await discardResponseBody(response);
    throw atsAdapterError("ats_invalid_content_type", adapter.provider);
  }

  const payload = await readBoundedJson(
    response,
    maxBytes,
    signal,
    adapter.provider,
  );
  const parsed = adapter.payloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw atsAdapterError("ats_invalid_payload", adapter.provider);
  }

  const checkedAt = sourceResponseCheckedAt(response.headers, requestedAt);
  const providerRecords = adapter.records(parsed.data);
  const records: AtsSourceRecord[] = [];
  const invalidRecords: AtsInvalidRecordSummary[] = [];
  let filteredRecordCount = 0;

  for (const [index, rawRecord] of providerRecords.entries()) {
    const parsedRecord = adapter.recordSchema.safeParse(rawRecord);
    if (!parsedRecord.success) {
      invalidRecords.push({
        index,
        stage: "validation",
        issuePaths: issuePaths(parsedRecord.error),
      });
      continue;
    }

    try {
      const normalized = adapter.normalizeRecord(
        parsedRecord.data,
        source,
        checkedAt,
      );
      if (normalized) records.push(normalized);
      else filteredRecordCount += 1;
    } catch {
      invalidRecords.push({
        index,
        stage: "normalization",
        issuePaths: [],
      });
    }
  }

  return {
    records,
    invalidRecords,
    snapshot: {
      status: "complete",
      providerRecordCount: providerRecords.length,
      providerReportedTotal: adapter.providerReportedTotal(parsed.data),
      acceptedRecordCount: records.length,
      filteredRecordCount,
      invalidRecordCount: invalidRecords.length,
      isEmpty: providerRecords.length === 0,
    },
    checkedAt,
    endpoint: endpoint.toString(),
  };
}

export async function fetchAtsSourceRecords(
  source: AtsSourceConfig,
  options: AtsFetchOptions,
): Promise<AtsFetchResult> {
  if (source.state !== "authorized") {
    throw atsAdapterError("ats_source_disabled", source.provider);
  }

  const parsed = authorizedSourceSchema.safeParse(source);
  if (!parsed.success) {
    throw atsAdapterError("ats_invalid_source", source.provider);
  }

  switch (parsed.data.provider) {
    case "greenhouse":
      return fetchWithAdapter(greenhouseAdapter, parsed.data, options);
    case "lever":
      return fetchWithAdapter(leverAdapter, parsed.data, options);
    case "ashby":
      return fetchWithAdapter(ashbyAdapter, parsed.data, options);
    case "workable":
      return fetchWithAdapter(workableAdapter, parsed.data, options);
  }
}
