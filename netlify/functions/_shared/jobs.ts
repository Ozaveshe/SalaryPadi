import { getStore } from "@netlify/blobs";

import { mapDatabaseJobRow } from "../../../src/lib/jobs/database";
import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import { remotiveResponseSchema } from "../../../src/lib/jobs/remotive-schema";
import {
  filterAndSortJobs,
  parseJobSearch,
} from "../../../src/lib/jobs/search";
import type { Job } from "../../../src/lib/jobs/types";

import { getRuntimeEnvironment, OperationalError } from "./runtime";

const REMOTIVE_ENDPOINT = "https://remotive.com/api/remote-jobs";
const ALERT_CATALOG_STORE = "salarypadi-job-catalog";
const ALERT_CATALOG_KEY = "current";
const ALERT_CATALOG_MAX_AGE_MS = 14 * 60 * 60 * 1000;

type AlertCatalog = {
  schemaVersion: 1;
  checkedAt: string;
  jobs: Job[];
};

export type AlertClaim = {
  delivery_id: string;
  claim_token: string;
  alert_id: string;
  recipient_email: string;
  search_spec: Record<string, unknown>;
  cadence: "daily" | "weekly";
  last_sent_at: string | null;
};

export async function fetchRemotiveJobs(): Promise<Job[]> {
  const response = await fetch(REMOTIVE_ENDPOINT, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new OperationalError(`remotive_source_${response.status}`);
  const parsed = remotiveResponseSchema.parse(await response.json());
  if (parsed.jobs.length === 0)
    throw new OperationalError("remotive_source_empty");
  const checkedAt = new Date().toISOString();
  return parsed.jobs.map((job) => normalizeRemotiveJob(job, checkedAt));
}

function alertCatalogStore() {
  const netlify = (
    globalThis as typeof globalThis & {
      Netlify?: { context?: { deploy?: { context?: string } } };
    }
  ).Netlify;
  if (netlify?.context?.deploy?.context !== "production") {
    throw new OperationalError("alert_catalog_production_only");
  }
  return getStore({ name: ALERT_CATALOG_STORE, consistency: "strong" });
}

export function createAlertCatalog(
  jobs: Job[],
  checkedAt = new Date().toISOString(),
): AlertCatalog {
  return {
    schemaVersion: 1,
    checkedAt,
    jobs: jobs.map((job) => ({
      ...job,
      description: "",
      requirements: null,
      benefits: null,
      riskIndicators: [],
    })),
  };
}

export function parseAlertCatalog(value: unknown, now = new Date()): Job[] {
  if (!value || typeof value !== "object") {
    throw new OperationalError("alert_catalog_missing");
  }
  const candidate = value as Partial<AlertCatalog>;
  const checkedAt =
    typeof candidate.checkedAt === "string"
      ? Date.parse(candidate.checkedAt)
      : Number.NaN;
  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.jobs) ||
    Number.isNaN(checkedAt)
  ) {
    throw new OperationalError("alert_catalog_shape");
  }
  if (now.valueOf() - checkedAt > ALERT_CATALOG_MAX_AGE_MS) {
    throw new OperationalError("alert_catalog_stale");
  }
  return candidate.jobs;
}

export async function storeAlertJobCatalog(jobs: Job[]): Promise<number> {
  const catalog = createAlertCatalog(jobs);
  await alertCatalogStore().setJSON(ALERT_CATALOG_KEY, catalog);
  return catalog.jobs.length;
}

async function fetchDatabaseJobs(): Promise<Job[]> {
  const url = getRuntimeEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRuntimeEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${url}/rest/v1/jobs?select=*&order=posted_at.desc&limit=500`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "api",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new OperationalError(`database_jobs_${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload))
    throw new OperationalError("database_jobs_shape");
  return payload
    .map((row) => mapDatabaseJobRow(row))
    .filter((job): job is Job => job !== null);
}

export async function fetchAlertJobCatalog(): Promise<Job[]> {
  const [stored, database] = await Promise.all([
    alertCatalogStore().get(ALERT_CATALOG_KEY, { type: "json" }),
    fetchDatabaseJobs(),
  ]);
  const remotive = parseAlertCatalog(stored);
  const byFingerprint = new Map<string, Job>();
  for (const job of [...database, ...remotive]) {
    if (!byFingerprint.has(job.fingerprint))
      byFingerprint.set(job.fingerprint, job);
  }
  return [...byFingerprint.values()];
}

export function matchAlertJobs(
  claim: AlertClaim,
  jobs: Job[],
  now = new Date(),
): Job[] {
  const search = parseJobSearch(claim.search_spec);
  const cadenceWindow = claim.cadence === "weekly" ? 7 : 1;
  const cadenceCutoff = now.valueOf() - cadenceWindow * 86_400_000;
  const lastSent = claim.last_sent_at ? Date.parse(claim.last_sent_at) : 0;
  const cutoff = Math.max(cadenceCutoff, Number.isNaN(lastSent) ? 0 : lastSent);
  return filterAndSortJobs(jobs, search)
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
  const origin = getRuntimeEnvironment("NEXT_PUBLIC_APP_URL");
  const subject = `${jobs.length} new SalaryPadi job ${jobs.length === 1 ? "match" : "matches"}`;
  const rows = jobs.map((job) => {
    const detailUrl = new URL(`/jobs/${job.slug}`, origin).toString();
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
): Promise<string> {
  const apiKey = getRuntimeEnvironment("RESEND_API_KEY");
  const from = getRuntimeEnvironment("TRANSACTIONAL_EMAIL_FROM");
  const replyTo = getRuntimeEnvironment("TRANSACTIONAL_EMAIL_REPLY_TO");
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
        "List-Unsubscribe": `<${new URL("/alerts", getRuntimeEnvironment("NEXT_PUBLIC_APP_URL"))}>`,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new OperationalError(`email_provider_${response.status}`);
  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string")
    throw new OperationalError("email_provider_shape");
  return payload.id;
}
