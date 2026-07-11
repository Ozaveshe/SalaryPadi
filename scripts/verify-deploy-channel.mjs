import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const channel = JSON.parse(
  readFileSync(resolve(root, "deploy/channel.json"), "utf8"),
);
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeRepository(rawUrl) {
  return rawUrl
    ?.trim()
    .replace(/^git@github\.com:/u, "https://github.com/")
    .replace(/\.git$/u, "")
    .replace(/\/$/u, "");
}

function localEnvValue(name) {
  for (const filename of [".env.production.local", ".env.local", ".env"]) {
    try {
      const contents = readFileSync(resolve(root, filename), "utf8");
      const line = contents
        .split(/\r?\n/u)
        .find((entry) => entry.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

function localSiteId() {
  try {
    return JSON.parse(
      readFileSync(resolve(root, ".netlify/state.json"), "utf8"),
    ).siteId;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

const context = process.env.CONTEXT ?? "local";
const production =
  context === "production" || process.argv.includes("--production");
const siteId =
  process.env.SITE_ID ?? process.env.NETLIFY_SITE_ID ?? localSiteId();
const productionUrl =
  process.env.URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  localEnvValue("NEXT_PUBLIC_APP_URL");
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  localEnvValue("NEXT_PUBLIC_SUPABASE_URL");
const branch = process.env.BRANCH ?? git("branch", "--show-current");
const repository = normalizeRepository(
  process.env.REPOSITORY_URL ?? git("remote", "get-url", "origin"),
);

const failures = [];
function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(
      `${label} mismatch: expected ${expected}, received ${actual ?? "missing"}`,
    );
  }
}

assertEqual("product package", packageJson.name, channel.packageName);
assertEqual("Netlify site", siteId, channel.netlifySiteId);
if (production || context !== "local") {
  assertEqual("production URL", productionUrl, channel.productionUrl);
}
assertEqual("Supabase project", supabaseUrl, channel.supabaseUrl);
assertEqual(
  "Git repository",
  repository,
  normalizeRepository(channel.gitRepository),
);
if (production) assertEqual("production branch", branch, channel.releaseBranch);

if (failures.length > 0) {
  console.error(
    `SalaryPadi deploy channel verification failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}

console.log(
  [
    `Deploy channel verified: ${channel.product}`,
    `site=${channel.netlifySiteId}`,
    `domain=${channel.productionUrl}`,
    `supabase=${channel.supabaseProjectRef}`,
    `branch=${branch}`,
    `context=${context}`,
  ].join(" "),
);
