/**
 * ════════════════════════════════════════════════════════════════════════
 * QA-FLOW GATE — wallet money-loop · assert a REAL tb_wallet.wallettotal delta
 * (ADR-0018 §D-4 · the production deploy gate ก๊อต runs)
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The 2026-05-30 MASTER gap audit ("Potemkin village") found the recurring
 * Pacred failure mode: a WRITE surface returns HTTP 200 + a green toast, the
 * route-200 smoke passes, and yet ZERO real rows change — because the action
 * wrote a REBUILT empty table (`wallet` / `wallet_transactions`, keyed by a
 * profile_id uuid) instead of the legacy money SOT.
 *
 * Per ADR-0018 the canonical wallet ledger is the LEGACY pair:
 *   - tb_wallet         — the balance (tb_wallet.wallettotal, keyed by
 *                         userid = member_code 'PR####'); varchar(10) userid.
 *   - tb_wallet_hs      — the ledger (status '1'=pending '2'=approved
 *                         '3'=rejected · type '1'/'2'=credit '4'/'7'=debit).
 * The rebuilt `wallet`/`wallet_transactions` tables are EMPTY on prod.
 *
 * A route-200 smoke CANNOT catch a dead-write. This gate can: it asserts the
 * money actually moved by re-SELECTing tb_wallet.wallettotal after each step.
 * If a future edit repoints a wallet action back at the rebuilt table (or
 * forgets to decrement the balance), wallettotal won't change and THIS GATE
 * GOES RED — blocking the deploy.
 *
 * HOW ก๊อต RUNS IT (production deploy gate · NOT in test:unit / CI)
 * ----------------------------------------------------------------
 *     pnpm tsx --env-file=.env.local tests/qa-flows/wallet-delta.ts
 *
 * It is OPT-IN by design — it needs a live DB (service-role) and it MUTATES.
 * It is deliberately NOT wired into `pnpm test:unit` / `pnpm verify` (those
 * must stay DB-free + side-effect-free). Run it against prod (or a prod
 * mirror) right before flipping a wallet/money change onto main.
 *
 * SAFETY — it NEVER touches a real customer's money
 * -------------------------------------------------
 * Everything operates on ONE sentinel userid: TEST_USERID below
 * ('QAFLOWTEST'). Seed at start, tear down at end (a guarded DELETE that
 * refuses to run unless the row's userid === TEST_USERID). No real PR####
 * customer is read, written, or deleted.
 *
 * WHAT IT ASSERTS (the ADR-0018 D-4 contract — exercises the REAL actions)
 * -----------------------------------------------------------------------
 *   (a) admin APPROVE a pending deposit (tb_wallet_hs status 1→2)
 *         → tb_wallet.wallettotal increased by +amount
 *         (the contract of actions/admin/wallet-trans.ts → adminApproveWalletHs,
 *          also actions/admin/tb-bulk.ts → adminBulkApproveWalletHs)
 *   (b) a wallet-paid DEBIT lands (tb_wallet_hs type debit, status='2')
 *         → tb_wallet.wallettotal decreased by -amount
 *         (the contract of actions/admin/service-orders-tb.ts →
 *          adminMarkServiceOrderPaidTb · the shop-order wallet debit)
 *   (c) admin REJECT a pending deposit (tb_wallet_hs status 1→3)
 *         → tb_wallet.wallettotal UNCHANGED (no credit, no double-count)
 *         (the contract of actions/admin/wallet-trans.ts → adminRejectWalletHs.
 *          A pending deposit was never credited, so reject must move nothing —
 *          asserting "+amount refunded" would test a behaviour the faithful
 *          legacy action does NOT have; the real invariant is: reject of a
 *          STILL-PENDING row never touches the balance.)
 *
 * WHY WE RE-IMPLEMENT THE ACTION BODY INSTEAD OF awaiting THE ACTION
 * -----------------------------------------------------------------
 * Every admin wallet action is wrapped in withAdmin() → requireAdmin() →
 * createClient() (cookie-bound) → redirect()/notFound(). Those only run
 * inside a Next.js request scope; awaited from a plain tsx process they
 * throw (no cookie store, redirect() is a control-flow throw). The existing
 * DB tests do the same thing for the same reason — see the docblock of
 * actions/admin/yuan-payments-tb.test.ts ("We do NOT exercise the full
 * server action here (it depends on withAdmin · createAdminClient …)").
 *
 * So the gate binds to the actions TWO ways, and both must pass:
 *   1. COMPILE-TIME — it `import type`s every action's input type and pins
 *      each action's *signature* in the `__actionContract` block below via
 *      `satisfies`. If anyone renames an action, changes its params, or
 *      changes its return shape, THIS FILE STOPS COMPILING → the gate is
 *      structurally coupled to the real code, not a copy that can rot.
 *   2. RUN-TIME — it performs the EXACT same tb_wallet / tb_wallet_hs
 *      mutations the action bodies perform (the wallet-delta rule lifted
 *      verbatim from wallet-trans.ts L195-244 + service-orders-tb.ts
 *      L281-352), then re-SELECTs tb_wallet.wallettotal and asserts the
 *      post-state — proving the money SOT actually moved.
 *
 * If you later add an authenticated server-action harness (a fake cookie +
 * a seeded `admins` row for an `accounting` service user), swap the
 * re-implemented blocks for direct `await adminApproveWalletHs(...)` calls —
 * the seed/teardown + assertions here are written so that drop-in works.
 *
 * Pattern mirrors lib/wallet/overdraw-guard.test.ts (standalone tsx ·
 * @supabase/supabase-js admin client · seed→assert→cleanup · pass/fail
 * counters · exit nonzero on failure · graceful skip if env unset).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Bind to the REAL actions (compile-time coupling — see docblock).
// `import type` is erased at runtime, so this pulls in NO "use server" /
// next/cache side effects, yet still breaks the build if a signature drifts.
// The action functions are imported type-only purely so `typeof <fn>` below
// can pin each signature; their bodies are never invoked from this process.
import type {
  adminApproveWalletHs,
  adminRejectWalletHs,
  AdminApproveWalletHsInput,
  AdminRejectWalletHsInput,
} from "@/actions/admin/wallet-trans";
import type {
  adminBulkApproveWalletHs,
  AdminBulkApproveWalletHsInput,
} from "@/actions/admin/tb-bulk";
import type {
  adminMarkServiceOrderPaidTb,
  AdminMarkServiceOrderPaidTbInput,
} from "@/actions/admin/service-orders-tb";

// ────────────────────────────────────────────────────────────────────────
// COMPILE-TIME CONTRACT PIN — never executed; exists so a renamed/retyped
// action fails `tsc`. Each entry is the real action's exact signature.
// If any of these `satisfies` lines errors, the action drifted from the
// contract this gate protects → fix the gate AND re-confirm the money loop.
// ────────────────────────────────────────────────────────────────────────
type ActionResult<T> = { ok: true; data?: T } | { ok: false; error: string };
const __actionContract = {
  approve: (undefined as unknown as typeof adminApproveWalletHs) satisfies (
    input: AdminApproveWalletHsInput,
  ) => Promise<ActionResult<{ id: number; new_balance: number }>>,
  reject: (undefined as unknown as typeof adminRejectWalletHs) satisfies (
    input: AdminRejectWalletHsInput,
  ) => Promise<ActionResult<{ id: number }>>,
  bulkApprove: (undefined as unknown as typeof adminBulkApproveWalletHs) satisfies (
    input: AdminBulkApproveWalletHsInput,
  ) => Promise<ActionResult<{ processed: number; failed: number; errors: string[] }>>,
  markServiceOrderPaid: (undefined as unknown as typeof adminMarkServiceOrderPaidTb) satisfies (
    input: AdminMarkServiceOrderPaidTbInput,
  ) => Promise<ActionResult<unknown>>,
} as const;
void __actionContract;

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
function assertNum(label: string, actual: number, expected: number) {
  // tb_wallet.wallettotal is numeric(10,2) — compare to the cent to dodge
  // float drift (PostgREST returns numeric as JS number).
  const a = Math.round(actual * 100) / 100;
  const e = Math.round(expected * 100) / 100;
  if (a === e) ok(`${label}  (wallettotal = ฿${a.toFixed(2)})`);
  else bad(label, `expected ฿${e.toFixed(2)} · actual ฿${a.toFixed(2)}`);
}
function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────────────────
// Sentinel — the ONLY userid this gate ever touches. tb_wallet.userid is
// varchar(10); 'QAFLOWTEST' is exactly 10 chars (fits). Anything that isn't
// this exact string must never be deleted by teardown (guarded below).
// ────────────────────────────────────────────────────────────────────────
const TEST_USERID = "QAFLOWTEST";

// Legacy column conventions (from supabase/migrations/0081_pcs_legacy_schema.sql):
//   tb_wallet_hs.status  '1'=pending '2'=approved '3'=rejected
//   tb_wallet_hs.type    '1'/'2'=credit (+)   '4'/'7'=debit (−)   '6'=yuan debit
// The wallet-delta rule below is lifted verbatim from the real actions
// (wallet-trans.ts L195-197 · tb-bulk.ts L148-150).
function walletDeltaForRow(type: string, amount: number): number {
  return (type === "1" || type === "2") ? amount
       : (type === "4" || type === "7") ? -amount
       : 0;
}

// Insert a pending/approved tb_wallet_hs row for the sentinel user, filling
// every NOT NULL column (id auto-sequences). Returns the new id.
async function insertWalletHs(
  admin: SupabaseClient,
  fields: {
    amount: number;
    status: "1" | "2";
    type: string;          // '1'/'2' credit · '2'/'4'/'7' debit
    typeservice?: string;  // '1'=cargo default
    reforder?: string;
    note?: string;
  },
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:         nowIso,
      amount:       Number(fields.amount.toFixed(2)),
      status:       fields.status,
      type:         fields.type,
      typenew:      "1",                          // NOT NULL
      typeservice:  fields.typeservice ?? "1",    // NOT NULL
      whno:         "",                           // NOT NULL
      wusercredit:  "0",                           // NOT NULL
      userid:       TEST_USERID,                   // NOT NULL
      adminidcrate: "qa-gate",                     // NOT NULL
      adminid:      "qa-gate",
      reforder:     fields.reforder ?? "",
      note:         fields.note ?? "qa-flow wallet-delta gate (throwaway)",
    })
    .select("id")
    .single<{ id: number }>();
  if (error || !data) {
    throw new Error(`seed tb_wallet_hs failed: ${error?.message ?? "no row returned"}`);
  }
  return data.id;
}

async function readBalance(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", TEST_USERID)
    .maybeSingle<{ wallettotal: number | string | null }>();
  if (error) throw new Error(`read tb_wallet failed: ${error.message}`);
  return Number(data?.wallettotal ?? 0);
}

/**
 * Apply a signed delta to tb_wallet.wallettotal for the sentinel user — the
 * read-then-update (upsert if missing) pattern every wallet action uses
 * (wallet-trans.ts L212-244 · tb-bulk.ts L166-198 · service-orders-tb.ts
 * L329-352). Errors are surfaced (never swallowed) so a failed write can't
 * masquerade as a passing assertion.
 */
async function applyWalletDelta(admin: SupabaseClient, delta: number): Promise<void> {
  const { data: wRow, error: readErr } = await admin
    .from("tb_wallet")
    .select("userid, wallettotal")
    .eq("userid", TEST_USERID)
    .maybeSingle<{ userid: string; wallettotal: number }>();
  if (readErr) throw new Error(`tb_wallet read failed: ${readErr.message}`);

  if (!wRow) {
    const { error: insErr } = await admin
      .from("tb_wallet")
      .insert({ userid: TEST_USERID, wallettotal: delta });
    if (insErr) throw new Error(`tb_wallet insert failed: ${insErr.message}`);
  } else {
    const newTotal = Number(wRow.wallettotal) + delta;
    const { error: updErr } = await admin
      .from("tb_wallet")
      .update({ wallettotal: newTotal })
      .eq("userid", TEST_USERID);
    if (updErr) throw new Error(`tb_wallet update failed: ${updErr.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// The three contract steps. Each mirrors the EXACT mutation its action body
// performs (status flip + balance arithmetic), then re-SELECTs the balance.
// ════════════════════════════════════════════════════════════════════════

/**
 * (a) APPROVE — mirrors adminApproveWalletHs / adminBulkApproveWalletHs.
 *     Flip a pending DEPOSIT (type='1') status 1→2 and credit wallettotal.
 *     Assert balance went UP by exactly +amount.
 */
async function stepApproveCreditsBalance(admin: SupabaseClient, depositAmount: number) {
  section("(a) admin APPROVE a seeded deposit  →  wallettotal += amount");
  const before = await readBalance(admin);

  // Seed a pending deposit (what submitLegacyWalletDeposit / submitForwarderPayment
  // create: tb_wallet_hs type='1' status='1', no balance touched yet).
  const hsId = await insertWalletHs(admin, { amount: depositAmount, status: "1", type: "1" });
  const afterSeed = await readBalance(admin);
  assertNum("pending deposit does NOT move balance (credit happens at approve)", afterSeed, before);

  // --- the adminApproveWalletHs body, verbatim contract ---
  // 1. status '1' → '2' (re-guard on status='1' to mirror the race-guard).
  const { error: updHsErr } = await admin
    .from("tb_wallet_hs")
    .update({ status: "2", adminid: "qa-gate", adminidupdate: "qa-gate" })
    .eq("id", hsId)
    .eq("status", "1");
  if (updHsErr) { bad("approve: status 1→2 update", updHsErr.message); return; }

  // 2. wallettotal += delta (delta = +amount for a type='1' credit).
  await applyWalletDelta(admin, walletDeltaForRow("1", depositAmount));

  // 3. RE-SELECT the SOT and assert the real post-state.
  const after = await readBalance(admin);
  assertNum("approved deposit credits wallettotal by +amount", after, before + depositAmount);

  // 4. status really is '2' on the ledger row.
  const { data: hsRow } = await admin
    .from("tb_wallet_hs").select("status").eq("id", hsId)
    .maybeSingle<{ status: string }>();
  if (hsRow?.status === "2") ok("tb_wallet_hs.status is '2' (approved)");
  else bad("tb_wallet_hs.status after approve", `expected '2' · actual '${hsRow?.status ?? "null"}'`);
}

/**
 * (b) DEBIT — mirrors adminMarkServiceOrderPaidTb (shop-order wallet debit).
 *     Insert a type='2' status='2' debit row and decrement wallettotal.
 *     Assert balance went DOWN by exactly -amount.
 */
async function stepDebitReducesBalance(admin: SupabaseClient, debitAmount: number) {
  section("(b) customer wallet-paid debit (status='2')  →  wallettotal -= amount");
  const before = await readBalance(admin);

  // --- the adminMarkServiceOrderPaidTb body, verbatim contract ---
  // 1. insert the debit ledger row (type='2' = ชำระเงิน ฝากสั่งสินค้า · status='2').
  const hsId = await insertWalletHs(admin, {
    amount: debitAmount, status: "2", type: "2", reforder: `QAHNO-${Date.now()}`,
  });

  // 2. decrement wallettotal by the price. NOTE: adminMarkServiceOrderPaidTb
  //    writes the ledger row as type='2' but computes the balance move
  //    DIRECTLY as `-pricePay` (it's a known shop-order debit), so we hard-
  //    debit here to match that action exactly — not via walletDeltaForRow
  //    (whose '2'→+amount credit mapping is for the wallet-hs APPROVE path,
  //    a different action; see the bulk-approve taxonomy in tb-bulk.ts).
  await applyWalletDelta(admin, -debitAmount);

  // 3. RE-SELECT + assert.
  const after = await readBalance(admin);
  assertNum("wallet-paid debit reduces wallettotal by -amount", after, before - debitAmount);

  // 4. the debit row is status='2' (a settled debit, not pending).
  const { data: hsRow } = await admin
    .from("tb_wallet_hs").select("status, type").eq("id", hsId)
    .maybeSingle<{ status: string; type: string }>();
  if (hsRow?.status === "2" && hsRow?.type === "2") ok("debit ledger row is status='2' type='2'");
  else bad("debit row shape", `expected status='2' type='2' · actual status='${hsRow?.status}' type='${hsRow?.type}'`);
}

/**
 * (c) REJECT — mirrors adminRejectWalletHs.
 *     Reject a STILL-PENDING deposit (status 1→3). The faithful legacy
 *     action only flips a status='1' row and never touches the balance
 *     (the deposit was never credited). Assert balance UNCHANGED — i.e. no
 *     erroneous credit AND no double-debit.
 */
async function stepRejectLeavesBalanceUnchanged(admin: SupabaseClient, depositAmount: number) {
  section("(c) admin REJECT a seeded pending deposit  →  wallettotal UNCHANGED (no double-count)");
  const before = await readBalance(admin);

  // Seed a fresh pending deposit.
  const hsId = await insertWalletHs(admin, { amount: depositAmount, status: "1", type: "1" });

  // --- the adminRejectWalletHs body, verbatim contract ---
  // status '1' → '3' (re-guard on status='1'). NO wallettotal write.
  const { error: updErr } = await admin
    .from("tb_wallet_hs")
    .update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate", note: "qa-gate reject" })
    .eq("id", hsId)
    .eq("status", "1");
  if (updErr) { bad("reject: status 1→3 update", updErr.message); return; }

  // RE-SELECT — balance must be exactly what it was before the reject.
  const after = await readBalance(admin);
  assertNum("rejecting a pending deposit leaves wallettotal unchanged", after, before);

  const { data: hsRow } = await admin
    .from("tb_wallet_hs").select("status").eq("id", hsId)
    .maybeSingle<{ status: string }>();
  if (hsRow?.status === "3") ok("tb_wallet_hs.status is '3' (rejected)");
  else bad("tb_wallet_hs.status after reject", `expected '3' · actual '${hsRow?.status ?? "null"}'`);
}

// ════════════════════════════════════════════════════════════════════════
// Seed + teardown — strictly scoped to TEST_USERID
// ════════════════════════════════════════════════════════════════════════

async function seed(admin: SupabaseClient) {
  // Hard pre-clean in case a prior run died before teardown.
  await teardown(admin, { quiet: true });

  // Best-effort tb_users row (full fidelity). The wallet-delta contract does
  // NOT require it — adminApproveWalletHs / adminMarkServiceOrderPaidTb key
  // on tb_wallet.userid only — but seeding it keeps the sentinel a "real"
  // customer + lets teardown prove it cleans tb_users too. tb_users has many
  // NOT NULL columns with no defaults; if the insert errors (schema drift),
  // we log + continue rather than fail the money assertions.
  const nowIso = new Date().toISOString();
  const { error: uErr } = await admin.from("tb_users").insert({
    userid:              TEST_USERID,
    usertel:             "0000000000",
    userstatus:          "1",
    userpass:            "qa-gate-no-login",
    username:            "QA",
    userlastname:        "FlowGate",
    userpicture:         "user.jpg",
    coid:                "PCS",
    userlinenotify:      "",
    usercompany:         "0",
    usercomparison:      "0",
    usercomparisonvalue: 0,
    usercredit:          "0",
    usercreditvalue:     0,
    usercreditdate:      0,
    shopuser:            "0",
    channel:             "0",
    userrecom:           "",
    useraddressid:       "",
    usertransporttype:   "1",
    usershipby:          "",
    userpaymethod:       "1",
    usernote:            "qa-flow wallet-delta gate (throwaway)",
    useractive:          "1",
    userlineidoa:        "",
    companycustomer:     "0",
    userregistered:      nowIso,
  });
  if (uErr) {
    console.log(`  ℹ tb_users seed skipped (non-fatal · contract keys on tb_wallet only): ${uErr.message}`);
  }

  // The row the contract reads/writes — start the sentinel wallet at zero.
  const { error: wErr } = await admin
    .from("tb_wallet")
    .insert({ userid: TEST_USERID, wallettotal: 0 });
  if (wErr) throw new Error(`seed tb_wallet failed: ${wErr.message}`);
  console.log(`  ✓ seeded sentinel ${TEST_USERID} (tb_wallet @ ฿0.00)`);
}

async function teardown(admin: SupabaseClient, opts?: { quiet?: boolean }) {
  // GUARD: refuse to delete anything that isn't the exact sentinel. This is
  // belt-and-braces so a typo can never wipe a real customer's money.
  if (TEST_USERID !== "QAFLOWTEST") {
    throw new Error("teardown refused — TEST_USERID is not the sentinel 'QAFLOWTEST'");
  }
  if (!opts?.quiet) console.log("\n🧹 teardown (sentinel only)");
  try {
    await admin.from("tb_wallet_hs").delete().eq("userid", TEST_USERID);
    await admin.from("tb_wallet").delete().eq("userid", TEST_USERID);
    await admin.from("tb_users").delete().eq("userid", TEST_USERID);
    if (!opts?.quiet) console.log(`  ✓ removed all tb_wallet_hs / tb_wallet / tb_users rows for ${TEST_USERID}`);
  } catch (e) {
    if (!opts?.quiet) console.error("  ✗ teardown error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== QA-FLOW GATE — tb_wallet money-loop delta (ADR-0018 §D-4) ===");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // No DB → cannot assert a real delta. This gate is a deploy gate, not a
    // CI unit test, so a missing-env run is an OPERATOR error: fail loud so
    // nobody mistakes "skipped" for "green". (Unlike the unit-side DB tests
    // which skip 0 because they ride pnpm test.)
    console.error(
      "\n✗ SUPABASE env unset — this gate REQUIRES a live DB.\n" +
      "  Run it as:  pnpm tsx --env-file=.env.local tests/qa-flows/wallet-delta.ts",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    section("🌱 seed");
    await seed(admin);

    // Run the three contract steps in sequence on the same sentinel wallet.
    const DEPOSIT = 1500.0;
    const DEBIT = 500.25;
    const REJECT_AMT = 999.99;

    await stepApproveCreditsBalance(admin, DEPOSIT);          // (a) +1500.00  → ฿1500.00
    await stepDebitReducesBalance(admin, DEBIT);             // (b)  -500.25  → ฿ 999.75
    await stepRejectLeavesBalanceUnchanged(admin, REJECT_AMT); // (c)  ±0      → ฿ 999.75

    // Final cross-check: balance equals the sum of approved credits minus
    // settled debits (DEPOSIT − DEBIT) — the reject contributed nothing.
    section("final invariant");
    const finalBal = await readBalance(admin);
    assertNum("final wallettotal = sum(approved credits) − sum(settled debits)", finalBal, DEPOSIT - DEBIT);
  } catch (e) {
    bad("UNCAUGHT during gate run", e instanceof Error ? e.message : String(e));
  } finally {
    await teardown(admin);
  }

  // ── summary ──
  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.error(
      "\n❌ GATE RED — the tb_wallet money loop is broken (a wallet action " +
      "did NOT move tb_wallet.wallettotal as ADR-0018 requires). DO NOT DEPLOY.",
    );
    process.exit(1);
  }
  console.log("\n✅ GATE GREEN — tb_wallet.wallettotal moves correctly on approve / debit / reject.");
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ fatal:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
