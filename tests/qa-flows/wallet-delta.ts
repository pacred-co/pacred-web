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
 *   ── ADR-0018 NEW money paths shipped this sprint ────────────────────────
 *   (d) customer WITHDRAW debit-HOLD → admin REJECT refund (the riskiest path)
 *         SUBMIT  → INSERT tb_wallet_hs type='3' status='1' (pending) AND
 *                   debit tb_wallet NOW (the hold) → wallettotal -= amount
 *                   (contract of actions/wallet-tb.ts → submitWithdrawRequest)
 *         REJECT  → status 1→3 AND refund tb_wallet += amount (balance-BUMP on
 *                   the SAME row, NOT a type='5' row) → wallettotal restored
 *                   (contract of actions/admin/wallet-hs.ts → adminRejectWithdraw)
 *         Asserts BOTH legs: submit-debit (-amount) AND reject-refund (+amount)
 *         net to ฿0 — a half-state here = real customer money lost.
 *   (e) customer WITHDRAW debit-HOLD → admin APPROVE (pay out)
 *         SUBMIT  → same hold as (d): wallettotal -= amount, status='1' type='3'
 *         APPROVE → status 1→2, **NO further balance move** (the debit already
 *                   happened at submit; approve just confirms the bank payout)
 *                   (contract of actions/admin/wallet-hs.ts → adminApproveWithdraw)
 *         → tb_wallet.wallettotal STAYS down by -amount (the money really left).
 *   (f) customer YUAN wallet-paid DEBIT (P0-2)
 *         → INSERT tb_wallet_hs type='6' status='2' AND debit tb_wallet
 *           -= payTHB at submit → wallettotal -= amount
 *           (contract of actions/payment-tb.ts → createYuanPaymentFromWallet)
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
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime constructor errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket before createClient.
// (No-op on Node ≥22 / Bun / browsers.)
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

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
// ── ADR-0018 NEW money paths shipped this sprint (the steps added below) ──
//   Customer DEBIT-on-submit (D-2 rule 1):
//     · submitWithdrawRequest (wallet-tb.ts) — withdraw = debit-HOLD: insert
//       tb_wallet_hs type='3' status='1' AND decrement tb_wallet NOW.
//     · createYuanPaymentFromWallet (payment-tb.ts · P0-2) — yuan-from-wallet:
//       insert tb_wallet_hs type='6' status='2' AND decrement tb_wallet NOW.
//   Admin terminal (D-2 rule 3):
//     · adminApproveWithdraw — status '1'→'2', NO balance move (paid out;
//       debit already happened at submit).
//     · adminRejectWithdraw  — status '1'→'3' AND refund (tb_wallet += amount,
//       a balance-bump on the SAME row — NOT a new type='5' row · L1736).
//
// NOTE the task brief said "createWithdraw"; the FAITHFUL action (the one that
// writes tb_wallet, per ADR-0018 D-3 #4) is submitWithdrawRequest in
// actions/wallet-tb.ts. actions/wallet.ts::createWithdraw is the DEAD rebuilt
// twin (writes wallet_transactions) — we pin the faithful one.
import type { submitWithdrawRequest } from "@/actions/wallet-tb";
import type { WithdrawInput } from "@/lib/validators/wallet";
import type {
  adminApproveWithdraw,
  adminRejectWithdraw,
  AdminApproveWithdrawInput,
  AdminRejectWithdrawInput,
} from "@/actions/admin/wallet-hs";
import type { createYuanPaymentFromWallet } from "@/actions/payment-tb";
import type { YuanPaymentInput } from "@/lib/validators/payment";

// ────────────────────────────────────────────────────────────────────────
// COMPILE-TIME CONTRACT PIN — never executed; exists so a renamed/retyped
// action fails `tsc`. Each entry is the real action's exact signature.
// If any of these `satisfies` lines errors, the action drifted from the
// contract this gate protects → fix the gate AND re-confirm the money loop.
// ────────────────────────────────────────────────────────────────────────
type ActionResult<T> = { ok: true; data?: T } | { ok: false; error: string };
// Some actions (customer-side) return the variant WITH a required `data`
// (their success path always carries a payload) — pin those exactly.
type ActionResultReq<T> = { ok: true; data: T; alreadyDone?: boolean } | { ok: false; error: string };
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
  // ── ADR-0018 new money paths (steps d/e/f below) ──
  // submitWithdrawRequest — customer withdraw debit-HOLD (wallet-tb.ts L112).
  submitWithdraw: (undefined as unknown as typeof submitWithdrawRequest) satisfies (
    input: WithdrawInput,
  ) => Promise<ActionResultReq<{ id: number; amount: number; new_wallet_balance: number }>>,
  // adminApproveWithdraw — status 1→2, no balance move (wallet-hs.ts L1519).
  approveWithdraw: (undefined as unknown as typeof adminApproveWithdraw) satisfies (
    input: AdminApproveWithdrawInput,
  ) => Promise<ActionResult<unknown>>,
  // adminRejectWithdraw — status 1→3 + refund balance-bump (wallet-hs.ts L1641).
  rejectWithdraw: (undefined as unknown as typeof adminRejectWithdraw) satisfies (
    input: AdminRejectWithdrawInput,
  ) => Promise<ActionResult<unknown>>,
  // createYuanPaymentFromWallet — yuan-from-wallet debit (payment-tb.ts L140).
  yuanFromWallet: (undefined as unknown as typeof createYuanPaymentFromWallet) satisfies (
    input: YuanPaymentInput,
  ) => Promise<ActionResultReq<{ id: number; thb_amount: number; new_wallet_balance: number }>>,
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

// Legacy column conventions (from supabase/migrations/0081_pcs_legacy_schema.sql
// L6213/L6220 + ADR-0018 §D-1 type matrix):
//   tb_wallet_hs.status  '1'=pending '2'=approved '3'=rejected
//   tb_wallet_hs.type    '1'=เติมเงิน (+) · '2'=ฝากสั่งซื้อชำระจาก wallet (the
//                        deposit-approve credit path maps '2'→+ in the bulk
//                        action) · '3'=ถอนเงิน (−, customer withdraw) ·
//                        '4'=สั่งจ่ายค่าคอม / forwarder-pay (−) ·
//                        '6'=ฝากโอนชำระจาก wallet / yuan (−) · '7'=manual (−).
// The credit branch ('1'/'2'→+amount) is lifted verbatim from the deposit-
// approve actions (wallet-trans.ts L195-197 · tb-bulk.ts L148-150). The debit
// branch covers the customer DEBIT-on-submit types ADR-0018 D-2 rule 1 added:
// '3' (withdraw) + '6' (yuan-from-wallet), alongside the pre-existing '4'/'7'.
// NOTE: the steps that mirror a specific action debit the balance EXPLICITLY
// (-amount) to byte-match that action's body (which computes the move directly,
// not via a generic map); this helper exists so the type→sign matrix is
// documented in one place + the credit step keeps using it.
function walletDeltaForRow(type: string, amount: number): number {
  return (type === "1" || type === "2") ? amount
       : (type === "3" || type === "4" || type === "6" || type === "7") ? -amount
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
// ADR-0018 NEW money paths shipped this sprint (D-2 rule 1 + rule 3 · P0-2).
// Each mirrors its action's EXACT mutation (status flip + balance arithmetic),
// then re-SELECTs the balance. THE RISKIEST is (d): a debit-HOLD on submit
// that must NET TO ZERO once the reject refunds it — so it asserts BOTH legs.
// ════════════════════════════════════════════════════════════════════════

/**
 * (d) WITHDRAW debit-HOLD → REJECT refund — the highest-risk money path.
 *
 *     SUBMIT (mirrors actions/wallet-tb.ts::submitWithdrawRequest L189-267):
 *       INSERT tb_wallet_hs type='3' (ถอนเงิน) status='1' (pending — admin
 *       must still confirm the bank payout) + DECREMENT tb_wallet NOW (the
 *       "hold"; the money leaves at submit even though the row stays pending,
 *       per ADR-0018 D-2 rule 1 STATUS sub-case + file docblock L50-58).
 *       → assert balance DOWN by exactly -amount.
 *
 *     REJECT (mirrors actions/admin/wallet-hs.ts::adminRejectWithdraw
 *       L1698-1779): flip status '1'→'3' + REFUND tb_wallet += amount (a
 *       balance-BUMP on the SAME row — NOT a new type='5' row, per the
 *       legacy code + ADR-0018 D-2 rule 3 correction).
 *       → assert balance back to the ORIGINAL (refund restores the hold).
 *
 *     The whole path must NET TO ZERO: submit-debit (−amount) + reject-refund
 *     (+amount) = 0. Assert both legs AND the net, plus the row ends status='3'.
 */
async function stepWithdrawDebitHoldThenReject(admin: SupabaseClient, amount: number) {
  section("(d) customer WITHDRAW debit-hold (type='3' status='1') → admin REJECT refunds  →  net ฿0");
  const before = await readBalance(admin);

  // ── SUBMIT — debit-on-submit / hold (submitWithdrawRequest) ────────────
  // 1. INSERT the pending withdraw ledger row (type='3' status='1').
  const hsId = await insertWalletHs(admin, {
    amount, status: "1", type: "3", typeservice: "1",
    note: "qa-gate withdraw hold (throwaway)",
  });

  // 2. DECREMENT tb_wallet immediately — the hold (balance leaves at submit).
  await applyWalletDelta(admin, walletDeltaForRow("3", amount)); // type='3' → -amount

  // 3. RE-SELECT + assert the hold debited the balance DOWN by -amount.
  const afterSubmit = await readBalance(admin);
  assertNum("withdraw SUBMIT debits wallettotal by -amount (the hold)", afterSubmit, before - amount);

  // 4. the held row is status='1' type='3' (pending withdraw, debit applied).
  const { data: heldRow } = await admin
    .from("tb_wallet_hs").select("status, type").eq("id", hsId)
    .maybeSingle<{ status: string; type: string }>();
  if (heldRow?.status === "1" && heldRow?.type === "3") ok("withdraw hold row is status='1' type='3'");
  else bad("withdraw hold row shape", `expected status='1' type='3' · actual status='${heldRow?.status}' type='${heldRow?.type}'`);

  // ── REJECT — flip 1→3 + REFUND balance-bump (adminRejectWithdraw) ───────
  // 5. status '1' → '3' (re-guard on status='1' — the action's race-guard).
  const { error: updErr } = await admin
    .from("tb_wallet_hs")
    .update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate", note: "qa-gate reject withdraw" })
    .eq("id", hsId)
    .eq("status", "1");
  if (updErr) { bad("reject withdraw: status 1→3 update", updErr.message); return; }

  // 6. REFUND tb_wallet += amount (balance-bump on the SAME row · L1736).
  await applyWalletDelta(admin, amount);

  // 7. RE-SELECT + assert the refund RESTORED the balance to the original.
  const afterReject = await readBalance(admin);
  assertNum("withdraw REJECT refunds wallettotal back to the original (net ฿0)", afterReject, before);

  // 8. the row ends status='3' (rejected).
  const { data: rejRow } = await admin
    .from("tb_wallet_hs").select("status").eq("id", hsId)
    .maybeSingle<{ status: string }>();
  if (rejRow?.status === "3") ok("tb_wallet_hs.status is '3' (withdraw rejected)");
  else bad("tb_wallet_hs.status after withdraw reject", `expected '3' · actual '${rejRow?.status ?? "null"}'`);
}

/**
 * (e) WITHDRAW debit-HOLD → APPROVE (pay out, NO further move).
 *
 *     SUBMIT (same as (d)): debit the hold + status='1' type='3'.
 *       → assert balance DOWN by -amount.
 *
 *     APPROVE (mirrors actions/admin/wallet-hs.ts::adminApproveWithdraw
 *       L1576-1585): flip status '1'→'2' + stamp admin · **NO tb_wallet
 *       change** (the debit already happened at submit; this is "approve to
 *       pay out", the bank-transfer is the side-effect — ADR-0018 D-2 rule 3 ¶3).
 *       → assert balance STAYS down by -amount (the money really left) and the
 *         row ends status='2'.
 */
async function stepWithdrawApprove(admin: SupabaseClient, amount: number) {
  section("(e) customer WITHDRAW debit-hold → admin APPROVE pays out (status='2', NO further move)");
  const before = await readBalance(admin);

  // ── SUBMIT — debit-on-submit / hold (submitWithdrawRequest) ────────────
  const hsId = await insertWalletHs(admin, {
    amount, status: "1", type: "3", typeservice: "1",
    note: "qa-gate withdraw hold→approve (throwaway)",
  });
  await applyWalletDelta(admin, walletDeltaForRow("3", amount)); // -amount hold
  const afterSubmit = await readBalance(admin);
  assertNum("withdraw SUBMIT debits wallettotal by -amount (the hold)", afterSubmit, before - amount);

  // ── APPROVE — flip 1→2, NO balance move (adminApproveWithdraw) ──────────
  // status '1' → '2' (re-guard on status='1'). NO tb_wallet write (rule 3 ¶3).
  const { error: updErr } = await admin
    .from("tb_wallet_hs")
    .update({ status: "2", adminid: "qa-gate", adminidupdate: "qa-gate" })
    .eq("id", hsId)
    .eq("status", "1");
  if (updErr) { bad("approve withdraw: status 1→2 update", updErr.message); return; }

  // RE-SELECT — balance must STAY down by -amount (approve pays out, no move).
  const afterApprove = await readBalance(admin);
  assertNum("withdraw APPROVE leaves wallettotal down by -amount (money really left)", afterApprove, before - amount);

  // the row ends status='2' type='3' (approved withdraw — paid out).
  const { data: appRow } = await admin
    .from("tb_wallet_hs").select("status, type").eq("id", hsId)
    .maybeSingle<{ status: string; type: string }>();
  if (appRow?.status === "2" && appRow?.type === "3") ok("tb_wallet_hs is status='2' type='3' (withdraw paid out)");
  else bad("withdraw approve row shape", `expected status='2' type='3' · actual status='${appRow?.status}' type='${appRow?.type}'`);
}

/**
 * (f) YUAN wallet-paid DEBIT (P0-2) — mirrors
 *     actions/payment-tb.ts::createYuanPaymentFromWallet (L274-346).
 *     Customer pays a ฝากโอนหยวน from their wallet:
 *       INSERT tb_wallet_hs type='6' (ชำระเงินฝากโอน) status='2' (approved —
 *       customer-initiated debit is auto-approved, the debit is real · L285-286)
 *       + DECREMENT tb_wallet -= payTHB at submit (L322-346).
 *     → assert balance DOWN by exactly -amount and the row is type='6' status='2'.
 */
async function stepYuanWalletDebit(admin: SupabaseClient, amount: number) {
  section("(f) customer YUAN wallet-paid debit (type='6' status='2')  →  wallettotal -= amount");
  const before = await readBalance(admin);

  // 1. INSERT the yuan-from-wallet debit row (type='6' status='2' · approved).
  //    typeservice='3' (ฝากโอน) mirrors the action (payment-tb.ts L288).
  const hsId = await insertWalletHs(admin, {
    amount, status: "2", type: "6", typeservice: "3",
    reforder: `QAPAY-${Date.now()}`,
    note: "qa-gate yuan-from-wallet (throwaway)",
  });

  // 2. DECREMENT wallettotal by the THB amount (the action computes -payTHB
  //    directly; type='6' → -amount via walletDeltaForRow documents that sign).
  await applyWalletDelta(admin, walletDeltaForRow("6", amount)); // -amount

  // 3. RE-SELECT + assert the debit reduced the balance DOWN by -amount.
  const after = await readBalance(admin);
  assertNum("yuan wallet-paid debit reduces wallettotal by -amount", after, before - amount);

  // 4. the row shape is type='6' status='2' (settled yuan debit, not pending).
  const { data: hsRow } = await admin
    .from("tb_wallet_hs").select("status, type").eq("id", hsId)
    .maybeSingle<{ status: string; type: string }>();
  if (hsRow?.status === "2" && hsRow?.type === "6") ok("yuan debit ledger row is status='2' type='6'");
  else bad("yuan debit row shape", `expected status='2' type='6' · actual status='${hsRow?.status}' type='${hsRow?.type}'`);
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

    // Run every contract step in sequence on the same sentinel wallet.
    // Amounts are distinct so a mis-applied delta can't accidentally cancel.
    const DEPOSIT = 1500.0;       // (a) approve credit
    const DEBIT = 500.25;         // (b) shop-order wallet debit (settled)
    const REJECT_AMT = 999.99;    // (c) reject pending deposit (no move)
    const WITHDRAW_REJ = 300.5;   // (d) withdraw hold→reject (nets ฿0)
    const WITHDRAW_APP = 222.22;  // (e) withdraw hold→approve (stays debited)
    const YUAN = 111.11;          // (f) yuan-from-wallet debit (settled)

    await stepApproveCreditsBalance(admin, DEPOSIT);            // (a) +1500.00  → ฿1500.00
    await stepDebitReducesBalance(admin, DEBIT);               // (b)  -500.25  → ฿ 999.75
    await stepRejectLeavesBalanceUnchanged(admin, REJECT_AMT);  // (c)  ±0       → ฿ 999.75
    await stepWithdrawDebitHoldThenReject(admin, WITHDRAW_REJ); // (d) -300.50+300.50 → ฿ 999.75
    await stepWithdrawApprove(admin, WITHDRAW_APP);             // (e)  -222.22  → ฿ 777.53
    await stepYuanWalletDebit(admin, YUAN);                     // (f)  -111.11  → ฿ 666.42

    // Final cross-check: balance equals sum(approved credits) − sum(settled
    // debits). Settled debits = shop (b) + withdraw-paid-out (e) + yuan (f).
    // The reject (c) and the withdraw-hold-then-reject (d) each net to ZERO,
    // so they MUST NOT appear in this sum — if either leaked, this assert reds.
    section("final invariant");
    const finalBal = await readBalance(admin);
    assertNum(
      "final wallettotal = approved credits − settled debits (rejected/refunded paths net ฿0)",
      finalBal,
      DEPOSIT - DEBIT - WITHDRAW_APP - YUAN,
    );
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
  console.log(
    "\n✅ GATE GREEN — tb_wallet.wallettotal moves correctly on: deposit-approve / " +
    "shop-debit / deposit-reject / withdraw-hold→reject-refund / withdraw-hold→approve / yuan-debit.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ fatal:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
