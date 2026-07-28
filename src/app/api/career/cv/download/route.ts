import { z } from "zod";

import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import { getCandidateCvs } from "@/lib/career/cv/repository";
import { noStoreJson } from "@/lib/http/json";

/**
 * Hands the owner a short-lived signed URL for their own CV.
 *
 * The bucket is private, so there is no public path to the file at all. The
 * signature is minted per request and expires in a minute — long enough for the
 * browser to follow the redirect, short enough that a copied URL is not a
 * lasting way to reach the document.
 */
const SIGNED_URL_TTL_SECONDS = 60;

const schema = z.object({ id: z.uuid() });

export async function GET(request: Request) {
  const parsed = schema.safeParse({
    id: new URL(request.url).searchParams.get("id"),
  });
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid CV reference." }, { status: 400 });
  }

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  // Resolving the path through the owner-scoped read means a path can never be
  // supplied by the caller, only chosen from what they already own.
  const stored = await getCandidateCvs();
  if (stored.state !== "ready") {
    return noStoreJson(
      { error: "Your CV records are temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }
  const cv = stored.data.find((row) => row.id === parsed.data.id);
  if (!cv) return noStoreJson({ error: "CV not found." }, { status: 404 });

  const signed = await attemptApiOperation(
    "career.cv_signed_url",
    "cv_signed_url_failed",
    "CV storage is temporarily unavailable.",
    async () =>
      await context.supabase.storage
        .from("candidate-cv")
        .createSignedUrl(cv.storage_path, SIGNED_URL_TTL_SECONDS, {
          download: cv.file_name,
        }),
  );
  if (!signed.ok) return signed.response;
  if (signed.value.error || !signed.value.data?.signedUrl) {
    return noStoreJson(
      { error: "The CV could not be opened. Try again." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }

  return noStoreRedirect(signed.value.data.signedUrl, 303);
}
