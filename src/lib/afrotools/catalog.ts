import { z } from "zod";

import { readBoundedJson } from "@/lib/http/json";

export const AFROTOOLS_CATALOG_PATH = "/catalog/tools";
export const AFROTOOLS_CATALOG_SOURCE_URL =
  "https://afrotools.com/api/v1/catalog/tools?product=salarypadi&category=career";
export const AFROTOOLS_CATALOG_MAX_BYTES = 2 * 1024 * 1024;
export const AFROTOOLS_CATALOG_FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
export const AFROTOOLS_CATALOG_MAX_STALE_MS = 30 * 24 * 60 * 60 * 1_000;

const catalogDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const afroToolsCatalogEtagSchema = z
  .string()
  .regex(/^"sha256-[A-Za-z0-9_-]{43}"$/);
const opaqueHttpEtagSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^(?:W\/)?"[\x21\x23-\x7e]{1,150}"$/);
const afroToolsHttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === "https://afrotools.com" &&
      !url.username &&
      !url.password
    );
  }, "URL must use the approved AfroTools HTTPS origin.");
const integrationModeSchema = z.enum(["api", "widget", "link"]);
const catalogApiSchema = z
  .object({
    method: z.enum(["GET", "POST"]),
    path: z.string().regex(/^\/api\/v1\//),
  })
  .strict();
const catalogAttributionSchema = z
  .object({
    required: z.literal(true),
    text: z.string().min(1).max(300),
    url: afroToolsHttpsUrlSchema,
  })
  .passthrough();
const catalogContractToolSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1).max(180),
    description: z.string().min(1).max(600),
    category: z.literal("career"),
    published: z.literal(true),
    priority: z.number().int().min(0).max(100),
    integrationMode: integrationModeSchema,
    canonicalUrl: afroToolsHttpsUrlSchema,
    countries: z
      .array(z.string().regex(/^(?:ALL|[A-Z]{2})$/))
      .min(1)
      .max(60),
    api: catalogApiSchema.nullable(),
    widget: z.object({ url: afroToolsHttpsUrlSchema }).passthrough().nullable(),
    inputSchema: afroToolsHttpsUrlSchema.nullable(),
    outputSchema: afroToolsHttpsUrlSchema.nullable(),
    rulesVersion: z.string().min(1).max(160).nullable(),
    lastVerified: catalogDateSchema,
    disclaimer: z.string().min(1).max(1_000),
    attribution: catalogAttributionSchema,
  })
  .passthrough()
  .superRefine((tool, context) => {
    if (tool.integrationMode === "api" && (!tool.api || tool.widget !== null)) {
      context.addIssue({
        code: "custom",
        path: ["api"],
        message: "API mode requires one documented API endpoint only.",
      });
    }
    if (
      tool.integrationMode === "widget" &&
      (!tool.widget || tool.api !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["widget"],
        message: "Widget mode requires one tested HTTPS widget only.",
      });
    }
    if (
      tool.integrationMode === "link" &&
      (tool.api !== null ||
        tool.widget !== null ||
        tool.inputSchema !== null ||
        tool.outputSchema !== null ||
        tool.rulesVersion !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["integrationMode"],
        message:
          "Link mode cannot claim an API, widget or calculation contract.",
      });
    }
  });
const supportingApiSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    method: z.enum(["GET", "POST"]),
    path: z.string().regex(/^\/api\/v1\//),
    inputSchema: afroToolsHttpsUrlSchema,
    outputSchema: afroToolsHttpsUrlSchema,
    lastVerified: catalogDateSchema,
  })
  .strict();
const protectedCatalogSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    product: z.literal("salarypadi"),
    category: z.literal("career"),
    publishedAt: catalogDateSchema,
    lastVerified: catalogDateSchema,
    count: z.number().int().min(10).max(100),
    tools: z.array(catalogContractToolSchema).min(10).max(100),
    supportingApis: z.array(supportingApiSchema).max(50),
    contract: z
      .object({
        schema: afroToolsHttpsUrlSchema,
        documentation: afroToolsHttpsUrlSchema,
        attribution: z.string().min(1).max(500),
      })
      .passthrough(),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.count !== catalog.tools.length) {
      context.addIssue({
        code: "custom",
        path: ["count"],
        message: "Catalog count must match the published tool array.",
      });
    }
    if (new Set(catalog.tools.map((tool) => tool.id)).size !== catalog.count) {
      context.addIssue({
        code: "custom",
        path: ["tools"],
        message: "Catalog tool IDs must be unique.",
      });
    }
  });

const catalogToolSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(180),
  description: z.string().min(1).max(600),
  category_key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().min(1).max(160).optional(),
  countries: z
    .array(z.string().regex(/^(?:ALL|[A-Z]{2})$/))
    .min(1)
    .max(60),
  status: z.literal("Live"),
  language: z.literal("en"),
  last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().regex(/^\/[A-Za-z0-9][A-Za-z0-9_./-]*\/?$/),
  priority: z.number().int().min(0).max(100),
  integration_mode: integrationModeSchema.optional(),
  canonical_url: afroToolsHttpsUrlSchema.optional(),
  api: catalogApiSchema.nullable().optional(),
  widget_url: afroToolsHttpsUrlSchema.nullable().optional(),
  input_schema: afroToolsHttpsUrlSchema.nullable().optional(),
  output_schema: afroToolsHttpsUrlSchema.nullable().optional(),
  rules_version: z.string().min(1).max(160).nullable().optional(),
  disclaimer: z.string().min(1).max(1_000).optional(),
  attribution: catalogAttributionSchema.optional(),
});

export type AfroToolsCatalogTool = z.infer<typeof catalogToolSchema>;

export const catalogSnapshotSchema = z
  .object({
    version: z.literal(1),
    sourceUrl: z.union([
      z.literal("https://afrotools.com/data/tool-directory.json"),
      z.literal(AFROTOOLS_CATALOG_SOURCE_URL),
    ]),
    checkedAt: z.string(),
    catalogLastUpdated: catalogDateSchema,
    catalogPublishedAt: catalogDateSchema.optional(),
    schemaVersion: z.literal("1.0.0").optional(),
    documentationUrl: afroToolsHttpsUrlSchema.optional(),
    etag: opaqueHttpEtagSchema.optional(),
    etagSource: z.enum(["afrotools", "http"]).optional(),
    tools: z.array(catalogToolSchema).min(1).max(100),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.sourceUrl !== AFROTOOLS_CATALOG_SOURCE_URL) return;
    for (const [field, value] of [
      ["catalogPublishedAt", snapshot.catalogPublishedAt],
      ["schemaVersion", snapshot.schemaVersion],
      ["documentationUrl", snapshot.documentationUrl],
      ["etag", snapshot.etag],
      ["etagSource", snapshot.etagSource],
    ] as const) {
      if (value === undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Protected catalog snapshots require versioned provenance.",
        });
      }
    }
    snapshot.tools.forEach((tool, index) => {
      for (const [field, value] of [
        ["integration_mode", tool.integration_mode],
        ["canonical_url", tool.canonical_url],
        ["api", tool.api],
        ["widget_url", tool.widget_url],
        ["input_schema", tool.input_schema],
        ["output_schema", tool.output_schema],
        ["rules_version", tool.rules_version],
        ["disclaimer", tool.disclaimer],
        ["attribution", tool.attribution],
      ] as const) {
        if (value === undefined) {
          context.addIssue({
            code: "custom",
            path: ["tools", index, field],
            message: "Protected tools require complete integration metadata.",
          });
        }
      }
    });
  });

export type AfroToolsCatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

const careerCategoryKeys = new Set(["career", "hr-payroll"]);
const careerToolIds = new Set([
  "ng-paye",
  "currency-converter",
  "cv-builder",
  "interview-prep",
  "job-offer-evaluator",
  "salary-compare",
  "salary-intelligence",
  "minimum-wage",
  "overtime-calc",
  "leave-calculator",
  "pension-projection",
]);

export function selectCareerTools(value: unknown): AfroToolsCatalogTool[] {
  const parsed = z.array(catalogToolSchema).min(1).max(2_000).safeParse(value);
  if (!parsed.success) throw new Error("AfroTools catalog contract changed.");
  const selected = parsed.data.filter(
    (tool) =>
      careerCategoryKeys.has(tool.category_key) || careerToolIds.has(tool.id),
  );
  if (selected.length < 10) {
    throw new Error("AfroTools career catalog is unexpectedly incomplete.");
  }
  const unique = new Map(selected.map((tool) => [tool.id, tool]));
  return [...unique.values()].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  );
}

export async function fetchAfroToolsCatalog(
  apiBaseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  previousSnapshot?: AfroToolsCatalogSnapshot | null,
): Promise<{
  snapshot: AfroToolsCatalogSnapshot;
  httpStatus: 200 | 304;
  notModified: boolean;
}> {
  if (!apiKey.trim()) throw new Error("AfroTools catalog key is required.");
  const endpoint = new URL(
    `${apiBaseUrl.replace(/\/+$/, "")}${AFROTOOLS_CATALOG_PATH}`,
  );
  endpoint.searchParams.set("product", "salarypadi");
  endpoint.searchParams.set("category", "career");
  const previousEtag = previousSnapshot?.etag;
  const response = await fetchImpl(endpoint, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
      ...(previousEtag ? { "If-None-Match": previousEtag } : {}),
      ...(previousEtag && previousSnapshot?.etagSource === "afrotools"
        ? { "X-AfroTools-If-None-Match": previousEtag }
        : {}),
    },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  });
  const mirroredEtag = response.headers.get("x-afrotools-catalog-etag");
  const standardEtag = response.headers.get("etag");
  let responseEtag: string | null = null;
  let responseEtagSource: "afrotools" | "http" | null = null;
  if (mirroredEtag !== null) {
    if (!afroToolsCatalogEtagSchema.safeParse(mirroredEtag).success) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("AfroTools catalog returned an invalid signed ETag.");
    }
    responseEtag = mirroredEtag;
    responseEtagSource = "afrotools";
  } else if (
    standardEtag !== null &&
    opaqueHttpEtagSchema.safeParse(standardEtag).success
  ) {
    // Netlify may weaken or replace a function ETag at the HTTP boundary. It
    // remains safe as an opaque conditional validator after full body checks.
    responseEtag = standardEtag;
    responseEtagSource = "http";
  }
  if (response.status === 304) {
    await response.body?.cancel().catch(() => undefined);
    if (
      !previousSnapshot ||
      previousSnapshot.sourceUrl !== AFROTOOLS_CATALOG_SOURCE_URL ||
      !previousEtag ||
      !responseEtag ||
      responseEtag !== previousEtag
    ) {
      throw new Error("AfroTools returned an unusable catalog revalidation.");
    }
    return {
      snapshot: {
        ...previousSnapshot,
        checkedAt: new Date().toISOString(),
        etagSource: responseEtagSource ?? previousSnapshot.etagSource,
      },
      httpStatus: 304,
      notModified: true,
    };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`AfroTools catalog returned HTTP ${response.status}.`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("AfroTools catalog returned an invalid content type.");
  }
  if (!responseEtag || !responseEtagSource) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("AfroTools catalog omitted its versioned ETag.");
  }
  const payload = await readBoundedJson(response, AFROTOOLS_CATALOG_MAX_BYTES);
  const parsed = protectedCatalogSchema.safeParse(payload);
  if (!parsed.success) throw new Error("AfroTools catalog contract changed.");
  const tools: AfroToolsCatalogTool[] = parsed.data.tools.map((tool) => {
    const canonicalUrl = new URL(tool.canonicalUrl);
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category_key: tool.category,
      category: "Career",
      countries: tool.countries,
      status: "Live",
      language: "en",
      last_updated: tool.lastVerified,
      url: canonicalUrl.pathname,
      priority: tool.priority,
      integration_mode: tool.integrationMode,
      canonical_url: tool.canonicalUrl,
      api: tool.api,
      widget_url: tool.widget?.url ?? null,
      input_schema: tool.inputSchema,
      output_schema: tool.outputSchema,
      rules_version: tool.rulesVersion,
      disclaimer: tool.disclaimer,
      attribution: tool.attribution,
    };
  });
  const snapshot: AfroToolsCatalogSnapshot = {
    version: 1,
    sourceUrl: AFROTOOLS_CATALOG_SOURCE_URL,
    checkedAt: new Date().toISOString(),
    catalogLastUpdated: parsed.data.lastVerified,
    catalogPublishedAt: parsed.data.publishedAt,
    schemaVersion: parsed.data.schemaVersion,
    documentationUrl: parsed.data.contract.documentation,
    etag: responseEtag,
    etagSource: responseEtagSource,
    tools,
  };
  if (!catalogSnapshotSchema.safeParse(snapshot).success) {
    throw new Error("AfroTools catalog mapping failed validation.");
  }
  return { snapshot, httpStatus: 200, notModified: false };
}

export type CatalogAvailability = {
  snapshot: AfroToolsCatalogSnapshot | null;
  state: "live" | "stale" | "unavailable";
  ageMs: number | null;
};

export function evaluateCatalogSnapshot(
  value: unknown,
  now = new Date(),
): CatalogAvailability {
  const parsed = catalogSnapshotSchema.safeParse(value);
  if (!parsed.success)
    return { snapshot: null, state: "unavailable", ageMs: null };
  const checkedAt = Date.parse(parsed.data.checkedAt);
  const ageMs = now.valueOf() - checkedAt;
  if (!Number.isFinite(checkedAt) || ageMs < -5 * 60 * 1_000) {
    return { snapshot: null, state: "unavailable", ageMs: null };
  }
  if (ageMs > AFROTOOLS_CATALOG_MAX_STALE_MS) {
    return { snapshot: null, state: "unavailable", ageMs };
  }
  return {
    snapshot: parsed.data,
    state: ageMs <= AFROTOOLS_CATALOG_FRESH_MS ? "live" : "stale",
    ageMs,
  };
}

export { BUNDLED_AFROTOOLS_CATALOG } from "./catalog-fallback";
