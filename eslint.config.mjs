import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
