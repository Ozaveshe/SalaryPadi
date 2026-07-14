export type BodyReadErrorCode = "invalid_body" | "too_large";

export class BodyReadError extends Error {
  constructor(public readonly code: BodyReadErrorCode) {
    super(code);
    this.name = "BodyReadError";
  }
}

/** Releases an unread fetch body without letting cleanup mask the primary outcome. */
export async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be locked, consumed, or failed. Cleanup is best effort.
  }
}

function declaredBodyLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (!value) return null;

  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
}

/** Enforces a byte limit against the actual body stream. */
export async function readBoundedBody(
  source: Request | Response,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new TypeError("maximumBytes must be a positive safe integer.");
  }

  const declaredLength = declaredBodyLength(source.headers);
  if (declaredLength !== null && declaredLength > maximumBytes) {
    await source.body?.cancel().catch(() => undefined);
    throw new BodyReadError("too_large");
  }
  if (!source.body) throw new BodyReadError("invalid_body");

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = source.body.getReader();
  } catch {
    throw new BodyReadError("invalid_body");
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
        throw new BodyReadError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError("invalid_body");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
