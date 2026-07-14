import { BodyReadError, readBoundedBody } from "@/lib/http/body";

export type FormBodyErrorCode = "invalid_form" | "too_large";

export class FormBodyError extends Error {
  constructor(public readonly code: FormBodyErrorCode) {
    super(code);
    this.name = "FormBodyError";
  }
}

export async function readBoundedFormData(
  request: Request,
  maximumBytes: number,
): Promise<FormData> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readBoundedBody(request, maximumBytes);
  } catch (error) {
    if (error instanceof BodyReadError) {
      throw new FormBodyError(
        error.code === "too_large" ? "too_large" : "invalid_form",
      );
    }
    throw error;
  }

  const contentType = request.headers.get("content-type");
  if (!contentType) throw new FormBodyError("invalid_form");
  try {
    return await new Response(bytes.buffer, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new FormBodyError("invalid_form");
  }
}
