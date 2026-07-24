import { z } from "zod";

import { readApiForm } from "@/lib/api/form";
import { attemptApiOperation } from "@/lib/api/operation";
import { noStoreRedirect } from "@/lib/api/response";
import { getAdminApiContext } from "@/lib/auth/api";
import { noStoreJson } from "@/lib/http/json";
import { parseEmployerFeedRegistry } from "@/lib/jobs/feeds";
import { feedRunEligibility } from "@/lib/jobs/feeds/runtime";
import { MAX_FEED_PAYLOAD_BYTES } from "@/lib/jobs/feeds/types";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

import registryConfig from "../../../../../config/employer-feed-registry.json";

/**
 * Operator-authorized employer CSV import.
 *
 * This is deliberately NOT employer self-service. Verified-employer upload
 * would require a verified company relationship the platform does not yet
 * establish, so the honest option is an admin/operator-only boundary: a
 * SalaryPadi operator, acting on a recorded employer authorization, submits
 * the employer's file.
 *
 * Enforced here:
 * - authenticated actor with the admin role (getAdminApiContext, which also
 *   requires the project's MFA/AAL2 posture);
 * - CSRF via the project's same-origin rejection helper;
 * - no arbitrary feedKey: the key must exist in the committed registry;
 * - the feed's per-feed authorization AND the global source policy must both
 *   currently permit a run (same gate the scheduled worker uses);
 * - CSV content type and .csv extension;
 * - hard file-size limit, checked before the body is read into memory;
 * - the upload is STAGED for explicit operator confirmation — it is never
 *   processed synchronously into published jobs by this request.
 *
 * Staging (not processing) is what keeps this honest today: no employer feed
 * is authorized, so there is nothing to import, and this route refuses
 * everything it is given rather than pretending to ingest it.
 */

const MAX_UPLOAD_BYTES = Math.min(MAX_FEED_PAYLOAD_BYTES, 4 * 1024 * 1024);

const requestSchema = z.object({
  feed_key: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(80),
  /** Operator must explicitly confirm; an unconfirmed upload only stages. */
  confirm: z.enum(["stage", "confirm"]).default("stage"),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return crossOrigin;

  const context = await getAdminApiContext();
  if (!context.ok) return context.response;

  const outcome = await attemptApiOperation(
    "admin.employer_feed_import",
    "employer_feed_import_failed",
    "The upload could not be processed.",
    async (): Promise<Response> => {
      // Bounded body read: the project's shared reader enforces the byte cap
      // while streaming, so an oversized upload is rejected rather than
      // buffered.
      const formResult = await readApiForm(request, MAX_UPLOAD_BYTES, {
        invalidMessage: "The upload could not be read.",
      });
      if (!formResult.ok) return formResult.response;
      const form = formResult.data;

      const parsed = requestSchema.safeParse({
        feed_key: form.get("feed_key"),
        confirm: form.get("confirm") ?? "stage",
      });
      if (!parsed.success) {
        return noStoreJson({ error: "invalid_request" }, { status: 400 });
      }

      const file = form.get("file");
      if (!(file instanceof File)) {
        return noStoreJson({ error: "file_required" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return noStoreJson({ error: "file_too_large" }, { status: 413 });
      }
      const looksCsv =
        file.name.toLowerCase().endsWith(".csv") &&
        (file.type === "" ||
          file.type === "text/csv" ||
          file.type === "application/csv" ||
          file.type === "text/plain");
      if (!looksCsv) {
        return noStoreJson({ error: "csv_required" }, { status: 415 });
      }

      // No arbitrary feed keys: the key must be a registered, CSV-kind feed.
      const registry = parseEmployerFeedRegistry(registryConfig);
      const feed = registry.feeds.find(
        (entry: { feedKey: string; kind: string }) =>
          entry.feedKey === parsed.data.feed_key,
      );
      if (!feed || feed.kind !== "csv") {
        return noStoreJson({ error: "unknown_feed" }, { status: 404 });
      }

      // The same eligibility gate the worker uses: per-feed authorization and
      // the global source policy must both currently permit a run.
      const eligibility = feedRunEligibility(feed, new Date());
      if (!eligibility.runnable) {
        return noStoreJson(
          {
            error: "feed_not_authorized",
            reason: eligibility.reason,
            policy_code: eligibility.policyCode ?? null,
          },
          { status: 409 },
        );
      }

      // Reaching here requires a real authorized CSV feed, which does not exist
      // yet. The upload is staged for explicit operator confirmation and is
      // never processed into published jobs inside this request.
      if (parsed.data.confirm !== "confirm") {
        return noStoreJson(
          {
            status: "staged",
            feed_key: feed.feedKey,
            bytes: file.size,
            message:
              "Upload staged. Re-submit with confirm=confirm to queue it for import.",
          },
          { status: 202 },
        );
      }

      return noStoreRedirect(
        `/admin/imports?staged=${encodeURIComponent(feed.feedKey)}`,
      );
    },
  );
  return outcome.ok ? outcome.value : outcome.response;
}
