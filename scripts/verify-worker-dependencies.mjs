import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Lambda disables require(ESM), unlike ordinary Node 22 and the Next.js build.
// https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html
const runtimeOptions = (process.env.NODE_OPTIONS ?? "").split(/\s+/);
if (
  !runtimeOptions.includes("--experimental-require-module") ||
  runtimeOptions.includes("--no-experimental-require-module")
) {
  console.error(
    "Native workers require NODE_OPTIONS=--experimental-require-module in both build and function scopes.",
  );
  process.exit(1);
}

const probe = spawnSync(
  process.execPath,
  [
    "--experimental-require-module",
    "--input-type=commonjs",
    "--eval",
    `const assert = require('node:assert/strict');
const sanitizeHtml = require('sanitize-html');
assert.equal(sanitizeHtml('<p>Safe text</p><script>alert(1)</script>'), '<p>Safe text</p>');`,
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    timeout: 10_000,
  },
);

if (probe.error || probe.status !== 0) {
  console.error("Native worker dependency startup failed.");
  console.error(probe.error?.message ?? probe.stderr.trim());
  process.exitCode = 1;
} else {
  console.log("Native worker dependencies load under Lambda's module policy.");
}
