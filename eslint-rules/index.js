/**
 * Pacred-local ESLint plugin — Wave 19 Sprint A2
 *
 * Currently exports one rule:
 *   no-bare-supabase-data-destructure  (AGENTS.md §0c enforcement)
 *
 * Wired into `eslint.config.mjs` via:
 *   plugins: { pacred: pacredRules }
 *   rules:   { "pacred/no-bare-supabase-data-destructure": "error" }
 */
"use strict";

module.exports = {
  rules: {
    "no-bare-supabase-data-destructure": require("./no-bare-supabase-data-destructure"),
  },
};
