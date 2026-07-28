import { randomUUID } from "node:crypto";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import {
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";
import { getAuthenticatedApiContext } from "@/lib/auth/api";
import {
  CV_CONTENT_TYPES,
  extractCvText,
  isCvContentType,
  type CvContentType,
} from "@/lib/career/cv/extract";
import { getAppOrigin } from "@/lib/env";
import { noStoreJson } from "@/lib/http/json";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

/** Mirrors the bucket's own limit, so an oversized file is refused before upload. */
const MAX_CV_BYTES = 5 * 1_024 * 1_024;

/** Multipart overhead on top of the file itself. */
const MAX_REQUEST_BYTES = MAX_CV_BYTES + 64 * 1_024;

const EXTENSIONS: Record<CvContentType, string> = {
  [CV_CONTENT_TYPES.pdf]: "pdf",
  [CV_CONTENT_TYPES.docx]: "docx",
  [CV_CONTENT_TYPES.txt]: "txt",
};

function back(status: string) {
  const url = new URL("/account/candidate-profile", getAppOrigin());
  url.searchParams.set("cv", status);
  return noStoreRedirect(url, 303);
}

/**
 * Stores a CV and records what could be read out of it.
 *
 * The file goes to a private bucket under the owner's own id prefix, which is
 * what the storage policies key on. The text is read here, once, so the profile
 * form can offer a draft and the match surface has something to compare — the
 * document itself is never read again on a page request.
 *
 * A document that cannot be read is still stored. The owner uploaded it
 * deliberately, and losing their file because the reader could not parse it
 * would be worse than storing it with the parse outcome recorded against it.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const form = await readApiForm(request, MAX_REQUEST_BYTES, {
    invalidMessage: "Invalid CV upload.",
    tooLargeMessage: "A CV must be 5MB or smaller.",
  });
  if (!form.ok) return form.response;

  const file = form.data.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    return back("invalid");
  }
  if (file.size > MAX_CV_BYTES) return back("too-large");
  if (!isCvContentType(file.type)) return back("unsupported");

  const context = await getAuthenticatedApiContext();
  if (!context.ok) return context.response;

  const bytes = Buffer.from(await file.arrayBuffer());
  const extraction = await extractCvText(bytes, file.type);
  const storagePath = `${context.viewer.id}/${randomUUID()}.${EXTENSIONS[file.type]}`;

  const upload = await attemptApiOperation(
    "career.cv_upload",
    "cv_upload_failed",
    "CV storage is temporarily unavailable.",
    async () => {
      const result = await context.supabase.storage
        .from("candidate-cv")
        .upload(storagePath, bytes, {
          contentType: file.type,
          upsert: false,
        });
      // The storage client reports failure in the payload rather than by
      // throwing, so it is surfaced the same way an RPC error would be.
      return { data: result.data, error: result.error };
    },
  );
  if (!upload.ok) return upload.response;
  if (upload.value.error) return back("error");

  const record = await attemptApiOperation(
    "career.cv_record",
    "cv_record_failed",
    "CV storage is temporarily unavailable.",
    async () =>
      await context.supabase.schema("api").rpc("record_my_cv", {
        cv_payload: {
          storage_path: storagePath,
          // The browser-supplied name is display-only and never used as a path.
          file_name: file.name.slice(0, 260),
          content_type: file.type,
          byte_size: file.size,
          extracted_text:
            extraction.state === "parsed" ? extraction.text : null,
          parse_state: extraction.state,
          parse_note:
            extraction.state === "unreadable" ? extraction.note : null,
        },
      }),
  );
  if (!record.ok) return record.response;

  const decoded = decodeApiRpcResult(
    "career.cv_record",
    "cv_record_failed",
    record.value,
    apiRpcUuidResultSchema,
  );
  if (!decoded.ok) {
    // The row is what makes the object reachable. Without it the upload is an
    // orphan the owner could never see or delete, so it is removed.
    await context.supabase.storage.from("candidate-cv").remove([storagePath]);
    return back("error");
  }

  return back(extraction.state === "parsed" ? "read" : "stored-unreadable");
}

export async function GET() {
  return noStoreJson({ error: "Method not allowed." }, { status: 405 });
}
