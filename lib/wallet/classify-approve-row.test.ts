/**
 * Unit tests for lib/wallet/classify-approve-row.ts — the money-critical
 * classifier that decides whether approving a tb_wallet_hs row moves the
 * customer wallet balance, and by how much. Pure, no IO.
 *
 * Run:  pnpm tsx lib/wallet/classify-approve-row.test.ts   (wired into test:unit)
 */

import { classifyWalletHsRow } from "./classify-approve-row";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── direct-slip — the ฝากนำเข้า DIRECT-CUT shape (the bug this fix targets) ──
// type='4' typeservice='2' reforder set · reforder2 empty · no paydeposit link
// → walletDelta 0 (money in bank, wallet uninvolved · guard must not fire).
section("direct-slip (ฝากนำเข้า · direct-cut)");
assertEq(
  "type=4 ts=2 reforder set, reforder2 empty, no link → direct-slip · delta 0",
  classifyWalletHsRow(
    { type: "4", typeservice: "2", reforder: "52114", reforder2: null, amount: 2085.93 },
    { hasPaydepositLink: false },
  ),
  { shape: "direct-slip", walletDelta: 0 },
);
assertEq(
  "reforder2 empty-STRING also counts as empty → direct-slip · delta 0",
  classifyWalletHsRow(
    { type: "4", typeservice: "2", reforder: "52114", reforder2: "", amount: 100 },
    { hasPaydepositLink: false },
  ),
  { shape: "direct-slip", walletDelta: 0 },
);
assertEq(
  "reforder2 whitespace-only treated as empty → direct-slip",
  classifyWalletHsRow(
    { type: "4", typeservice: "2", reforder: "52114", reforder2: "   ", amount: 100 },
    { hasPaydepositLink: false },
  ),
  { shape: "direct-slip", walletDelta: 0 },
);

// ── wallet-funded — a GENUINE wallet debit/credit that MUST move the balance ──
// This proves the negative-wallet guard protection stays armed for the funded
// shape: a type='4' funded spend still returns delta = -amount.
section("wallet-funded (genuine balance moves · guard stays armed)");
assertEq(
  "type=4 with paydeposit link (funded/cascade) is NOT direct-slip",
  classifyWalletHsRow(
    { type: "4", typeservice: "2", reforder: "52114", reforder2: null, amount: 500 },
    { hasPaydepositLink: true },
  ).shape !== "direct-slip",
  true,
);
assertEq(
  "type=4 typeservice≠2 (not the direct shape) → wallet-funded · delta = -amount",
  classifyWalletHsRow(
    { type: "4", typeservice: "1", reforder: "52114", reforder2: null, amount: 500 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: -500 },
);
assertEq(
  "type=4 no reforder → wallet-funded · delta = -amount (guard armed)",
  classifyWalletHsRow(
    { type: "4", typeservice: "2", reforder: null, reforder2: null, amount: 646.1 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: -646.1 },
);
assertEq(
  "type=7 pending-pay debit → wallet-funded · delta = -amount",
  classifyWalletHsRow(
    { type: "7", typeservice: null, reforder: null, reforder2: null, amount: 300 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: -300 },
);
assertEq(
  "type=1 topup credit → wallet-funded · delta = +amount",
  classifyWalletHsRow(
    { type: "1", typeservice: null, reforder: null, reforder2: null, amount: 1000 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: 1000 },
);
assertEq(
  "type=2 wallet-pay credit → wallet-funded · delta = +amount",
  classifyWalletHsRow(
    { type: "2", typeservice: null, reforder: null, reforder2: null, amount: 250 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: 250 },
);
assertEq(
  "type=3 withdraw → wallet-funded · delta 0 (debit-hold at submit · no move on approve)",
  classifyWalletHsRow(
    { type: "3", typeservice: null, reforder: null, reforder2: null, amount: 500 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: 0 },
);

// ── topup-cascade — the legacy "เติม-แล้วจ่าย" cascade (settled net-zero by 4b) ──
// Recognised by reforder2 set OR a paydeposit link; delta stays 0 here (the
// cascade branch owns its math · this classifier only returns the shape).
section("topup-cascade (เติม-แล้วจ่าย · settled net-zero by cascade branch)");
assertEq(
  "reforder2 set → topup-cascade · delta 0 (do NOT change cascade math)",
  classifyWalletHsRow(
    { type: "1", typeservice: "2", reforder: "P123", reforder2: "9001", amount: 500 },
    { hasPaydepositLink: false },
  ),
  { shape: "topup-cascade", walletDelta: 0 },
);
assertEq(
  "type=1 topup WITH paydeposit link → topup-cascade · delta 0",
  classifyWalletHsRow(
    { type: "1", typeservice: null, reforder: null, reforder2: null, amount: 500 },
    { hasPaydepositLink: true },
  ),
  { shape: "topup-cascade", walletDelta: 0 },
);
assertEq(
  "a type=4 row that HAS reforder2 (cascade) is topup-cascade, not direct-slip",
  classifyWalletHsRow(
    { type: "4", typeservice: "2", reforder: "52114", reforder2: "9001", amount: 500 },
    { hasPaydepositLink: false },
  ),
  { shape: "topup-cascade", walletDelta: 0 },
);

// ── null/amount coercion edge cases ──
section("coercion edges");
assertEq(
  "string amount coerces (funded credit)",
  classifyWalletHsRow(
    { type: "1", typeservice: null, reforder: null, reforder2: null, amount: "1234.56" },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: 1234.56 },
);
assertEq(
  "null type → wallet-funded · delta 0 (unknown → no move)",
  classifyWalletHsRow(
    { type: null, typeservice: null, reforder: null, reforder2: null, amount: 100 },
    { hasPaydepositLink: false },
  ),
  { shape: "wallet-funded", walletDelta: 0 },
);

console.log(`\n${fail === 0 ? "✅" : "❌"} classify-approve-row: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
