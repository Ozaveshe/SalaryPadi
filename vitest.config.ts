import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "node",
    pool: "threads",
    include: ["src/**/*.test.ts", "netlify/functions/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/lib/**/*.ts",
        "netlify/functions/_shared/**/*.ts",
        "netlify/functions/*.{ts,mts}",
      ],
      exclude: [
        "src/lib/**/*.d.ts",
        "src/lib/supabase/**",
        "netlify/functions/**/*.test.ts",
      ],
      thresholds: {
        statements: 83,
        branches: 71,
        functions: 87,
        lines: 86,
      },
    },
  },
});
