import { BUNDLED_AFROTOOLS_CATALOG } from "@/lib/afrotools/catalog";

export const TEST_AFROTOOLS_ETAG = `"sha256-${"A".repeat(43)}"`;

const schemaOrigin = "https://afrotools.com/api/schemas/v1";

export function createProtectedCatalogFixture() {
  const tools = BUNDLED_AFROTOOLS_CATALOG.tools.map((tool) => {
    const api =
      tool.id === "ng-paye"
        ? { method: "POST" as const, path: "/api/v1/tax/paye" }
        : tool.id === "currency-converter"
          ? { method: "GET" as const, path: "/api/v1/fx/rates" }
          : null;
    const integrationMode = api ? ("api" as const) : ("link" as const);
    return {
      schemaVersion: "1.0.0" as const,
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: "career" as const,
      published: true as const,
      priority: tool.priority,
      integrationMode,
      canonicalUrl: new URL(tool.url, "https://afrotools.com").toString(),
      countries: tool.countries,
      api,
      widget: null,
      inputSchema: api ? `${schemaOrigin}/${tool.id}-input.schema.json` : null,
      outputSchema: api
        ? `${schemaOrigin}/${tool.id}-output.schema.json`
        : null,
      rulesVersion: api ? `${tool.id.toUpperCase()}-V1` : null,
      lastVerified: "2026-07-11",
      disclaimer: api
        ? "Use the returned source, rules version and verification date."
        : "This link opens the canonical AfroTools page.",
      attribution: {
        required: true as const,
        text: `Tool by AfroTools: ${tool.name}`,
        url: "https://afrotools.com",
      },
    };
  });

  return {
    schemaVersion: "1.0.0" as const,
    product: "salarypadi" as const,
    category: "career" as const,
    publishedAt: "2026-07-11",
    lastVerified: "2026-07-11",
    count: tools.length,
    tools,
    supportingApis: [
      {
        id: "paye",
        method: "POST" as const,
        path: "/api/v1/tax/paye",
        inputSchema: `${schemaOrigin}/paye-input.schema.json`,
        outputSchema: `${schemaOrigin}/paye-output.schema.json`,
        lastVerified: "2026-07-11",
      },
      {
        id: "fx",
        method: "GET" as const,
        path: "/api/v1/fx/rates",
        inputSchema: `${schemaOrigin}/fx-query.schema.json`,
        outputSchema: `${schemaOrigin}/fx-response.schema.json`,
        lastVerified: "2026-07-11",
      },
    ],
    contract: {
      schema: `${schemaOrigin}/tool-catalog-response.schema.json`,
      documentation:
        "https://afrotools.com/docs/salarypadi-integration-contract/",
      attribution: "Tool metadata by AfroTools.",
    },
  };
}
