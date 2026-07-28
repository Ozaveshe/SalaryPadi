import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next, widened with `**/` so nested
    // copies are ignored too. The root-anchored patterns miss build output
    // that lives inside local git worktrees (`.claude/worktrees/*/.next/**`),
    // which otherwise floods a local `npm run lint` with artifact errors.
    "**/.next/**",
    "**/.netlify/**",
    "**/coverage/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Transient cache directories Next.js leaves behind mid-build; they can
    // disappear while ESLint is walking them and crash the run with ENOENT.
    "**/.next-cache*/**",
    // Local git worktrees are separate checkouts with their own lint runs.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
