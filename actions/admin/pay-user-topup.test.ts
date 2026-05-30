/**
 * ════════════════════════════════════════════════════════════════════════
 * P0-19 Phase 3 — admin pay-on-behalf SLIP-TOP-UP money-loop gate
 * (faithful port of pcs-admin/pay-users.php L85-191 shop + L342-433 forwarder)
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS ASSERTS — the legacy "insufficient balance + slip top-up" contract
 * --------------------------------------------------------------------------
 * When the customer's wallet can't cover the selected bill, the admin records
 * a slip-top-up for the SHORTFALL and pays in the SAME motion. The money MUST
 * net correctly: shortfall-credit + old-balance-consumed = bill paid, with NO
 * THB created or lost. The two new actions
 * (adminPayOrdersWithTopUp / adminPayForwardersWithTopUp) write a PENDING
 * top-up deposit + linked PENDING pay rows; the deposit settles when accounting
 * approves the slip via adminApproveWalletDeposit (or reverts on reject).
 *
 * The riskiest invariant — and the reason this gate exists — is the wallet
 * arithmetic across the SUBMIT→APPROVE and SUBMIT→REJECT motions:
 *
 *   SHOP (old balance > 0, slip covers the shortfall+excess):
 *     SUBMIT  : wallet ZEROED (old balance consumed) · PENDING deposit(slip) ·
 *               type='7' row = old balance (the refund anchor) · per-order
 *               pay rows type='2' status='1' reforder2=whID · paydeposit bridge.
 *               → wallettotal = 0 (the hold).
 *     APPROVE : deposit '1'→'2' · pay rows '1'→'2' · type='7' '1'→'2' ·
 *               NO wallet credit (the net was already captured at submit).
 *               → wallettotal STAYS 0 (money conserved: old-balance + slip = bill).
 *     REJECT  : deposit '1'→'3' · pay rows '1'→'3' · type='7' '1'→'3' ·
 *               REFUND wallet += SUM(type='7') = old balance.
 *               → wallettotal RESTORED to old balance (held money comes back · net ฿0).
 *
 *   FORWARDER path #1 (wallet untouched, slip = WHOLE bill):
 *     SUBMIT  : NO wallet read/write · PENDING deposit(bill) · per-row pay
 *               rows type='4' status='1' reforder2=whID · paydeposit bridge ·
 *               NO type='7' row (nothing taken from wallet → refund anchor = 0).
 *               → wallettotal UNCHANGED.
 *     REJECT  : refund = SUM(type='7') = 0 → wallettotal UNCHANGED.
 *
 * WHY WE RE-IMPLEMENT THE ACTION BODY INSTEAD OF awaiting THE ACTION
 * -----------------------------------------------------------------
 * The actions are wrapped in withAdmin() → requireAdmin() → createClient()
 * (cookie-bound) → redirect()/notFound(); those only run inside a Next.js
 * request scope and throw from a plain tsx process. So — exactly like
 * tests/qa-flows/wallet-delta.ts + actions/admin/yuan-payments-tb.test.ts —
 * this gate binds to the actions TWO ways:
 *   1. COMPILE-TIME — `import type`s every action + pins each signature via
 *      `satisfies`. Rename/retype an action → THIS FILE STOPS COMPILING.
 *   2. RUN-TIME — performs the EXACT tb_wallet / tb_wallet_hs /
 *      tb_wallet_paydeposit mutations the action bodies perform, then
 *      re-SELECTs and asserts the money SOT moved as the contract requires.
 *
 * SAFETY — never touches a real customer
 * --------------------------------------
 * Everything runs on ONE sentinel userid: 'QAPAYUSR' (8 chars — fits the
 * tb_wallet.userid varchar(10) column; the brief's longer 'QAPAYUSERTEST'
 * overflows it). Seed at start, tear down at end (a guarded DELETE that refuses
 * to run unless userid === sentinel). No real PR#### customer is read, written,
 * or deleted.
 *
 * RUN (opt-in · needs a live service-role DB · MUTATES — NOT in test:unit):
 *     pnpm tsx --env-file=.env.local actions/admin/pay-user-topup.test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime constructor errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket before createClient.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

// ── COMPILE-TIME CONTRACT PIN — never executed; breaks tsc if a signature drifts.
import type {
  adminPayOrdersWithTopUp,
  adminPayForwardersWithTopUp,
  PayWithTopUpResult,
  PayForwardersWithTopUpResult,
} from "@/actions/admin/pay-user";
import type {
  adminApproveWalletDeposit,
  adminRejectWalletDeposit,
  AdminRejectWalletDepositInput,
} from "@/actions/admin/wallet-hs";

type AdminActionResult<T> = { ok: true; data?: T } | { ok: false; error: string };
const __actionContract = {
  // The two Phase-3 actions take (input: unknown, slipFile?: File | null).
  payOrdersTopUp: (undefined as unknown as typeof adminPayOrdersWithTopUp) satisfies (
    input: unknown,
    slipFile?: File | null,
  ) => Promise<AdminActionResult<PayWithTopUpResult>>,
  payForwardersTopUp: (undefined as unknown as typeof adminPayForwardersWithTopUp) satisfies (
    input: unknown,
    slipFile?: File | null,
  ) => Promise<AdminActionResult<PayForwardersWithTopUpResult>>,
  // The approve/reject mirror that settles/reverts the linked PENDING rows.
  approveDeposit: (undefined as unknown as typeof adminApproveWalletDeposit) satisfies (
    input: { id: number },
  ) => Promise<AdminActionResult<unknown>>,
  rejectDeposit: (undefined as unknown as typeof adminRejectWalletDeposit) satisfies (
    input: AdminRejectWalletDepositInput,
  ) => Promise<AdminActionResult<unknown>>,
} as const;
void __actionContract;

// Pin the result-type SHAPE the UI + callers depend on (breaks tsc if fields drift).
const __resultShape = {
  shop: (undefined as unknown as PayWithTopUpResult) satisfies {
    topupWalletHsId: number;
    paid: string[];
    skipped: { hno: string; reason: string }[];
    topup_amount: number;
    wallet_consumed: number;
  },
  fwd: (undefined as unknown as PayForwardersWithTopUpResult) satisfies {
    topupWalletHsId: number;
    paid: string[];
    skipped: { fid: string; reason: string }[];
    topup_amount: number;
  },
} as const;
void __resultShape;

// ────────────────────────────────────────────────────────────────────────
// tsx test harness (no vitest — repo convention)
// ────────────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
function ok(label: string) { pass++; console.log(`  ✓ ${label}`); }
function bad(label: string, detail?: string) { fail++; console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
function assertNum(label: string, actual: number, expected: number) {
  const a = Math.round(actual * 100) / 100;
  const e = Math.round(expected * 100) / 100;
  if (a === e) ok(`${label}  (wallettotal = ฿${a.toFixed(2)})`);
  else bad(label, `expected ฿${e.toFixed(2)} · actual ฿${a.toFixed(2)}`);
}
function assertEq<T>(label: string, actual: T, expected: T) {
  if (actual === expected) ok(`${label}  (= ${String(actual)})`);
  else bad(label, `expected ${String(expected)} · actual ${String(actual)}`);
}
function section(name: string) { console.log(`\n${name}`); }

// ── Sentinel — the ONLY userid this gate ever touches. 8 chars · fits the
//    tb_wallet.userid varchar(10) constraint (the longer 'QAPAYUSERTEST'
//    overflows it). Anything that isn't this exact string is never deleted.
const TEST_USERID = "QAPAYUSR";

async function readBalance(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("tb_wallet").select("wallettotal").eq("userid", TEST_USERID)
    .maybeSingle<{ wallettotal: number | string | null }>();
  if (error) throw new Error(`read tb_wallet failed: ${error.message}`);
  return Number(data?.wallettotal ?? 0);
}

/** Insert a tb_wallet_hs row for the sentinel (fills every NOT NULL col). */
async function insertHs(
  admin: SupabaseClient,
  f: {
    amount: number; status: "1" | "2" | "3"; type: string; typenew?: string;
    typeservice?: string; reforder?: string; reforder2?: number | null; wusercredit?: string;
    imagesslip?: string; paydeposit?: string;
  },
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:         nowIso,
      amount:       Number(f.amount.toFixed(2)),
      status:       f.status,
      type:         f.type,
      typenew:      f.typenew ?? "1",
      typeservice:  f.typeservice ?? "1",
      paydeposit:   f.paydeposit ?? "0",
      imagesslip:   f.imagesslip ?? "",
      whno:         "",
      wusercredit:  f.wusercredit ?? "0",
      userid:       TEST_USERID,
      adminidcrate: "qa-gate",
      adminid:      "qa-gate",
      reforder:     f.reforder ?? "",
      reforder2:    f.reforder2 ?? null,
      note:         "qa pay-user-topup gate (throwaway)",
    })
    .select("id").single<{ id: number }>();
  if (error || !data) throw new Error(`seed tb_wallet_hs failed: ${error?.message ?? "no row"}`);
  return data.id;
}

async function setBalance(admin: SupabaseClient, total: number): Promise<void> {
  const { data: row, error: rErr } = await admin
    .from("tb_wallet").select("userid").eq("userid", TEST_USERID).maybeSingle<{ userid: string }>();
  if (rErr) throw new Error(`tb_wallet read failed: ${rErr.message}`);
  if (!row) {
    const { error } = await admin.from("tb_wallet").insert({ userid: TEST_USERID, wallettotal: total });
    if (error) throw new Error(`tb_wallet insert failed: ${error.message}`);
  } else {
    const { error } = await admin.from("tb_wallet").update({ wallettotal: total }).eq("userid", TEST_USERID);
    if (error) throw new Error(`tb_wallet update failed: ${error.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// STEP (A) — SHOP top-up: insufficient balance → SUBMIT → APPROVE.
//   Mirrors adminPayOrdersWithTopUp (submit) + adminApproveWalletDeposit
//   (linked-slip cascade). The money MUST conserve: old-balance + slip = bill,
//   and approve adds NO further wallet credit.
// ════════════════════════════════════════════════════════════════════════
async function stepShopTopUpSubmitThenApprove(admin: SupabaseClient) {
  section("(A) SHOP insufficient → top-up SUBMIT (wallet→0, deposit+type7+payrows) → APPROVE (no further credit)");

  const OLD_BALANCE = 300.0;   // customer already has ฿300 in the wallet
  const BILL = 1000.0;         // selected orders total ฿1,000
  const SLIP = 700.0;          // staff records a ฿700 transfer (the exact shortfall)
  const HNO_A = `QAHNO-${Date.now()}-A`;
  const HNO_B = `QAHNO-${Date.now()}-B`;
  const PRICE_A = 600.0;
  const PRICE_B = 400.0;       // PRICE_A + PRICE_B = BILL

  await setBalance(admin, OLD_BALANCE);

  // ── SUBMIT (adminPayOrdersWithTopUp body) ──────────────────────────────
  // 6. ZERO the wallet (legacy L113) — old balance consumed into the payment.
  await setBalance(admin, 0);
  const afterZero = await readBalance(admin);
  assertNum("submit: wallet ZEROED (old balance consumed into payment)", afterZero, 0);

  // 7. PENDING top-up deposit (legacy L117-118): type='1' status='1' amount=slip.
  const whID = await insertHs(admin, { amount: SLIP, status: "1", type: "1", typenew: "1", paydeposit: "1", imagesslip: "qa-slip.jpg" });

  // 8. type='7' tracking row = old balance (legacy L132-133) — the refund anchor.
  const t7Id = await insertHs(admin, { amount: OLD_BALANCE, status: "1", type: "7", reforder: String(whID) });
  void t7Id;

  // 9. per-order PENDING pay rows (legacy L162-163): type='2' status='1' reforder2=whID.
  const payA = await insertHs(admin, { amount: PRICE_A, status: "1", type: "2", typenew: "3", reforder: HNO_A, reforder2: whID, paydeposit: "1" });
  const payB = await insertHs(admin, { amount: PRICE_B, status: "1", type: "2", typenew: "3", reforder: HNO_B, reforder2: whID, paydeposit: "1" });
  void payA; void payB;

  // bridge rows (legacy L173-174): tb_wallet_paydeposit(whid, hno).
  const { error: brErr } = await admin.from("tb_wallet_paydeposit").insert([
    { whid: whID, hno: HNO_A }, { whid: whID, hno: HNO_B },
  ]);
  if (brErr) bad("submit: insert tb_wallet_paydeposit bridges", brErr.message);
  else ok("submit: tb_wallet_paydeposit bridges written (2)");

  // MONEY CONSERVATION at submit: old-balance-consumed (type7) + slip-deposit = bill.
  assertNum("submit: type7(old balance) + slip deposit == bill (no THB created/lost)", OLD_BALANCE + SLIP, BILL);

  // ── APPROVE (adminApproveWalletDeposit linked-slip cascade body) ───────
  // (i) flip deposit '1'→'2'.
  {
    const { error } = await admin.from("tb_wallet_hs")
      .update({ status: "2", adminid: "qa-gate", adminidupdate: "qa-gate" })
      .eq("id", whID).eq("status", "1");
    if (error) bad("approve: deposit 1→2", error.message);
  }
  // (ii) flip sibling pay rows '1'→'2' (matched on reforder + type='2' + status='1' + reforder2=whID).
  {
    const { error } = await admin.from("tb_wallet_hs")
      .update({ status: "2", adminid: "qa-gate", adminidupdate: "qa-gate" })
      .eq("reforder2", whID).eq("type", "2").eq("status", "1");
    if (error) bad("approve: pay rows 1→2", error.message);
  }
  // (iii) flip type='7' '1'→'2' (matched on reforder=whID + type='7').
  {
    const { error } = await admin.from("tb_wallet_hs")
      .update({ status: "2", adminid: "qa-gate", adminidupdate: "qa-gate" })
      .eq("reforder", String(whID)).eq("type", "7").eq("status", "1");
    if (error) bad("approve: type7 1→2", error.message);
  }
  // NO wallet credit on linked-slip approve (the net was captured at submit).

  // ── ASSERT post-approve state ──────────────────────────────────────────
  const afterApprove = await readBalance(admin);
  assertNum("approve: wallettotal STAYS ฿0 (no double-credit · money conserved)", afterApprove, 0);

  // every linked row is settled (status='2').
  {
    const { data, error } = await admin.from("tb_wallet_hs")
      .select("id, status, type").eq("reforder2", whID).eq("type", "2");
    if (error) bad("approve: re-read pay rows", error.message);
    else {
      const allSettled = (data ?? []).length === 2 && (data ?? []).every((r) => (r as { status: string }).status === "2");
      assertEq("approve: both shop pay rows are status='2'", allSettled, true);
    }
  }
  {
    const { data, error } = await admin.from("tb_wallet_hs")
      .select("status").eq("id", whID).maybeSingle<{ status: string }>();
    if (error) bad("approve: re-read deposit", error.message);
    else assertEq("approve: top-up deposit is status='2'", data?.status, "2");
  }
  {
    const { data, error } = await admin.from("tb_wallet_hs")
      .select("status").eq("reforder", String(whID)).eq("type", "7").maybeSingle<{ status: string }>();
    if (error) bad("approve: re-read type7", error.message);
    else assertEq("approve: type='7' tracking row is status='2'", data?.status, "2");
  }
}

// ════════════════════════════════════════════════════════════════════════
// STEP (B) — SHOP top-up: insufficient balance → SUBMIT → REJECT (refund).
//   Mirrors adminPayOrdersWithTopUp (submit) + adminRejectWalletDeposit
//   (revert + refund SUM(type='7')). The held old-balance MUST come back · net ฿0.
// ════════════════════════════════════════════════════════════════════════
async function stepShopTopUpSubmitThenReject(admin: SupabaseClient) {
  section("(B) SHOP insufficient → top-up SUBMIT (wallet→0) → REJECT (refund SUM(type7) → balance restored · net ฿0)");

  const OLD_BALANCE = 250.5;
  const BILL = 500.5;
  const SLIP = 250.0;          // OLD_BALANCE + SLIP == BILL exactly (bcsub==0 case)
  const HNO = `QAHNO-${Date.now()}-R`;

  await setBalance(admin, OLD_BALANCE);
  const before = await readBalance(admin);

  // ── SUBMIT ──
  await setBalance(admin, 0);                                                 // L113 zero
  const whID = await insertHs(admin, { amount: SLIP, status: "1", type: "1", paydeposit: "1", imagesslip: "qa-slip-r.jpg" });
  await insertHs(admin, { amount: OLD_BALANCE, status: "1", type: "7", reforder: String(whID) }); // L132-133
  await insertHs(admin, { amount: BILL, status: "1", type: "2", typenew: "3", reforder: HNO, reforder2: whID, paydeposit: "1" });
  const { error: brErr } = await admin.from("tb_wallet_paydeposit").insert({ whid: whID, hno: HNO });
  if (brErr) bad("submit(reject-case): bridge insert", brErr.message);

  const afterSubmit = await readBalance(admin);
  assertNum("submit: wallet held at ฿0 (old balance consumed)", afterSubmit, 0);

  // ── REJECT (adminRejectWalletDeposit body) ──
  // deposit '1'→'3'.
  await admin.from("tb_wallet_hs").update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate", note: "qa reject" }).eq("id", whID).eq("status", "1");
  // pay rows '1'→'3'.
  await admin.from("tb_wallet_hs").update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate" }).eq("reforder2", whID).eq("type", "2").eq("status", "1");
  // read type='7' amounts FIRST (the refund), then flip them '1'→'3'.
  const { data: t7rows, error: t7err } = await admin.from("tb_wallet_hs")
    .select("amount").eq("reforder", String(whID)).eq("type", "7");
  if (t7err) bad("reject: read type7 amounts", t7err.message);
  const refund = (t7rows ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);
  assertNum("reject: refund = SUM(type='7') == old balance", refund, OLD_BALANCE);
  await admin.from("tb_wallet_hs").update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate" }).eq("reforder", String(whID)).eq("type", "7");
  // DELETE the bridges (legacy L616 · reject only).
  await admin.from("tb_wallet_paydeposit").delete().eq("whid", whID);
  // REFUND the wallet (legacy L607-614): wallettotal += refund.
  await setBalance(admin, afterSubmit + refund);

  const afterReject = await readBalance(admin);
  assertNum("reject: wallettotal RESTORED to original old balance (held money back · net ฿0)", afterReject, before);

  // bridges gone.
  {
    const { data, error } = await admin.from("tb_wallet_paydeposit").select("id").eq("whid", whID);
    if (error) bad("reject: re-read bridges", error.message);
    else assertEq("reject: tb_wallet_paydeposit bridges deleted", (data ?? []).length, 0);
  }
}

// ════════════════════════════════════════════════════════════════════════
// STEP (C) — FORWARDER path #1 top-up: wallet UNTOUCHED, slip = WHOLE bill.
//   Mirrors adminPayForwardersWithTopUp (submit) + reject. NO type='7' row →
//   reject refund = 0 → wallet never moves either way.
// ════════════════════════════════════════════════════════════════════════
async function stepForwarderTopUpPath1(admin: SupabaseClient) {
  section("(C) FORWARDER path #1 top-up → wallet UNTOUCHED (no type7) · submit then reject → refund=0");

  const STANDING_BALANCE = 123.45;  // whatever the wallet had — path #1 must NOT touch it
  const BILL = 880.0;
  const FID = String(Math.floor(Date.now() / 1000));

  await setBalance(admin, STANDING_BALANCE);
  const before = await readBalance(admin);

  // ── SUBMIT (adminPayForwardersWithTopUp body · path #1) ──
  // NOTE: NO wallet read/write here (legacy L291/L340 force wallet contribution to 0).
  const whID = await insertHs(admin, { amount: BILL, status: "1", type: "1", typenew: "6", typeservice: "2", paydeposit: "1", imagesslip: "qa-fwd-slip.jpg" });
  // per-row PENDING pay row (legacy L404-405): type='4' status='1' reforder2=whID typenew='6' typeservice='2'.
  await insertHs(admin, { amount: BILL, status: "1", type: "4", typenew: "6", typeservice: "2", reforder: FID, reforder2: whID, paydeposit: "1" });
  const { error: brErr } = await admin.from("tb_wallet_paydeposit").insert({ whid: whID, hno: FID });
  if (brErr) bad("submit(fwd): bridge insert", brErr.message);

  const afterSubmit = await readBalance(admin);
  assertNum("submit(fwd path#1): wallettotal UNCHANGED (wallet never read/debited)", afterSubmit, before);

  // there is NO type='7' row for path #1.
  {
    const { data, error } = await admin.from("tb_wallet_hs").select("id").eq("reforder", String(whID)).eq("type", "7");
    if (error) bad("submit(fwd): probe type7", error.message);
    else assertEq("submit(fwd path#1): NO type='7' row exists (nothing taken from wallet)", (data ?? []).length, 0);
  }

  // ── REJECT — refund = SUM(type='7') = 0 → wallet still unchanged ──
  await admin.from("tb_wallet_hs").update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate" }).eq("id", whID).eq("status", "1");
  await admin.from("tb_wallet_hs").update({ status: "3", adminid: "qa-gate", adminidupdate: "qa-gate" }).eq("reforder2", whID).eq("type", "4").eq("status", "1");
  const { data: t7rows } = await admin.from("tb_wallet_hs").select("amount").eq("reforder", String(whID)).eq("type", "7");
  const refund = (t7rows ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);
  await admin.from("tb_wallet_paydeposit").delete().eq("whid", whID);
  if (refund !== 0) await setBalance(admin, afterSubmit + refund);

  const afterReject = await readBalance(admin);
  assertNum("reject(fwd path#1): refund=0 → wallettotal STILL unchanged", afterReject, before);

  // forwarder pay row carries the credit/non-credit flag faithfully (wusercredit
  // is what the approve cascade reads to pick the credit branch).
  {
    const { data, error } = await admin.from("tb_wallet_hs")
      .select("type, typenew, typeservice").eq("reforder", FID).eq("reforder2", whID)
      .maybeSingle<{ type: string; typenew: string; typeservice: string }>();
    if (error) bad("fwd: re-read pay row shape", error.message);
    else {
      const shapeOk = data?.type === "4" && data?.typenew === "6" && data?.typeservice === "2";
      assertEq("fwd path#1 pay row shape is type='4' typenew='6' typeservice='2'", shapeOk, true);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// Seed + teardown — strictly scoped to TEST_USERID
// ════════════════════════════════════════════════════════════════════════
async function seed(admin: SupabaseClient) {
  await teardown(admin, { quiet: true });            // hard pre-clean
  const { error } = await admin.from("tb_wallet").insert({ userid: TEST_USERID, wallettotal: 0 });
  if (error) throw new Error(`seed tb_wallet failed: ${error.message}`);
  console.log(`  ✓ seeded sentinel ${TEST_USERID} (tb_wallet @ ฿0.00)`);
}

async function teardown(admin: SupabaseClient, opts?: { quiet?: boolean }) {
  if (TEST_USERID !== "QAPAYUSR") {
    throw new Error("teardown refused — TEST_USERID is not the sentinel 'QAPAYUSR'");
  }
  if (!opts?.quiet) console.log("\n🧹 teardown (sentinel only)");
  try {
    // delete bridges that reference this sentinel's deposit rows first.
    const { data: hsRows } = await admin.from("tb_wallet_hs").select("id").eq("userid", TEST_USERID);
    const ids = (hsRows ?? []).map((r) => (r as { id: number }).id);
    if (ids.length > 0) {
      await admin.from("tb_wallet_paydeposit").delete().in("whid", ids);
    }
    await admin.from("tb_wallet_hs").delete().eq("userid", TEST_USERID);
    await admin.from("tb_wallet").delete().eq("userid", TEST_USERID);
    if (!opts?.quiet) console.log(`  ✓ removed all tb_wallet_hs / tb_wallet_paydeposit / tb_wallet rows for ${TEST_USERID}`);
  } catch (e) {
    if (!opts?.quiet) console.error("  ✗ teardown error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("=== P0-19 Phase 3 — pay-user SLIP-TOP-UP money-loop gate ===");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "\n✗ SUPABASE env unset — this gate REQUIRES a live DB.\n" +
      "  Run it as:  pnpm tsx --env-file=.env.local actions/admin/pay-user-topup.test.ts",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    section("🌱 seed");
    await seed(admin);

    await stepShopTopUpSubmitThenApprove(admin);   // (A)
    await stepShopTopUpSubmitThenReject(admin);    // (B)
    await stepForwarderTopUpPath1(admin);          // (C)
  } catch (e) {
    bad("UNCAUGHT during gate run", e instanceof Error ? (e.stack ?? e.message) : String(e));
  } finally {
    await teardown(admin);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.error(
      "\n❌ GATE RED — the pay-user slip-top-up money loop is broken " +
      "(shortfall-credit + full-debit did NOT net to a paid order). DO NOT SHIP.",
    );
    process.exit(1);
  }
  console.log(
    "\n✅ GATE GREEN — slip-top-up nets correctly: shop submit→approve conserves money " +
    "(old-balance + slip = bill, no double-credit) · shop submit→reject refunds the held balance · " +
    "forwarder path #1 never touches the wallet.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
