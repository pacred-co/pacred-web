/**
 * ════════════════════════════════════════════════════════════════════════
 * P1-16 — register seed gate · assert a NEW native signup is a FULL citizen
 * of the legacy tb_* data plane (not a functional orphan)
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The faithful legacy register (`member/api/otp/check-otp-register.php`
 * L97-120) seeds THREE legacy rows when a customer signs up — and Pacred's
 * native register was missing two of them, plus dead-writing a third:
 *
 *   1. tb_wallet    (userID) — the wallet balance row. Migrated customers all
 *      have one; native signups had NONE → every wallet read fell through to
 *      ฿0-or-missing + the money-loop had no row to debit/credit.
 *   2. tb_cash_back (userID) — the cashback balance row. Same gap.
 *   3. tb_corporate (userID, …) — for a JURISTIC signup. Pacred wrote the
 *      REBUILT empty `corporate` table (keyed by profile_id UUID) instead of
 *      legacy `tb_corporate` (keyed by userid) → a silent dead-write that
 *      hid the company data from ops + tax-invoice eligibility.
 *
 * This gate exercises the REAL helpers that close those gaps:
 *   - seedLegacyWalletRows()  (lib/auth/legacy-bridge-tb-users.ts) — called by
 *     insertLegacyTbUserRow() after the tb_users insert, on BOTH register paths.
 *   - upsertLegacyCorporate() (lib/auth/legacy-bridge-tb-users.ts) — called by
 *     saveJuristicStep2() once the company data exists.
 *
 * Unlike the admin wallet actions (wrapped in withAdmin → requireAdmin →
 * cookie-bound createClient → redirect, which only run inside a Next.js
 * request scope), these two helpers are PURE functions that take an admin
 * SupabaseClient — so this gate awaits them DIRECTLY. That's the strongest
 * possible coupling: it runs the exact production code path, not a re-impl.
 *
 * HOW TO RUN (opt-in · needs a live DB · MUTATES → NOT in pnpm test:unit)
 * ----------------------------------------------------------------------
 *     pnpm tsx --env-file=.env.local lib/auth/register-seed.test.ts
 *
 * SAFETY — it NEVER touches a real customer's data
 * ------------------------------------------------
 * Everything operates on ONE sentinel member_code: TEST_USERID ('REGSEEDQA').
 * Seed at start, tear down at end — a guarded DELETE that refuses to run
 * unless the row's userid === TEST_USERID. No real PR#### customer is read,
 * written, or deleted.
 *
 * Pattern mirrors tests/qa-flows/wallet-delta.ts + lib/wallet/overdraw-guard.test.ts
 * (standalone tsx · @supabase/supabase-js admin client · seed→assert→cleanup ·
 * pass/fail counters · exit nonzero on failure · graceful skip if env unset).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime constructor errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket before createClient.
// (No-op on Node ≥22 / Bun / browsers.) Block copied from tests/qa-flows/wallet-delta.ts.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

// Bind to the REAL helpers under test (these are pure server-only functions
// that take an admin client — safe to import + await directly from tsx).
import {
  seedLegacyWalletRows,
  upsertLegacyCorporate,
} from "./legacy-bridge-tb-users";

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
function assertEq<T>(label: string, actual: T, expected: T) {
  if (actual === expected) ok(`${label}  (= ${String(actual)})`);
  else bad(label, `expected ${String(expected)} · actual ${String(actual)}`);
}
function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────────────────
// Sentinel — the ONLY member_code this gate ever touches. tb_*.userid is
// varchar(10); 'REGSEEDQA' is 9 chars (fits). Anything that isn't this exact
// string must never be deleted by teardown (guarded below).
// ────────────────────────────────────────────────────────────────────────
const TEST_USERID = "REGSEEDQA";

// Legacy corporate test fixtures (faithful column shapes).
const CORP_NUMBER = "0000000000000"; // 13-digit (corporatenumber varchar(13))
const CORP_NAME = "QA Register-Seed Co., Ltd. (throwaway)";
const CORP_ADDR = "1 QA Road, Test District, Bangkok 10000";
const CORP_NAME_2 = "QA Register-Seed Co., Ltd. (RENAMED)";

// ════════════════════════════════════════════════════════════════════════
// Seed + teardown — strictly scoped to TEST_USERID
// ════════════════════════════════════════════════════════════════════════

async function seed(admin: SupabaseClient) {
  // Hard pre-clean in case a prior run died before teardown.
  await teardown(admin, { quiet: true });

  // Seed a minimal tb_users row for the sentinel. seedLegacyWalletRows does
  // NOT require it (it keys on tb_wallet.userid only), but a real signup ALWAYS
  // creates tb_users first (the bridge inserts it, then calls the seed), so we
  // mirror that ordering for fidelity. tb_users has many NOT NULL columns with
  // no defaults; copy the full payload from tests/qa-flows/wallet-delta.ts.
  const nowIso = new Date().toISOString();
  const { error: uErr } = await admin.from("tb_users").insert({
    userid: TEST_USERID,
    usertel: "0000000001",
    userstatus: "1",
    userpass: "qa-gate-no-login",
    username: "QA",
    userlastname: "RegSeed",
    userpicture: "user.jpg",
    coid: "PR",
    userlinenotify: "",
    usercompany: "1", // juristic — exercises the tb_corporate path too
    usercomparison: "0",
    usercomparisonvalue: 0,
    usercredit: "0",
    usercreditvalue: 0,
    usercreditdate: 0,
    shopuser: "1",
    channel: "",
    userrecom: "",
    useraddressid: "",
    usertransporttype: "",
    usershipby: "",
    userpaymethod: "",
    usernote: "qa register-seed gate (throwaway)",
    useractive: "0",
    userlineidoa: "",
    companycustomer: "0",
    userregistered: nowIso,
  });
  if (uErr) {
    // tb_users is best-effort context — the helpers under test don't depend on
    // it. Log + continue (the wallet/corporate asserts still run).
    console.log(`  ℹ tb_users seed skipped (non-fatal · helpers key on their own tables): ${uErr.message}`);
  } else {
    console.log(`  ✓ seeded sentinel tb_users ${TEST_USERID}`);
  }
}

async function teardown(admin: SupabaseClient, opts?: { quiet?: boolean }) {
  // GUARD: refuse to delete anything that isn't the exact sentinel. Belt-and-
  // braces so a typo can never wipe a real customer's data.
  if (TEST_USERID !== "REGSEEDQA") {
    throw new Error("teardown refused — TEST_USERID is not the sentinel 'REGSEEDQA'");
  }
  if (!opts?.quiet) console.log("\n🧹 teardown (sentinel only)");
  try {
    await admin.from("tb_corporate").delete().eq("userid", TEST_USERID);
    await admin.from("tb_cash_back").delete().eq("userid", TEST_USERID);
    await admin.from("tb_wallet").delete().eq("userid", TEST_USERID);
    await admin.from("tb_users").delete().eq("userid", TEST_USERID);
    if (!opts?.quiet) console.log(`  ✓ removed all tb_corporate / tb_cash_back / tb_wallet / tb_users rows for ${TEST_USERID}`);
  } catch (e) {
    if (!opts?.quiet) console.error("  ✗ teardown error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Steps
// ════════════════════════════════════════════════════════════════════════

/**
 * (1) WALLET + CASHBACK SEED — exercises seedLegacyWalletRows() directly.
 *     Assert BOTH a tb_wallet row (wallettotal default 0.00) AND a
 *     tb_cash_back row (cbtotal default 0) now exist for the member_code.
 *     Then re-run to prove idempotency (no duplicate / no throw).
 */
async function stepWalletAndCashbackSeed(admin: SupabaseClient) {
  section("(1) seedLegacyWalletRows()  →  tb_wallet + tb_cash_back rows exist");

  // Pre-state: neither row should exist yet (seed() only made tb_users).
  const { data: preW } = await admin
    .from("tb_wallet").select("userid").eq("userid", TEST_USERID).maybeSingle();
  const { data: preC } = await admin
    .from("tb_cash_back").select("userid").eq("userid", TEST_USERID).maybeSingle();
  if (!preW && !preC) ok("pre-state: no tb_wallet / tb_cash_back row yet (the orphan state we fix)");
  else bad("pre-state should be empty", `tb_wallet=${preW ? "present" : "absent"} · tb_cash_back=${preC ? "present" : "absent"}`);

  // --- run the REAL helper ---
  const res = await seedLegacyWalletRows(admin, TEST_USERID);
  assertEq("seedLegacyWalletRows reports wallet seeded", res.wallet, true);
  assertEq("seedLegacyWalletRows reports cashBack seeded", res.cashBack, true);

  // tb_wallet row exists with the DEFAULT balance (0.00).
  const { data: wRow, error: wErr } = await admin
    .from("tb_wallet")
    .select("userid, wallettotal")
    .eq("userid", TEST_USERID)
    .maybeSingle<{ userid: string; wallettotal: number | string | null }>();
  if (wErr) { bad("tb_wallet read after seed", wErr.message); }
  else if (!wRow) { bad("tb_wallet row missing after seed", "expected a row for the new customer"); }
  else {
    ok("tb_wallet row exists for the new customer");
    assertEq("tb_wallet.wallettotal defaults to 0", Number(wRow.wallettotal ?? -1), 0);
  }

  // tb_cash_back row exists with cbtotal=0.
  const { data: cRow, error: cErr } = await admin
    .from("tb_cash_back")
    .select("userid, cbtotal")
    .eq("userid", TEST_USERID)
    .maybeSingle<{ userid: string; cbtotal: number | string | null }>();
  if (cErr) { bad("tb_cash_back read after seed", cErr.message); }
  else if (!cRow) { bad("tb_cash_back row missing after seed", "expected a row for the new customer"); }
  else {
    ok("tb_cash_back row exists for the new customer");
    assertEq("tb_cash_back.cbtotal is 0", Number(cRow.cbtotal ?? -1), 0);
  }

  // --- idempotency: a second call must NOT throw and must NOT duplicate ---
  const res2 = await seedLegacyWalletRows(admin, TEST_USERID);
  assertEq("re-run reports wallet present (idempotent)", res2.wallet, true);
  assertEq("re-run reports cashBack present (idempotent)", res2.cashBack, true);

  const { count: wCount } = await admin
    .from("tb_wallet").select("userid", { count: "exact", head: true }).eq("userid", TEST_USERID);
  const { count: cCount } = await admin
    .from("tb_cash_back").select("userid", { count: "exact", head: true }).eq("userid", TEST_USERID);
  assertEq("exactly one tb_wallet row after re-run (no duplicate)", wCount ?? -1, 1);
  assertEq("exactly one tb_cash_back row after re-run (no duplicate)", cCount ?? -1, 1);
}

/**
 * (2) JURISTIC CORPORATE — exercises upsertLegacyCorporate() directly.
 *     Assert a tb_corporate row (keyed by userid = member_code) lands with the
 *     submitted company fields, status='1' (PENDING), and empty file columns.
 *     Then call again with a changed name → assert UPDATE (no duplicate row).
 */
async function stepJuristicCorporate(admin: SupabaseClient) {
  section("(2) upsertLegacyCorporate()  →  tb_corporate row (NOT the rebuilt 'corporate')");

  // Pre-state: no tb_corporate row yet.
  const { data: pre } = await admin
    .from("tb_corporate").select("id").eq("userid", TEST_USERID).maybeSingle();
  if (!pre) ok("pre-state: no tb_corporate row yet (the dead-write target we fix)");
  else bad("pre-state should be empty", "a tb_corporate row already exists for the sentinel");

  // --- INSERT path (fresh juristic signup) ---
  const ins = await upsertLegacyCorporate(admin, {
    memberCode: TEST_USERID,
    corporateNumber: CORP_NUMBER,
    corporateName: CORP_NAME,
    corporateAddress: CORP_ADDR,
  });
  assertEq("upsertLegacyCorporate INSERT returns ok", ins.ok, true);

  const { data: row, error: rErr } = await admin
    .from("tb_corporate")
    .select("userid, corporatenumber, corporatename, corporateaddress, corporatefile, corporatefile20, corporatestatus")
    .eq("userid", TEST_USERID)
    .maybeSingle<{
      userid: string;
      corporatenumber: string;
      corporatename: string;
      corporateaddress: string;
      corporatefile: string;
      corporatefile20: string;
      corporatestatus: string;
    }>();
  if (rErr) { bad("tb_corporate read after insert", rErr.message); }
  else if (!row) { bad("tb_corporate row missing after insert", "the juristic company data was a dead-write again"); }
  else {
    ok("tb_corporate row exists for the juristic customer (keyed by userid)");
    assertEq("tb_corporate.corporatenumber", row.corporatenumber, CORP_NUMBER);
    assertEq("tb_corporate.corporatename", row.corporatename, CORP_NAME);
    assertEq("tb_corporate.corporateaddress", row.corporateaddress, CORP_ADDR);
    assertEq("tb_corporate.corporatestatus is '1' (PENDING)", row.corporatestatus, "1");
    assertEq("tb_corporate.corporatefile empty (uploaded in step 3)", row.corporatefile, "");
    assertEq("tb_corporate.corporatefile20 empty (uploaded in step 3)", row.corporatefile20, "");
  }

  // --- UPDATE path (customer re-edits step 2) — must NOT create a 2nd row ---
  const upd = await upsertLegacyCorporate(admin, {
    memberCode: TEST_USERID,
    corporateNumber: CORP_NUMBER,
    corporateName: CORP_NAME_2,
    corporateAddress: CORP_ADDR,
  });
  assertEq("upsertLegacyCorporate UPDATE returns ok", upd.ok, true);

  const { data: updRow } = await admin
    .from("tb_corporate")
    .select("corporatename")
    .eq("userid", TEST_USERID)
    .maybeSingle<{ corporatename: string }>();
  assertEq("tb_corporate.corporatename updated in place", updRow?.corporatename ?? "", CORP_NAME_2);

  const { count } = await admin
    .from("tb_corporate").select("userid", { count: "exact", head: true }).eq("userid", TEST_USERID);
  assertEq("exactly one tb_corporate row after re-edit (UPDATE, not duplicate)", count ?? -1, 1);
}

// ════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== P1-16 register-seed gate — tb_wallet + tb_cash_back + tb_corporate ===");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "\n✗ SUPABASE env unset — this gate REQUIRES a live DB.\n" +
        "  Run it as:  pnpm tsx --env-file=.env.local lib/auth/register-seed.test.ts",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    section("🌱 seed");
    await seed(admin);

    await stepWalletAndCashbackSeed(admin);
    await stepJuristicCorporate(admin);
  } catch (e) {
    bad("UNCAUGHT during gate run", e instanceof Error ? e.message : String(e));
  } finally {
    await teardown(admin);
  }

  // ── summary ──
  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.error(
      "\n❌ GATE RED — a new native signup is NOT a full tb_* citizen " +
        "(missing tb_wallet / tb_cash_back, or juristic data dead-wrote 'corporate' instead of tb_corporate).",
    );
    process.exit(1);
  }
  console.log(
    "\n✅ GATE GREEN — new signup seeds tb_wallet + tb_cash_back, and juristic " +
      "company data lands in the LEGACY tb_corporate (not the rebuilt dead table).",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
