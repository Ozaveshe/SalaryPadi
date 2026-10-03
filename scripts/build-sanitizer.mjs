import { fileURLToPath } from "node:url";

import { build } from "esbuild";

// Bundle the patched sanitizer's ESM dependencies into its CommonJS artifact.
// Native Netlify workers use Lambda's restricted require(ESM) policy.
await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: ["sanitize-html"],
  outfile: "src/lib/jobs/generated/sanitize-html.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "warning",
});

console.log("Built the patched sanitizer for the native worker runtime.");
