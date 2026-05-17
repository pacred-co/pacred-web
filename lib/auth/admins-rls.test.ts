/**
 * S-7 — guard test: the `admins` table must never gain a write-permitting
 * RLS policy.
 *
 * Per [docs/research/gap-schema-security.md] S-7: migration `0015` enables
 * RLS on `public.admins` and adds ONLY a SELECT policy (`admins_select`).
 * INSERT/UPDATE/DELETE deliberately go through the service-role admin
 * client (`adminGrantRole`, `withAdmin(["super"])`-gated). The ONLY thing
 * preventing a normal user from self-granting the `super` role straight
 * through PostgREST is that no permissive write policy exists — RLS
 * default-deny. That is correct, but it is a *silent* invariant: one
 * future migration adding a `for all` / `for insert|update|delete` policy
 * on `admins` quietly opens privilege escalation with no error anywhere.
 *
 * This test makes the invariant loud. It statically scans every migration
 * SQL file and fails if any `create policy` on `public.admins` is anything
 * other than `for select`. No DB — runs in the env-independent `test:unit`
 * chain.
 *
 * Run:  pnpm tsx lib/auth/admins-rls.test.ts   (or `pnpm test:unit`)
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "supabase",
  "migrations",
);

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    fail++;
  }
}

console.log("=== S-7 · admins-table RLS guard ===");

/**
 * Strip SQL comments, then collapse whitespace — so a multi-line
 * `create policy` statement becomes one scannable string, and a comment
 * that merely *mentions* a policy cannot false-match.
 */
function normalize(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\s+/g, " ");
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const offending: string[] = [];
let adminsSelectPolicies = 0;
let rlsEnabled = false;

for (const file of files) {
  const sql = normalize(readFileSync(join(migrationsDir, file), "utf8"));

  if (
    /\balter\s+table\s+(?:public\.)?admins\s+enable\s+row\s+level\s+security\b/i.test(
      sql,
    )
  ) {
    rlsEnabled = true;
  }

  // Every `create policy … ;` statement (a policy expression never
  // contains a `;`, so `[^;]*` safely bounds one statement).
  for (const m of sql.matchAll(/create\s+policy\b[^;]*;/gi)) {
    const stmt = m[0];
    // Target table must be exactly `admins` — not `admin_audit_log` etc.,
    // and not an `admins` mentioned inside a USING (… from admins …) clause
    // (that follows `from`, never `on`).
    if (!/\bon\s+(?:public\.)?admins\b/i.test(stmt)) continue;
    // Explicit `for <action>`; Postgres defaults a missing `for` to ALL.
    const forMatch = stmt.match(/\bfor\s+(all|select|insert|update|delete)\b/i);
    const action = forMatch ? forMatch[1].toLowerCase() : "all";
    if (action === "select") {
      adminsSelectPolicies++;
    } else {
      offending.push(`${file}: '${action.toUpperCase()}' policy → ${stmt.slice(0, 100)}…`);
    }
  }
}

check(`scanned ${files.length} migration files`, files.length > 0);
check("RLS is enabled on public.admins", rlsEnabled);
check(
  "public.admins has its baseline SELECT policy (0015 admins_select)",
  adminsSelectPolicies >= 1,
);
check(
  "no migration grants a write policy (FOR ALL/INSERT/UPDATE/DELETE) on public.admins",
  offending.length === 0,
  offending.join("\n      "),
);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
