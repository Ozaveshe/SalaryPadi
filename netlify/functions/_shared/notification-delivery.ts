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

const emailProviderResponseSchema = z
  .object({ id: z.string().uuid() })
  .passthrough();

export const notificationClaimSchema = z
  .object({
    notification_id: z.string().uuid(),
    claim_token: z.string().uuid(),
    recipient_email: z.string().email().max(320),
    kind: z.string().min(1).max(60),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1_000),
    // The claim only ever carries a site-relative path; the database constrains
    // it too, so an email can never become a way off-site.
    href: z.string().regex(/^\/[A-Za-z0-9/_.~%-]*(\?[A-Za-z0-9=&_.~%-]*)?$/),
  })
  .strict();

export type NotificationClaim = z.infer<typeof notificationClaimSchema>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The email restates the notification and links to the page that holds the
 * record it came from. It deliberately carries no information the app does not
 * already show: an email that said more than the record would be a second,
 * unverifiable source of truth.
 */
export function renderNotificationEmail(claim: NotificationClaim) {
  const origin = getRuntimeAppOrigin();
  const target = new URL(claim.href, origin).toString();
  const settingsUrl = new URL("/notifications", origin).toString();
  return {
    subject: claim.title,
    text: `${claim.title}\n\n${claim.body}\n\nOpen it: ${target}\n\nChange which of these are emailed: ${settingsUrl}\n\nReference-only career information. Verify every role with the original source before applying.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#17211b"><h1 style="font-size:20px">${escapeHtml(claim.title)}</h1><p>${escapeHtml(claim.body)}</p><p><a href="${escapeHtml(target)}">Open it in SalaryPadi</a></p><p style="font-size:13px;color:#526057"><a href="${escapeHtml(settingsUrl)}">Change which of these are emailed</a>. Reference-only career information. Verify every role with the original source before applying.</p></div>`,
  };
}

export async function sendNotificationEmail(
  claim: NotificationClaim,
  email: ReturnType<typeof renderNotificationEmail>,
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
      // Keyed on the notification, so a retried claim cannot send twice.
      "Idempotency-Key": `salarypadi-notification-${claim.notification_id}`,
    },
    body: JSON.stringify({
      from,
      to: [claim.recipient_email],
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        "List-Unsubscribe": `<${new URL("/notifications", origin)}>`,
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
