import { createHash } from "node:crypto";

import type { EmploymentArrangement } from "./types";

export const JOB_FINGERPRINT_VERSION = 2;

export interface JobFingerprintInput {
  title: string;
  company: string;
  location: string;
  arrangement: EmploymentArrangement;
  destination: string;
}

const providerJobHosts = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "jobs.ashbyhq.com",
]);

function canonicalText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function legacyCanonicalText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isTrackingParameter(name: string) {
  const normalized = name.toLowerCase();
  return (
    normalized.startsWith("utm_") ||
    normalized === "gclid" ||
    normalized === "fbclid" ||
    normalized === "ref" ||
    normalized === "source"
  );
}

/**
 * Keeps destination identity while removing transport and campaign noise. ATS
 * posting IDs remain in the provider path; only their known apply-page suffix
 * is folded into the canonical job page.
 */
export function canonicalizeJobDestination(value: string) {
  const destination = new URL(value);
  destination.hash = "";
  destination.hostname = destination.hostname.toLowerCase();
  if (
    (destination.protocol === "https:" && destination.port === "443") ||
    (destination.protocol === "http:" && destination.port === "80")
  ) {
    destination.port = "";
  }

  if (providerJobHosts.has(destination.hostname)) {
    destination.pathname = destination.pathname.replace(
      /\/(?:apply|application)\/?$/i,
      "",
    );
  }

  for (const name of [...destination.searchParams.keys()]) {
    if (isTrackingParameter(name)) destination.searchParams.delete(name);
  }
  destination.searchParams.sort();
  return destination.toString();
}

function hashFingerprint(parts: readonly unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** The exact pre-v2 algorithm, retained only for transition lookups. */
export function buildLegacyJobFingerprint(input: JobFingerprintInput) {
  const destination = new URL(input.destination);
  destination.hash = "";
  destination.hostname = destination.hostname.toLowerCase();
  return hashFingerprint([
    legacyCanonicalText(input.title),
    legacyCanonicalText(input.company),
    legacyCanonicalText(input.location),
    input.arrangement,
    destination.toString(),
  ]);
}

export function buildJobFingerprint(input: JobFingerprintInput) {
  return hashFingerprint([
    "salarypadi-job-fingerprint",
    JOB_FINGERPRINT_VERSION,
    canonicalText(input.title),
    canonicalText(input.company),
    canonicalText(input.location),
    input.arrangement,
    canonicalizeJobDestination(input.destination),
  ]);
}

export function buildJobFingerprintLookupKeys(input: JobFingerprintInput) {
  return [buildJobFingerprint(input), buildLegacyJobFingerprint(input)].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
}
