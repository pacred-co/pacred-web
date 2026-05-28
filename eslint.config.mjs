import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Pacred-local rules (Wave 19 Sprint A2 — §0c destructure enforcement)
import pacredRules from "./eslint-rules/index.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code session worktrees — separate git checkouts, not source
    ".claude/worktrees/**",
    // Static assets — never source. Includes the staged legacy PCS vendor
    // bundles (jQuery / Bootstrap-4 / DataTables) under public/legacy/pcs/vendor/.
    "public/**",
  ]),
  // Pacred-local rules — apply to source dirs only (NOT scripts/ — those
  // one-off scripts intentionally crash-loud on db error).
  {
    files: ["actions/**/*.{ts,tsx}", "app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/__tests__/**",
      "lib/supabase/**",
    ],
    plugins: { pacred: pacredRules },
    rules: {
      "pacred/no-bare-supabase-data-destructure": "error",
    },
  },
  // Pacred-local ESLint plugin source — MUST be CommonJS (ESLint rule loader
  // is CommonJS at runtime). Exempt from the no-require-imports rule.
  {
    files: ["eslint-rules/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
