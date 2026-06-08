#!/usr/bin/env node
/**
 * Probe live RLS policies via service-role REST (no DDL — read-only).
 *
 * Authoritative current state for the tables in scope of migration 0148
 * (tax_invoices · tax_invoice_lines · tax_invoice_seq · freight_invoices ·
 * freight_invoice_lines · freight_invoice_seq · freight_invoice_payments).
 *
 * Uses a small RPC trick: PostgREST does NOT expose pg_policies directly,
 * but it DOES allow `select` against a custom view or a security-definer
 * function we can call. Easier path used here: execute a SQL query via the
 * service-role + `pg-meta` extension is not enabled on managed Supabase, so
 * we fall back to spawning psql against the direct host with the password
 * from env. If PG password is not set, we print a manual SQL snippet the
 * owner can paste into the Supabase SQL editor.
 *
 * Usage:
 *   node --env-file=.env.local scripts/probe-rls-policies.mjs
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const admin = createClient(URL, SVC, { auth: { persistSession: false } });

// Try a generic RPC that lists policies. If `get_table_policies` exists in
// your schema, use that. Otherwise fall back to printing the SQL.
const tables = [
  "tax_invoices",
  "tax_invoice_lines",
  "tax_invoice_seq",
  "freight_invoices",
  "freight_invoice_lines",
  "freight_invoice_seq",
  "freight_invoice_payments",
];

console.log("\n=== Probing RLS policies (read-only) ===\n");

// Probe via the postgres-meta API path that Supabase exposes for the
// dashboard. The service-role JWT has access; the URL pattern is:
//   POST {URL}/pg/policies  (Supabase Studio uses this)
// — but it's undocumented + may change. Safer = print SQL.

console.log("Paste into Supabase Dashboard → SQL Editor (read-only):\n");
console.log("```sql");
console.log(`select schemaname, tablename, policyname, cmd,
       pg_get_expr(qual,   pg_class.oid) as using_expr,
       pg_get_expr(with_check, pg_class.oid) as check_expr
  from pg_policies
  join pg_class on pg_class.relname = pg_policies.tablename
 where schemaname = 'public'
   and tablename = any(array['${tables.join("','")}'])
 order by tablename, policyname;`);
console.log("```\n");

// Try one quick sanity ping — confirm the tables exist + service-role can hit them
for (const t of tables) {
  try {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`  ${t.padEnd(28)} — ERROR ${error.code}: ${error.message}`);
    } else {
      console.log(`  ${t.padEnd(28)} — ${count ?? "?"} rows · table exists`);
    }
  } catch (e) {
    console.log(`  ${t.padEnd(28)} — exception: ${e.message}`);
  }
}

console.log("\nDone.\n");
