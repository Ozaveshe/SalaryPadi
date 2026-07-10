export type JsonBodyErrorCode = "invalid_json" | "too_large";

export class JsonBodyError extends Error {
  constructor(public readonly code: JsonBodyErrorCode) {
    super(code);
    this.name = "JsonBodyError";
  }
}

function declaredBodyLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (!value) return null;

  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
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
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new TypeError("maximumBytes must be a positive safe integer.");
  }

  const declaredLength = declaredBodyLength(source.headers);
  if (declaredLength !== null && declaredLength > maximumBytes) {
    throw new JsonBodyError("too_large");
  }

  if (!source.body) throw new JsonBodyError("invalid_json");

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = source.body.getReader();
  } catch {
    throw new JsonBodyError("invalid_json");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new JsonBodyError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    throw new JsonBodyError("invalid_json");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
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
