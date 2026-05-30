/**
 * P1-15 gate — pickLeastLoadedSalesRep (extracted from approveCustomer so the
 * register path can assign a rep at signup).
 *
 * READ-ONLY against prod: enumerates the real sales-rep pool + asserts the
 * pick is a VALID active candidate (or null when no rep is available). No
 * mutation, no sentinel rows — the function only SELECTs.
 *
 *     pnpm tsx --tsconfig tsconfig.test.json --env-file=.env.local lib/admin/assign-sales-rep.test.ts
 *
 * Needs --tsconfig tsconfig.test.json (the helper imports `server-only`, which
 * the test tsconfig maps to a stub — same as register-seed.test.ts).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — polyfill before createClient (no-op on ≥22).
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

import { pickLeastLoadedSalesRep } from "./assign-sales-rep";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("⏭  SKIP assign-sales-rep.test — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset");
    return;
  }
  const admin: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("=== P1-15 — pickLeastLoadedSalesRep (read-only against prod) ===\n");

  // The active candidate pool the helper draws from.
  const { data: roles } = await admin
    .from("admins").select("profile_id, role, is_active")
    .in("role", ["sales", "sales_admin", "super"]).eq("is_active", true);
  const profileIds = (roles ?? []).map((r) => (r as { profile_id: string }).profile_id).filter(Boolean);
  const { data: extras } = await admin
    .from("admin_contact_extras").select("legacy_admin_id, ended_at, suspended_at")
    .in("profile_id", profileIds.length ? profileIds : ["__none__"]);
  const validCandidates = new Set(
    (extras ?? [])
      .map((e) => e as { legacy_admin_id: string | null; ended_at: string | null; suspended_at: string | null })
      .filter((e) => e.legacy_admin_id && !e.ended_at && !e.suspended_at)
      .map((e) => e.legacy_admin_id as string),
  );
  console.log(`  ℹ ${validCandidates.size} active sales-rep candidate(s) in pool\n`);

  const pick = await pickLeastLoadedSalesRep(admin);

  ok(pick === null || (typeof pick === "string" && pick.length > 0),
    `returns null or a non-empty legacy_admin_id (got: ${pick === null ? "null" : `"${pick}"`})`);

  if (validCandidates.size === 0) {
    ok(pick === null, "empty pool → null (no rep available)");
  } else {
    ok(pick !== null, "non-empty pool → a rep is assigned");
    ok(pick === null || validCandidates.has(pick), "pick is one of the active candidates (not ended/suspended)");
  }

  // Determinism — same pool/load between two immediate calls → same winner.
  const pick2 = await pickLeastLoadedSalesRep(admin);
  ok(pick === pick2, `deterministic across calls (${pick} === ${pick2})`);

  console.log(`\n=== RESULT: ${pass} passed / ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("✗ fatal:", e); process.exit(1); });
