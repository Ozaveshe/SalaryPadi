import { noStoreJson } from "@/lib/http/json";

export const dynamic = "force-dynamic";

/**
 * Minimal build identity for acceptance tooling.
 *
 * Production acceptance has to prove it tested the commit it thinks it tested.
 * This returns only non-sensitive build metadata that Netlify injects at build
 * time — never environment configuration, credentials or provider state.
 *
 * Netlify build variables used (inlined at build time by next.config.ts):
 * - COMMIT_REF  : full commit SHA of the deployed build
 * - CONTEXT     : "production" | "deploy-preview" | "branch-deploy" | "dev"
 * - BRANCH      : source branch
 * - BUILD_ID    : Netlify build identifier (used as a build timestamp proxy)
 *
 * Every field degrades to null rather than guessing, so a local run reports
 * "unknown" instead of pretending to be a deployment.
 */

/** Only ever the short SHA — never a token or URL. */
function shortSha(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{7,40}$/i.test(trimmed)
    ? trimmed.slice(0, 7).toLowerCase()
    : null;
}

function safeToken(value: string | undefined, max = 64): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._/-]{1,64}$/.test(trimmed) ? trimmed.slice(0, max) : null;
}

export async function GET() {
  // Read the build-time inlined values (see next.config.ts). Netlify's own
  // COMMIT_REF/CONTEXT are build variables and are absent from the function
  // runtime, so reading them directly here would always report null.
  return noStoreJson({
    commit: shortSha(process.env.SALARYPADI_BUILD_COMMIT),
    context: safeToken(process.env.SALARYPADI_BUILD_CONTEXT) ?? "unknown",
    branch: safeToken(process.env.SALARYPADI_BUILD_BRANCH),
    buildId: safeToken(process.env.SALARYPADI_BUILD_ID),
    // Set at module evaluation on the server instance; useful for spotting a
    // stale warm instance during acceptance polling.
    startedAt: new Date().toISOString(),
  });
}
