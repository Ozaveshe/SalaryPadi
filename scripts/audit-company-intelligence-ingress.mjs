import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactPath = join(root, "reports", "company-intelligence-audit.json");
const runtimeRoots = ["src", "public", "scripts", "supabase/migrations"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".sql"]);
const externalReviewSource =
  /glassdoor|indeed|jobberman|myjobmag|brightermonday|linkedin|reddit/i;
// `pros`, `cons` and `salary` are anchored to word boundaries because as bare
// substrings they matched ordinary code: `cons` fires inside every `const`, and
// `salary` inside the product's own name. That made any file mentioning a
// platform alongside a variable declaration fail the audit. The broad tokens
// are left unanchored so `reviewed`, `ratings` and the like still match.
const opinionMaterial =
  /review|rating|\bsalar(?:y|ies)\b|interview|community post|\bpros\b|\bcons\b|advice.to.management/i;

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    if (!extensions.has(extname(entry.name))) return [];
    if (/\.(?:test|spec)\.[^.]+$/i.test(entry.name)) return [];
    if (path === resolve(import.meta.filename)) return [];
    return [path];
  });
}

// A platform name inside a bare origin — scheme, host, optional port, nothing
// that names a resource — declares a network destination, not ingested content.
// CSP allowlists and OAuth redirect origins are written that way, and
// `src/proxy.ts` keeps the sign-in origins a few lines above the protected
// `/contribute/review` route prefixes, so the proximity window below used to
// read an auth host as review ingress. The exemption stops at the origin: a URL
// naming a path or query still counts, because opinion material has to be
// fetched from a resource before it can be stored, and a platform name written
// anywhere outside an origin literal is never exempt.
const networkOriginLiteral = /(["'`])https?:\/\/[a-z0-9.*-]+(?::\d+)?\/?\1/gi;

function networkOriginRanges(text) {
  return [...text.matchAll(networkOriginLiteral)].map((match) => [
    match.index ?? 0,
    (match.index ?? 0) + match[0].length,
  ]);
}

function hasProhibitedExternalOpinion(text) {
  const originRanges = networkOriginRanges(text);
  for (const match of text.matchAll(
    /glassdoor|indeed|jobberman|myjobmag|brightermonday|linkedin|reddit/gi,
  )) {
    const index = match.index ?? 0;
    if (originRanges.some(([from, to]) => index >= from && index < to))
      continue;
    const start = Math.max(0, index - 250);
    const end = Math.min(text.length, index + 250);
    if (opinionMaterial.test(text.slice(start, end))) return true;
  }
  return false;
}

const files = runtimeRoots.flatMap((path) => filesUnder(join(root, path)));
const companyOpinionDatabaseTarget =
  /(?:review_publications|interview_publications|salary_submissions|benefit_submissions|pay_reliability_submissions|private\.contributions|community_benefits)/i;
const seedOrIndexPath = /(?:seed|fixture|sitemap|search|index)/i;
const reviewedNonOpinionReferences = new Set([
  "scripts/generate-brand-assets.mjs",
  "src/lib/jobs/source-policy.ts",
  "supabase/migrations/20260714030605_job_supply_system.sql",
]);

const applicationIngressFiles = files
  .filter((path) => {
    const repositoryPath = relative(root, path).replaceAll("\\", "/");
    if (reviewedNonOpinionReferences.has(repositoryPath)) return false;
    const text = readFileSync(path, "utf8");
    return (
      externalReviewSource.test(text) && hasProhibitedExternalOpinion(text)
    );
  })
  .map((path) => relative(root, path).replaceAll("\\", "/"));

const databaseIngressFiles = files
  .filter((path) => path.endsWith(".sql"))
  .filter((path) => {
    const text = readFileSync(path, "utf8");
    return (
      externalReviewSource.test(text) &&
      companyOpinionDatabaseTarget.test(text) &&
      hasProhibitedExternalOpinion(text)
    );
  })
  .map((path) => relative(root, path).replaceAll("\\", "/"));

const seedOrIndexIngressFiles = files
  .filter((path) => seedOrIndexPath.test(relative(root, path)))
  .filter((path) => {
    const text = readFileSync(path, "utf8");
    return (
      externalReviewSource.test(text) && hasProhibitedExternalOpinion(text)
    );
  })
  .map((path) => relative(root, path).replaceAll("\\", "/"));

const promptIngressFiles = files
  .filter((path) => /prompt/i.test(path))
  .filter((path) => hasProhibitedExternalOpinion(readFileSync(path, "utf8")))
  .map((path) => relative(root, path).replaceAll("\\", "/"));

if (!existsSync(artifactPath))
  throw new Error("Company intelligence audit artifact is missing.");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const failures = [];
if (artifact?.schema_version !== 1)
  failures.push("unsupported artifact schema");
if (artifact?.production?.raw_contributions !== 0)
  failures.push(
    "artifact does not preserve the audited zero-contribution baseline",
  );
if (artifact?.production?.public_review_publications !== 0)
  failures.push("artifact does not preserve the audited zero-review baseline");
if (applicationIngressFiles.length > 0)
  failures.push(
    `external opinion source names found in company intelligence scope: ${applicationIngressFiles.join(", ")}`,
  );
if (databaseIngressFiles.length > 0)
  failures.push(
    `external opinion material found in database scope: ${databaseIngressFiles.join(", ")}`,
  );
if (seedOrIndexIngressFiles.length > 0)
  failures.push(
    `external opinion material found in seed or index scope: ${seedOrIndexIngressFiles.join(", ")}`,
  );
if (promptIngressFiles.length > 0)
  failures.push(
    `external opinion material found in prompt scope: ${promptIngressFiles.join(", ")}`,
  );

const summary = {
  checked_files: files.length,
  external_opinion_application_matches: applicationIngressFiles.length,
  external_opinion_database_matches: databaseIngressFiles.length,
  external_opinion_seed_or_index_matches: seedOrIndexIngressFiles.length,
  external_opinion_prompt_matches: promptIngressFiles.length,
  artifact: relative(root, artifactPath).replaceAll("\\", "/"),
  status: failures.length === 0 ? "pass" : "fail",
};
console.log(JSON.stringify(summary));
if (process.argv.includes("--check") && failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
