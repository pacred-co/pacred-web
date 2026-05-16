// Audits env var declarations vs usage.
// 1. Reads keys from `.env.example` (DECLARED)
// 2. Greps `process.env.KEY` across actions/, lib/, app/, components/, proxy.ts, next.config.ts (USED)
// 3. Reports:
//    - Declared but unused (likely stale config)
//    - Used but undeclared (missing from .env.example template)
//
// Usage: node scripts/env-audit.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SCAN_DIRS = ["actions", "lib", "app", "components", "i18n", "scripts"];
const SCAN_FILES = ["proxy.ts", "next.config.ts", "instrumentation.ts", "instrumentation-client.ts", "sentry.client.config.ts", "sentry.server.config.ts", "sentry.edge.config.ts"];

// 1. Parse .env.example — accept both `KEY=value` (required) and `# KEY=`
// (optional / documented future use). Both shapes count as "declared" since
// the example file mentions them; audits failing-closed on either would
// punish maintainers for keeping forward-looking docs.
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const declared = new Set();
for (const line of envExample.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  // Strip a leading `#` (commented-out var) and re-trim.
  const body = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  const m = body.match(/^([A-Z_][A-Z0-9_]*)=/);
  if (m) declared.add(m[1]);
}

// 2. Walk source + grep process.env.X
const used = new Set();
const re = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude"]);

function shouldScan(name) {
  return /\.(ts|tsx|mjs|cjs|js)$/.test(name) && !name.endsWith(".d.ts");
}

function scanFile(p) {
  // Strip JS/TS line comments + block comments before regex so prose mentions
  // of `process.env.X` inside `//` or `/* */` don't count as real usage.
  // Cheap heuristic (doesn't handle strings containing `//` perfectly, but
  // good enough for this audit and false positives are visible in output).
  let src = fs.readFileSync(p, "utf8");
  src = src.replace(/\/\*[\s\S]*?\*\//g, ""); // block comments
  src = src.replace(/^\s*\/\/.*$/gm, "");     // full-line comments
  src = src.replace(/([^:"'`])\/\/.*$/gm, "$1"); // trailing comments (avoid stripping URL `https://`)
  let m;
  while ((m = re.exec(src))) used.add(m[1]);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (shouldScan(e.name)) scanFile(p);
  }
}

for (const d of SCAN_DIRS) walk(path.join(root, d));
for (const f of SCAN_FILES) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) scanFile(p);
}

// 3. Known framework vars we don't need to declare
const FRAMEWORK_WHITELIST = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "NEXT_PUBLIC_VERCEL_URL",
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "ANALYZE",
  "CI", // set by GitHub Actions / Vercel build → standard
]);

const declaredUnused = [...declared].filter((k) => !used.has(k)).sort();
const usedUndeclared = [...used]
  .filter((k) => !declared.has(k) && !FRAMEWORK_WHITELIST.has(k))
  .sort();

console.log(`Declared in .env.example : ${declared.size}`);
console.log(`Used in code             : ${used.size}`);
console.log("");

if (declaredUnused.length) {
  console.log(`⚠ Declared but UNUSED (${declaredUnused.length}):`);
  for (const k of declaredUnused) console.log(`  ${k}`);
} else {
  console.log("All declared vars are used ✓");
}
console.log("");

if (usedUndeclared.length) {
  console.log(`⚠ Used but NOT in .env.example (${usedUndeclared.length}):`);
  for (const k of usedUndeclared) console.log(`  ${k}`);
  process.exit(1);
} else {
  console.log("All used vars are declared ✓");
  process.exit(0);
}
