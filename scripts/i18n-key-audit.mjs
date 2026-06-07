#!/usr/bin/env node
/**
 * i18n KEY-EXISTENCE audit (2026-06-07).
 *
 * `audit:i18n` only checks TH/EN *parity* (both files have the same keys). It
 * does NOT check that every `t("key")` CALL in the code resolves to a defined
 * key. So a component wired to next-intl whose keys were never added to
 * messages/*.json renders the RAW KEY in the UI (e.g. the admin sidebar showed
 * "pcsAdminNav.wallet.title" instead of "กระเป๋าเงิน"). This audit closes that
 * gap: it scans every component for static `t("literal")` calls and asserts the
 * key exists under the component's translation namespace in messages/th.json.
 *
 * Scope + limits (intentionally conservative to avoid false positives):
 *  - Resolves `const t = useTranslations("ns")` / `getTranslations("ns")` →
 *    namespace per translation-fn variable (incl. no-arg = root namespace).
 *  - Only checks STATIC keys: t("a.b.c"). Dynamic/template keys (t(`x.${v}`),
 *    t(variable)) are SKIPPED — they resolve at runtime and can't be checked
 *    statically. (The sidebar's t(item.labelKey) dynamic case is covered by a
 *    dedicated check below over lib/admin/sidebar-menu.ts labelKeys.)
 *  - A key is OK if it resolves under ANY namespace the file declares (handles
 *    files with several useTranslations instances).
 *
 * Exit 1 if any static key (or any sidebar labelKey) is missing → blocks the
 * verify gate so this class of bug can't ship again.
 */
import fs from "node:fs";
import path from "node:path";

const th = JSON.parse(fs.readFileSync("messages/th.json", "utf8"));
function has(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj) !== undefined;
}
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next|\.git/.test(p)) walk(p, acc); }
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
}

const leaks = [];

// ── 1) static t("literal") calls across app/ + components/ ──────────────────
for (const f of [...walk("app", []), ...walk("components", [])]) {
  const src = fs.readFileSync(f, "utf8");
  const varNs = {};
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["'`]([^"'`]*)["'`]\s*\)/g)) varNs[m[1]] = m[2];
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*\)/g)) varNs[m[1]] = "";
  const vars = Object.keys(varNs);
  if (!vars.length) continue;
  const reVar = new RegExp("\\b(" + vars.join("|") + ")\\(\\s*[\"']([^\"'$]+)[\"']", "g");
  for (const m of src.matchAll(reVar)) {
    const key = m[2];
    if (key.includes("${")) continue; // dynamic — skip
    const ns = varNs[m[1]];
    // OK if it resolves under THIS var's ns, or any ns the file declares
    const candidates = [ns, ...Object.values(varNs)].map((n) => (n ? n + "." + key : key));
    if (!candidates.some((c) => has(th, c))) {
      leaks.push(`${f}  →  ${m[1]}("${key}")  [ns="${ns}"]`);
    }
  }
}

// ── 2) admin sidebar labelKeys (dynamic t(item.labelKey) — checked here) ─────
const sidebarSrc = fs.readFileSync("lib/admin/sidebar-menu.ts", "utf8");
const labelKeys = [...new Set([...sidebarSrc.matchAll(/labelKey:\s*"([^"]+)"/g)].map((m) => m[1]))];
for (const k of labelKeys) {
  if (!has(th, "pcsAdminNav." + k)) leaks.push(`lib/admin/sidebar-menu.ts  →  labelKey "${k}"  ⇒  pcsAdminNav.${k}`);
}

console.log("Pacred i18n key-existence audit");
if (leaks.length === 0) {
  console.log(`✓ all static t() keys + ${labelKeys.length} sidebar labelKeys resolve in messages/th.json`);
  process.exit(0);
}
console.error(`✗ ${leaks.length} i18n key(s) referenced in code but MISSING from messages/th.json (would leak the raw key in the UI):`);
for (const l of leaks) console.error("  " + l);
process.exit(1);
