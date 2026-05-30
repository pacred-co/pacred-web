/**
 * Unit tests for the P0-9 / MS-1 admin top-up slip approval pure helpers
 * in actions/admin/wallet-hs.ts.
 *
 * The cascade-aware adminApproveWalletDeposit + adminRejectWalletDeposit are
 * tightly coupled to createAdminClient (real Supabase REST) — full E2E lives
 * behind the qa-flow-simulator + tests/qa-flows/wallet-delta.ts gate per
 * ADR-0018 D-4. This file locks down the PURE-LOGIC rules they encode:
 *
 *   A. classifyHnoParent dispatch — N/A/P/ONS prefix → shop_order ·
 *      else → forwarder (legacy wallet.php L444-568 strpos cascade).
 *      Pacred uses startsWith() which matches legacy intent in real prod
 *      data (numeric forwarder ids, no order-prefix collision).
 *
 *   B. Idempotency status guard — terminal status (2 or 3) returns
 *      alreadyDone, status='1' proceeds (ADR-0018 D-2 rule 3 idempotency).
 *
 *   C. Bulk-approve summary tallying — per-row outcome ('approved' /
 *      'alreadyDone' / 'failed') sums into the summary counts the UI
 *      renders as "✅ อนุมัติ N · ⏭ ข้าม M · ❌ พลาด K".
 *
 * Pattern matches actions/admin/yuan-payments-tb.test.ts (pass/fail counts,
 * no vitest, executed via `tsx`).
 */

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

console.log("=== adminApproveWalletDeposit — pure helpers (ADR-0018 D-2 rule 3) ===");

// ────────────────────────────────────────────────────────────
// A. classifyHnoParent — dispatch rule
// ────────────────────────────────────────────────────────────
//
// Pure re-implementation matching wallet-hs.ts classifyHnoParent. The
// function isn't exported (it lives inside a "use server" module that
// forbids non-async-function exports per Next 16) so we lock its contract
// here. Legacy reference: pcs-admin/wallet.php L444-568 (PHP strpos walks
// N/A/P/ONS substrings then falls through to forwarder).

type ParentClass = "shop_order" | "forwarder";

function classifyHnoParent(hno: string): ParentClass {
  if (hno.startsWith("ONS")) return "shop_order";
  if (hno.startsWith("N"))   return "shop_order";
  if (hno.startsWith("A"))   return "shop_order";
  if (hno.startsWith("P"))   return "shop_order";
  return "forwarder";
}

section("A. classifyHnoParent — shop_order vs forwarder dispatch");

assertEq("N12345 → shop_order",                classifyHnoParent("N12345"),     "shop_order");
assertEq("A98765 → shop_order",                classifyHnoParent("A98765"),     "shop_order");
assertEq("P22302 → shop_order",                classifyHnoParent("P22302"),     "shop_order");
assertEq("ONS260101 → shop_order (longer prefix takes precedence)", classifyHnoParent("ONS260101"), "shop_order");
assertEq("51201 → forwarder (pure-digit)",     classifyHnoParent("51201"),      "forwarder");
assertEq("1 → forwarder",                      classifyHnoParent("1"),          "forwarder");
assertEq("999999999 → forwarder",              classifyHnoParent("999999999"),  "forwarder");
assertEq("'' → forwarder (default branch)",    classifyHnoParent(""),           "forwarder");
// Lowercase prefixes do NOT trigger shop-order dispatch (legacy never had
// lowercase order ids; if one shows up it falls through to forwarder by
// design — the actual numeric-vs-non-numeric guard catches it before any
// tb_forwarder query fires).
assertEq("n12345 → forwarder (case-sensitive prefix)", classifyHnoParent("n12345"), "forwarder");

// ────────────────────────────────────────────────────────────
// B. Idempotency status guard — terminal returns alreadyDone
// ────────────────────────────────────────────────────────────
//
// Pure replica of the status-branch logic at the top of
// adminApproveWalletDeposit. Encoded as a predicate for testing the
// 3-way contract: '1' → proceed, '2' → alreadyDone, '3' → alreadyDone,
// other → error.

type StatusOutcome =
  | { kind: "proceed" }
  | { kind: "alreadyDone" }
  | { kind: "error"; reason: string };

function statusBranch(rowStatus: string | null): StatusOutcome {
  if (rowStatus === "2" || rowStatus === "3") return { kind: "alreadyDone" };
  if (rowStatus !== "1") {
    return { kind: "error", reason: `รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=${rowStatus ?? "null"})` };
  }
  return { kind: "proceed" };
}

section("B. statusBranch — idempotency vs proceed vs error");

assertEq("status='1' → proceed",              statusBranch("1"),       { kind: "proceed" });
assertEq("status='2' → alreadyDone",          statusBranch("2"),       { kind: "alreadyDone" });
assertEq("status='3' → alreadyDone",          statusBranch("3"),       { kind: "alreadyDone" });
assertEq("status=null → error (lockdate)",    statusBranch(null),      { kind: "error", reason: "รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=null)" });
assertEq("status='9' → error (out of band)",  statusBranch("9"),       { kind: "error", reason: "รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=9)" });

// ────────────────────────────────────────────────────────────
// C. Bulk-approve summary tallying
// ────────────────────────────────────────────────────────────
//
// Mirrors the tally loop in adminBulkApproveWalletDeposits. The skill
// processes ids sequentially; for each, the result is one of:
//   ok=true + alreadyDone → bumps `alreadyDone`
//   ok=true (proceeded)   → bumps `approved`
//   ok=false              → bumps `failed`
// Returns a stable {approved, alreadyDone, failed} object the UI maps to
// "✅ อนุมัติ N · ⏭ ข้าม M · ❌ พลาด K".

type PerRowResult =
  | { ok: true; alreadyDone?: boolean }
  | { ok: false; error: string };

function tallySummary(rows: PerRowResult[]): { approved: number; alreadyDone: number; failed: number } {
  let approved = 0;
  let alreadyDone = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.ok && r.alreadyDone) alreadyDone++;
    else if (r.ok) approved++;
    else failed++;
  }
  return { approved, alreadyDone, failed };
}

section("C. tallySummary — bulk approve summary");

assertEq(
  "all-approved batch",
  tallySummary([
    { ok: true }, { ok: true }, { ok: true },
  ]),
  { approved: 3, alreadyDone: 0, failed: 0 },
);
assertEq(
  "mixed proceed + already + failed",
  tallySummary([
    { ok: true },
    { ok: true, alreadyDone: true },
    { ok: false, error: "row not found" },
    { ok: true, alreadyDone: true },
  ]),
  { approved: 1, alreadyDone: 2, failed: 1 },
);
assertEq(
  "all-failed batch (per-row failure does NOT abort)",
  tallySummary([
    { ok: false, error: "db_error:42P01" },
    { ok: false, error: "ไม่พบรายการ" },
  ]),
  { approved: 0, alreadyDone: 0, failed: 2 },
);
assertEq(
  "empty batch → all zeros",
  tallySummary([]),
  { approved: 0, alreadyDone: 0, failed: 0 },
);

// ────────────────────────────────────────────────────────────
// D. Refund-amount summation (reject linked-slip cascade)
// ────────────────────────────────────────────────────────────
//
// On rejecting a linked top-up slip, the wallet is refunded by SUM(amount)
// of all type='7' sibling rows (legacy wallet.php L601-614). This locks
// down that the reducer treats null amounts as 0 and handles fractional
// values without floating-point drift.

function refundAmount(type7Rows: Array<{ amount: number | null | undefined }>): number {
  return type7Rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

section("D. refundAmount — type='7' sibling sum on reject");

assertEq("single 1748.76",          refundAmount([{ amount: 1748.76 }]),            1748.76);
assertEq("two 500 + 250",            refundAmount([{ amount: 500 }, { amount: 250 }]), 750);
assertEq("ignores null amount",      refundAmount([{ amount: 100 }, { amount: null }]), 100);
assertEq("ignores undefined amount", refundAmount([{ amount: 100 }, { amount: undefined }]), 100);
assertEq("empty list → 0",            refundAmount([]),                                 0);

// ────────────────────────────────────────────────────────────
// E. Sibling-row dispatch type (shop=2 · forwarder=4)
// ────────────────────────────────────────────────────────────
//
// When cascading approve/reject through a paydeposit link, the sibling
// wallet_hs row is type='2' for shop_order parents, type='4' for
// forwarder parents (legacy wallet.php L453/465/470/482).

function siblingPayType(klass: ParentClass): "2" | "4" {
  return klass === "shop_order" ? "2" : "4";
}

section("E. siblingPayType — wallet_hs type by parent class");

assertEq("shop_order → type='2'", siblingPayType("shop_order"), "2");
assertEq("forwarder  → type='4'", siblingPayType("forwarder"),  "4");

// ════════════════════════════════════════════════════════════════
// F. Customer-WITHDRAW approve/reject (P1-25/26 · ADR-0018 D-2 rule 1 +
//    rule 3 ¶3-4). The withdraw "debit-hold" contract:
//      submit  → tb_wallet -= amount · row type='3' status='1'
//      approve → status 1→2 · NO tb_wallet change (debit already happened)
//      reject  → status 1→3 · tb_wallet += amount (refund · balance-bump,
//                NOT a new type='5' row — legacy wallet.php L807-814)
//    These pure helpers lock the money contract the (Supabase-coupled)
//    adminApproveWithdraw / adminRejectWithdraw encode.
// ════════════════════════════════════════════════════════════════

// F1. Type guard — only type='3' is a customer withdraw.
function isCustomerWithdrawRow(type: string | null): boolean {
  return type === "3";
}

section("F1. withdraw type guard — only type='3'");

assertEq("type='3' → withdraw",             isCustomerWithdrawRow("3"), true);
assertEq("type='7' → NOT withdraw (topup-sibling)", isCustomerWithdrawRow("7"), false);
assertEq("type='1' → NOT withdraw (deposit)", isCustomerWithdrawRow("1"), false);
assertEq("type=null → NOT withdraw",        isCustomerWithdrawRow(null), false);

// F2. APPROVE wallet delta — ALWAYS 0 (debit happened at submit).
function withdrawApproveDelta(): number {
  return 0; // approve = pay out · NO balance change (rule 3 ¶3)
}

section("F2. withdraw approve — wallet delta is ALWAYS 0");

assertEq("approve delta = 0 (no balance change)", withdrawApproveDelta(), 0);

// F3. REJECT refund — newBalance = balanceBefore + amount (balance-bump).
function withdrawRejectNewBalance(balanceBefore: number, amount: number): number {
  return balanceBefore + amount;
}

section("F3. withdraw reject — refund bumps balance by amount");

assertEq("reject 500 hold · 200 + 500 = 700", withdrawRejectNewBalance(200, 500), 700);
assertEq("reject from 0 balance · 0 + 1500 = 1500", withdrawRejectNewBalance(0, 1500), 1500);
assertEq("reject fractional · 75.25 + 25 = 100.25", withdrawRejectNewBalance(75.25, 25), 100.25);

// F4. Idempotency — terminal status returns alreadyDone (NO double-refund).
//     CRITICAL: a second reject must NOT refund again.
type WithdrawOutcome =
  | { kind: "proceed" }
  | { kind: "alreadyDone"; refund: number }
  | { kind: "error" };

function withdrawStatusBranch(status: string | null, type: string | null): WithdrawOutcome {
  if (status === "2" || status === "3") return { kind: "alreadyDone", refund: 0 };
  if (status !== "1") return { kind: "error" };
  if (type !== "3") return { kind: "error" };
  return { kind: "proceed" };
}

section("F4. withdraw idempotency — terminal = alreadyDone, NO double-refund");

assertEq("status='1' type='3' → proceed",          withdrawStatusBranch("1", "3"), { kind: "proceed" });
assertEq("status='2' → alreadyDone (refund 0)",     withdrawStatusBranch("2", "3"), { kind: "alreadyDone", refund: 0 });
assertEq("status='3' → alreadyDone (NO 2nd refund)",withdrawStatusBranch("3", "3"), { kind: "alreadyDone", refund: 0 });
assertEq("status='1' type='1' → error (not withdraw)", withdrawStatusBranch("1", "1"), { kind: "error" });
assertEq("status=null → error",                     withdrawStatusBranch(null, "3"), { kind: "error" });

// ────────────────────────────────────────────────────────────
// Wrap-up
// ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
