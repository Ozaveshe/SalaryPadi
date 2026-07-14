import { FormBodyError, readBoundedFormData } from "@/lib/http/form";
import { noStoreJson } from "@/lib/http/json";

export type ApiFormResult =
  { ok: true; data: FormData } | { ok: false; response: Response };

export async function readApiForm(
  request: Request,
  maximumBytes: number,
  {
    invalidMessage,
    tooLargeMessage = "Request is too large.",
  }: { invalidMessage: string; tooLargeMessage?: string },
): Promise<ApiFormResult> {
  try {
    return {
      ok: true,
      data: await readBoundedFormData(request, maximumBytes),
    };
  } catch (error) {
    if (!(error instanceof FormBodyError)) throw error;
    const tooLarge = error.code === "too_large";
    return {
      ok: false,
      response: noStoreJson(
        { error: tooLarge ? tooLargeMessage : invalidMessage },
        { status: tooLarge ? 413 : 400 },
      ),
    };
  }
}
