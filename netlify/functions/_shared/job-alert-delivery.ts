import {
  filterAndSortJobs,
  jobAlertSearchSpecSchema,
  parseJobSearch,
} from "../../../src/lib/jobs/search";
import type { Job } from "../../../src/lib/jobs/types";
import { z } from "zod";

import { discardResponseBody } from "../../../src/lib/http/body";

import {
  boundedSignal,
  EXTERNAL_REQUEST_TIMEOUT_MS,
  getRuntimeAppOrigin,
  getRuntimeHeaderCredential,
  getRuntimeMailbox,
  OperationalError,
  readBoundedOperationalJson,
} from "./runtime";

const EMAIL_PROVIDER_MAX_RESPONSE_BYTES = 16 * 1024;
const ALERT_CLAIM_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const emailProviderResponseSchema = z
  .object({ id: z.string().uuid() })
  .passthrough();

export const alertClaimSchema = z
  .object({
    delivery_id: z.string().uuid(),
    claim_token: z.string().uuid(),
    alert_id: z.string().uuid(),
    recipient_email: z.string().email().max(320),
    search_spec: jobAlertSearchSpecSchema,
    cadence: z.enum(["daily", "weekly"]),
    last_sent_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type AlertClaim = z.infer<typeof alertClaimSchema>;

export function matchAlertJobs(
  claim: AlertClaim,
  jobs: Job[],
  now = new Date(),
): Job[] {
  const search = parseJobSearch(claim.search_spec);
  const cadenceWindow = claim.cadence === "weekly" ? 7 : 1;
  const nowValue = now.valueOf();
  const lastSent = claim.last_sent_at ? Date.parse(claim.last_sent_at) : 0;
  if (
    !Number.isFinite(nowValue) ||
    !Number.isFinite(lastSent) ||
    lastSent > nowValue + ALERT_CLAIM_MAX_FUTURE_SKEW_MS
  ) {
    throw new OperationalError("alert_claim_invalid_last_sent_at");
  }
  const cadenceCutoff = nowValue - cadenceWindow * 86_400_000;
  const cutoff = Math.max(cadenceCutoff, lastSent);
  // Every source must opt in independently to private email distribution.
  // Public listing permission, provider reachability, or an employer source
  // type never implies permission to place a job in alerts.
  const emailPermittedJobs = jobs.filter((job) => job.source.canEmail === true);
  return filterAndSortJobs(emailPermittedJobs, search, now)
    .filter((job) => Date.parse(job.postedAt) > cutoff)
    .slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAlertEmail(jobs: Job[]) {
  const origin = getRuntimeAppOrigin();
  const subject = `${jobs.length} new SalaryPadi job ${jobs.length === 1 ? "match" : "matches"}`;
  const rows = jobs.map((job) => {
    const detailUrl = new URL(
      `/jobs/${encodeURIComponent(job.id)}`,
      origin,
    ).toString();
    return {
      text: `${job.title} at ${job.company.name} - ${job.locationDisplay}\n${detailUrl}`,
      html: `<li style="margin:0 0 16px"><strong>${escapeHtml(job.title)}</strong><br>${escapeHtml(job.company.name)} - ${escapeHtml(job.locationDisplay)}<br><a href="${escapeHtml(detailUrl)}">Check eligibility and source evidence</a></li>`,
    };
  });
  const alertsUrl = new URL("/alerts", origin).toString();
  return {
    subject,
    text: `${subject}\n\n${rows.map((row) => row.text).join("\n\n")}\n\nManage alerts: ${alertsUrl}\n\nReference-only career information. Verify every role with the original source before applying.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#17211b"><h1 style="font-size:22px">${escapeHtml(subject)}</h1><p>These roles match your private SalaryPadi alert.</p><ul style="padding-left:20px">${rows.map((row) => row.html).join("")}</ul><p><a href="${escapeHtml(alertsUrl)}">Manage your alerts</a></p><p style="font-size:13px;color:#526057">Reference-only career information. Verify every role with the original source before applying.</p></div>`,
  };
}

export async function sendAlertEmail(
  deliveryId: string,
  recipient: string,
  email: ReturnType<typeof renderAlertEmail>,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getRuntimeHeaderCredential("RESEND_API_KEY");
  const from = getRuntimeMailbox("TRANSACTIONAL_EMAIL_FROM", {
    allowDisplayName: true,
  });
  const replyTo = getRuntimeMailbox("TRANSACTIONAL_EMAIL_REPLY_TO");
  const origin = getRuntimeAppOrigin();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": `salarypadi-alert-${deliveryId}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        "List-Unsubscribe": `<${new URL("/alerts", origin)}>`,
      },
    }),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: boundedSignal(signal, EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await discardResponseBody(response);
    throw new OperationalError(`email_provider_${response.status}`);
  }
  const payload = emailProviderResponseSchema.safeParse(
    await readBoundedOperationalJson(
      response,
      EMAIL_PROVIDER_MAX_RESPONSE_BYTES,
      "email_provider_shape",
    ),
  );
  if (!payload.success) throw new OperationalError("email_provider_shape");
  return payload.data.id;
}
