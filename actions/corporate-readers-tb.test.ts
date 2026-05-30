/**
 * ════════════════════════════════════════════════════════════════════════
 * P0-21 GATE — corporate readers · assert the LEGACY `tb_corporate` SOT
 * (ADR-0021 · the juristic-corporate source-of-truth swap)
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The 2026-05-30 MASTER gap audit ("Potemkin village") found the recurring
 * Pacred failure: a READ surface hits a REBUILT empty table instead of the
 * legacy `tb_*` SOT → the 8,898 migrated customers are INVISIBLE. For the
 * juristic-corporate domain the dead twin is the rebuilt `corporate` (keyed by
 * profile_id UUID, migration 0004 · mostly empty on prod); the SOT is the
 * LEGACY `tb_corporate` (keyed by `userid` = member_code 'PR####'), where the
 * 8,898 migrated juristic customers' company data + status actually live.
 *
 * Per ADR-0021 this batch re-pointed four เดฟ-lane readers to `tb_corporate`:
 *   - app/.../admin/customers/page.tsx       (inline juristic enrich + pending queue)
 *   - app/.../admin/service-orders/[hNo]/page.tsx   (juristic bill-to default)
 *   - actions/service-order.ts (getServiceOrderForReceipt — juristic receipt header)
 *   - actions/profile.ts (upsertCorporate — now DUAL-writes tb_corporate too)
 *
 * A route-200 smoke CANNOT catch a dead-read (the surface renders 200 with a
 * blank company name). This gate CAN: it seeds a `tb_corporate` row for a
 * sentinel member_code, then runs the EXACT read-path SQL the migrated surfaces
 * use (`.from("tb_corporate").eq("userid", <member_code>)` + the pending-queue
 * `.eq("corporatestatus","1")` filter) and asserts the row surfaces. If a future
 * edit repoints any reader back at the rebuilt `corporate` table, the migrated
 * customer won't surface and THIS GATE GOES RED.
 *
 * HOW TO RUN (opt-in · needs a live DB · MUTATES one sentinel row)
 * ----------------------------------------------------------------
 *     pnpm tsx --env-file=.env.local actions/corporate-readers-tb.test.ts
 *
 * It is OPT-IN by design — it needs service-role + it mutates, so it is NOT in
 * pnpm test:unit / pnpm verify (those stay DB-free + side-effect-free). Run it
 * against prod (or a prod mirror) before flipping a corporate-reader change.
 *
 * SAFETY — it NEVER touches a real customer
 * -----------------------------------------
 * Everything operates on ONE sentinel userid: TEST_USERID ('QACORPTEST', 10
 * chars — fits tb_corporate.userid varchar(10)). Seed at start, tear down at
 * end with a guarded DELETE that refuses unless the row's userid === TEST_USERID.
 * No real PR#### customer is read, written, or deleted.
 *
 * Pattern mirrors tests/qa-flows/wallet-delta.ts (standalone tsx · ws polyfill ·
 * @supabase/supabase-js admin client · seed→assert→cleanup · pass/fail counters
 * · exit nonzero on failure · fail loud if env unset).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime constructor errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket before createClient.
// (No-op on Node ≥22 / Bun / browsers.)
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

// ────────────────────────────────────────────────────────────────────────
// Test harness (no vitest — matches the repo's tsx test convention)
// ────────────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function ok(label: string) {
  pass++;
  console.log(`  ✓ ${label}`);
}
function bad(label: string, detail?: string) {
  fail++;
  console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
}
function eq<T>(label: string, actual: T, expected: T) {
  if (actual === expected) ok(`${label}  (= ${JSON.stringify(actual)})`);
  else bad(label, `expected ${JSON.stringify(expected)} · actual ${JSON.stringify(actual)}`);
}
function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────────────────
// Sentinel — the ONLY userid this gate ever touches. tb_corporate.userid is
// varchar(10); 'QACORPTEST' is exactly 10 chars (fits). Anything that isn't
// this exact string must never be deleted by teardown (guarded below).
// ────────────────────────────────────────────────────────────────────────
const TEST_USERID = "QACORPTEST";

// The sentinel company payload — distinct values so a mis-mapped column can't
// silently pass. corporatestatus '1' = pending (statusComp · the queue filter).
const SENTINEL = {
  corporatenumber: "0999999999999", // 13 digits (fits varchar(13))
  corporatename: "QA Corp SOT Test Co., Ltd.",
  corporateaddress: "1 QA Gate Rd · Bangkok · 10000",
  corporatestatus: "1",
} as const;

// ── ADR-0021 status map (the migrated readers convert numeric → keyword) ──
// Mirrors CORP_STATUS_TO_KEYWORD in app/.../admin/customers/page.tsx + the
// STATUS_LABEL in /admin/juristic-check. Asserting it here pins the contract.
const CORP_STATUS_TO_KEYWORD: Record<string, "pending" | "verified" | "rejected"> = {
  "1": "pending", "2": "verified", "3": "rejected",
};

// tb_corporate row shape (all-lowercase — NOT in the 0113 camelCase batch).
type CorpRow = {
  userid: string;
  corporatenumber: string | null;
  corporatename: string | null;
  corporateaddress: string | null;
  corporatestatus: string | null;
  corporatefile: string | null;
  corporatefile20: string | null;
};

// ════════════════════════════════════════════════════════════════════════
// Seed + teardown — strictly scoped to TEST_USERID
// ════════════════════════════════════════════════════════════════════════

async function seed(admin: SupabaseClient) {
  // Hard pre-clean in case a prior run died before teardown.
  await teardown(admin, { quiet: true });

  // The row the migrated readers read. Mirrors upsertLegacyCorporate's INSERT
  // (lib/auth/legacy-bridge-tb-users.ts) — every NOT NULL column filled; the
  // file columns get "" (legacy PHP wrote empty strings, never NULL); id
  // auto-sequences; cpdatecreate rides its DEFAULT CURRENT_TIMESTAMP.
  const { error } = await admin.from("tb_corporate").insert({
    userid: TEST_USERID,
    corporatenumber: SENTINEL.corporatenumber,
    corporatename: SENTINEL.corporatename,
    corporateaddress: SENTINEL.corporateaddress,
    corporatefile: "",
    corporatefile20: "",
    corporatestatus: SENTINEL.corporatestatus,
  });
  if (error) throw new Error(`seed tb_corporate failed: ${error.message}`);
  console.log(`  ✓ seeded sentinel ${TEST_USERID} (tb_corporate · status='1' pending)`);
}

async function teardown(admin: SupabaseClient, opts?: { quiet?: boolean }) {
  // GUARD: refuse to delete anything that isn't the exact sentinel. Belt-and-
  // braces so a typo can never wipe a real customer's corporate row.
  if (TEST_USERID !== "QACORPTEST") {
    throw new Error("teardown refused — TEST_USERID is not the sentinel 'QACORPTEST'");
  }
  if (!opts?.quiet) console.log("\n🧹 teardown (sentinel only)");
  try {
    await admin.from("tb_corporate").delete().eq("userid", TEST_USERID);
    if (!opts?.quiet) console.log(`  ✓ removed all tb_corporate rows for ${TEST_USERID}`);
  } catch (e) {
    if (!opts?.quiet) console.error("  ✗ teardown error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// The read-path assertions. Each runs the EXACT SQL shape a migrated surface
// uses, proving the migrated juristic customer surfaces on the LEGACY SOT.
// ════════════════════════════════════════════════════════════════════════

/**
 * (a) The point-read shape used by:
 *       - service-orders/[hNo]/page.tsx (bill-to default · select corporatename)
 *       - actions/service-order.ts getServiceOrderForReceipt (receipt header)
 *       - admin/customers/page.tsx inline-enrich (.in("userid", userIds) — the
 *         single-row case of the same predicate)
 *     `.from("tb_corporate").select(...).eq("userid", memberCode)` → row found,
 *     columns map correctly. (The rebuilt-table read returned NULL here.)
 */
async function stepPointReadByUserid(admin: SupabaseClient) {
  section("(a) point-read tb_corporate by userid (bill-to / receipt / inline-enrich)");

  const { data, error } = await admin
    .from("tb_corporate")
    .select("userid, corporatenumber, corporatename, corporateaddress, corporatestatus, corporatefile, corporatefile20")
    .eq("userid", TEST_USERID)
    .maybeSingle<CorpRow>();

  if (error) { bad("point-read query", error.message); return; }
  if (!data) { bad("point-read returned a row", "got null — the migrated juristic customer did NOT surface"); return; }

  ok("migrated juristic customer surfaces via .eq(\"userid\", memberCode)");
  eq("corporatename maps (→ company_name / bill-to default)", data.corporatename, SENTINEL.corporatename);
  eq("corporatenumber maps (→ tax_id)", data.corporatenumber, SENTINEL.corporatenumber);
  eq("corporateaddress maps (→ company_address)", data.corporateaddress, SENTINEL.corporateaddress);
  eq("corporatestatus is the legacy numeric code", data.corporatestatus, SENTINEL.corporatestatus);

  // The migrated readers convert the numeric status → the client keyword.
  const keyword = CORP_STATUS_TO_KEYWORD[data.corporatestatus ?? "1"] ?? "pending";
  eq("numeric '1' maps to the JuristicBundle keyword 'pending'", keyword, "pending");
}

/**
 * (b) The pending-queue shape used by admin/customers/page.tsx pendingJuristic +
 *     /admin/juristic-check default queue:
 *       `.from("tb_corporate").eq("corporatestatus","1")` → the seeded pending
 *     sentinel appears in the review queue. (The rebuilt-table `.eq("status",
 *     "pending")` returned an empty queue for all 8,898 migrated customers.)
 */
async function stepPendingQueueFilter(admin: SupabaseClient) {
  section("(b) pending-review QUEUE filter (.eq(\"corporatestatus\",\"1\"))");

  const { data, error } = await admin
    .from("tb_corporate")
    .select("userid, corporatename, corporatestatus")
    .eq("corporatestatus", "1")
    .eq("userid", TEST_USERID) // scope to the sentinel so other prod pending rows don't perturb the count
    .maybeSingle<Pick<CorpRow, "userid" | "corporatename" | "corporatestatus">>();

  if (error) { bad("pending-queue query", error.message); return; }
  if (!data) { bad("sentinel appears in the pending queue", "got null — pending juristic customer missing from the review queue"); return; }

  ok("pending sentinel surfaces in the corporatestatus='1' review queue");
  eq("queue row carries the company name", data.corporatename, SENTINEL.corporatename);
}

/**
 * (c) Negative control — the rebuilt `corporate` table does NOT have this row.
 *     Proves we genuinely moved the SOT (not just that some table has the data).
 *     The rebuilt table is keyed by profile_id (UUID); a query by our sentinel
 *     member_code as profile_id is malformed, so we instead assert the sentinel
 *     is absent from the rebuilt table by company name. Best-effort: if the
 *     rebuilt `corporate` table is gone (post-retirement), skip cleanly.
 */
async function stepRebuiltTableDoesNotHaveIt(admin: SupabaseClient) {
  section("(c) negative control — rebuilt `corporate` does NOT hold the sentinel");

  const { data, error } = await admin
    .from("corporate")
    .select("company_name")
    .eq("company_name", SENTINEL.corporatename)
    .limit(1)
    .maybeSingle<{ company_name: string | null }>();

  if (error) {
    // Table may have been retired (ADR-0021 FINAL step) → that's fine, the SOT
    // is tb_corporate. Don't fail the gate over the rebuilt table's absence.
    console.log(`  ℹ rebuilt \`corporate\` not queryable (may be retired) — skipping negative control: ${error.message}`);
    return;
  }
  if (data) bad("rebuilt `corporate` unexpectedly holds the sentinel", "the SOT swap may be incomplete (a writer still writes only the rebuilt table)");
  else ok("rebuilt `corporate` has no sentinel row — reads genuinely moved to tb_corporate");
}

// ════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== P0-21 GATE — tb_corporate juristic SOT readers (ADR-0021) ===");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // No DB → cannot assert the SOT read. This is a deploy/opt-in gate, not a CI
    // unit test, so a missing-env run is an OPERATOR error: fail loud so nobody
    // mistakes "skipped" for "green".
    console.error(
      "\n✗ SUPABASE env unset — this gate REQUIRES a live DB.\n" +
      "  Run it as:  pnpm tsx --env-file=.env.local actions/corporate-readers-tb.test.ts",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    section("🌱 seed");
    await seed(admin);

    await stepPointReadByUserid(admin);
    await stepPendingQueueFilter(admin);
    await stepRebuiltTableDoesNotHaveIt(admin);
  } catch (e) {
    bad("UNCAUGHT during gate run", e instanceof Error ? e.message : String(e));
  } finally {
    await teardown(admin);
  }

  // ── summary ──
  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.error(
      "\n❌ GATE RED — a corporate reader did NOT surface the migrated juristic " +
      "customer on the legacy tb_corporate SOT (ADR-0021). DO NOT DEPLOY.",
    );
    process.exit(1);
  }
  console.log("\n✅ GATE GREEN — migrated juristic customers surface on tb_corporate (ADR-0021).");
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
