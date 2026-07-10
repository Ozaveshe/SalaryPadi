import "server-only";

import { getAfroToolsConfig } from "@/lib/env";

export class AfroToolsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AfroToolsApiError";
    this.status = status;
  }
}

export async function callAfroTools(
  path: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const configuration = getAfroToolsConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${configuration.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(configuration.apiKey ? { "x-api-key": configuration.apiKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (
      !response.ok ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      throw new AfroToolsApiError(
        `AfroTools request failed with status ${response.status}.`,
        response.status,
      );
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AfroToolsApiError) throw error;
    throw new AfroToolsApiError(
      error instanceof Error && error.name === "AbortError"
        ? "AfroTools request timed out."
        : "AfroTools is temporarily unavailable.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
