import { BodyReadError, readBoundedBody } from "@/lib/http/body";

export type JsonBodyErrorCode = "invalid_json" | "too_large";

export class JsonBodyError extends Error {
  constructor(public readonly code: JsonBodyErrorCode) {
    super(code);
    this.name = "JsonBodyError";
  }
}

/**
 * Reads a JSON request or response while enforcing the byte limit against the
 * actual stream. Content-Length is only an early rejection hint and is never
 * trusted as the sole size boundary.
 */
export async function readBoundedJson(
  source: Request | Response,
  maximumBytes: number,
): Promise<unknown> {
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBody(source, maximumBytes);
  } catch (error) {
    if (error instanceof BodyReadError) {
      throw new JsonBodyError(
        error.code === "too_large" ? "too_large" : "invalid_json",
      );
    }
    throw error;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonBodyError("invalid_json");
  }
}

export function noStoreJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function noStoreResponse(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
