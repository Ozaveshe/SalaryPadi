import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.versions.node.split(".")[0] !== "22") {
  console.error(
    "Verify native worker dependencies with SalaryPadi's Node 22 runtime.",
  );
  process.exit(1);
}

const probe = spawnSync(
  process.execPath,
  [
    "--no-experimental-require-module",
    "--input-type=commonjs",
    "--eval",
    `const assert = require('node:assert/strict');
const sanitizeHtml = require('./src/lib/jobs/generated/sanitize-html.cjs');
assert.equal(sanitizeHtml('<p>Safe text</p><script>alert(1)</script>'), '<p>Safe text</p>');
assert.equal(sanitizeHtml('<p onclick="alert(1)">Safe text</p>'), '<p>Safe text</p>');`,
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
  console.log(
    `Native worker dependencies load under Node ${process.versions.node} with require(ESM) disabled.`,
  );
}
