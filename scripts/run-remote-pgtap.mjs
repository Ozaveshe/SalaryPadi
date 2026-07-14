import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.STAGING_DB_URL?.trim();
if (!databaseUrl) {
  throw new Error("STAGING_DB_URL is required");
}
const parsedDatabaseUrl = new URL(databaseUrl);
const allowPreviewPoolerCertificate =
  process.env.ALLOW_PREVIEW_POOLER_CERTIFICATE === "true";
if (
  allowPreviewPoolerCertificate &&
  (!parsedDatabaseUrl.hostname.endsWith(".pooler.supabase.com") ||
    !parsedDatabaseUrl.username.startsWith("postgres."))
) {
  throw new Error(
    "The preview pooler certificate override is restricted to a Supabase pooler URL",
  );
}

const testDirectory = resolve(
  process.cwd(),
  process.argv[2] ?? "supabase/tests/database",
);
const files = (await readdir(testDirectory))
  .filter((name) => name.endsWith(".sql"))
  .toSorted((left, right) => left.localeCompare(right, "en"));

if (files.length === 0) {
  throw new Error(`No SQL tests found in ${testDirectory}`);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: !allowPreviewPoolerCertificate },
  connectionTimeoutMillis: 15_000,
  query_timeout: 120_000,
  statement_timeout: 120_000,
  application_name: "salarypadi-remote-pgtap",
});

function tapLines(result) {
  const results = Array.isArray(result) ? result : [result];
  return results.flatMap((entry) =>
    (entry.rows ?? []).flatMap((row) =>
      Object.values(row).filter(
        (value) =>
          typeof value === "string" &&
          /^(?:ok|not ok|1\.\.)\b/u.test(value.trim()),
      ),
    ),
  );
}

await client.connect();
let failed = 0;
let assertions = 0;

try {
  for (const file of files) {
    const sql = await readFile(resolve(testDirectory, file), "utf8");
    try {
      const result = await client.query(sql);
      const lines = tapLines(result);
      const notOk = lines.filter((line) => line.trim().startsWith("not ok"));
      assertions += lines.filter((line) =>
        /^(?:ok|not ok)\b/u.test(line),
      ).length;
      if (notOk.length > 0) {
        failed += 1;
        process.stderr.write(`${file}: FAILED\n${notOk.join("\n")}\n`);
      } else {
        process.stdout.write(`${file}: passed\n`);
      }
    } catch (error) {
      failed += 1;
      await client.query("rollback").catch(() => undefined);
      process.stderr.write(
        `${file}: ERROR ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
} finally {
  await client.end();
}

process.stdout.write(
  `pgTAP files=${files.length} assertions=${assertions} failed_files=${failed}\n`,
);
if (failed > 0) process.exitCode = 1;
