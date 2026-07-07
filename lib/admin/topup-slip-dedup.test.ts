/**
 * Unit tests for lib/admin/topup-slip-dedup.ts — the PURE dedup that collapses
 * the "ชำระเงิน" queue's เบิ้ล (a raw wallet slip + its ใบวางบิล twin for the same
 * forwarder). READ/aggregation only — no money, no settlement.
 *
 * Run:  pnpm tsx lib/admin/topup-slip-dedup.test.ts   (wired into test:unit)
 */

import { collapseWalletBillingPairs } from "./topup-slip-dedup";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// Serialize a Set for stable comparison.
const setToSorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

section("collapse — the เบิ้ล pair (wallet #52075 + FRI billing #52075)");
{
  const r = collapseWalletBillingPairs({
    walletForwarderIds: [52075],
    friForwarderSets: [{ invoiceId: 17, forwarderIds: [52075] }],
  });
  assertEq("wallet twin for the billed forwarder is suppressed", setToSorted(r.suppressedWalletFids), [52075]);
  assertEq("the FRI is kept (canonical)", r.keptFriInvoiceIds, [17]);
}

section("no collapse — unrelated wallet + FRI (different forwarders)");
{
  const r = collapseWalletBillingPairs({
    walletForwarderIds: [52075],
    friForwarderSets: [{ invoiceId: 18, forwarderIds: [99999] }],
  });
  assertEq("nothing suppressed (no overlap)", setToSorted(r.suppressedWalletFids), []);
  assertEq("the FRI is still kept", r.keptFriInvoiceIds, [18]);
}

section("mixed — only the overlapping wallet id is suppressed");
{
  const r = collapseWalletBillingPairs({
    walletForwarderIds: [52075, 61000, 52080],
    friForwarderSets: [
      { invoiceId: 17, forwarderIds: [52075, 52076] },
      { invoiceId: 22, forwarderIds: [52080] },
    ],
  });
  assertEq("both covered wallet twins suppressed, the uncovered one survives",
    setToSorted(r.suppressedWalletFids), [52075, 52080]);
  assertEq("all FRIs kept", r.keptFriInvoiceIds.sort((a, b) => a - b), [17, 22]);
}

section("edge — empty inputs");
{
  const r = collapseWalletBillingPairs({ walletForwarderIds: [], friForwarderSets: [] });
  assertEq("no suppression", setToSorted(r.suppressedWalletFids), []);
  assertEq("no kept FRIs", r.keptFriInvoiceIds, []);
}

section("edge — FRI with no items (bare header) suppresses nothing");
{
  const r = collapseWalletBillingPairs({
    walletForwarderIds: [52075],
    friForwarderSets: [{ invoiceId: 30, forwarderIds: [] }],
  });
  assertEq("wallet row survives (FRI covers no forwarder)", setToSorted(r.suppressedWalletFids), []);
  assertEq("bare FRI still kept", r.keptFriInvoiceIds, [30]);
}

section("edge — one FRI billing many forwarders covers each matching wallet slip");
{
  const r = collapseWalletBillingPairs({
    walletForwarderIds: [1, 2, 3],
    friForwarderSets: [{ invoiceId: 40, forwarderIds: [1, 2, 3, 4] }],
  });
  assertEq("all three wallet twins suppressed", setToSorted(r.suppressedWalletFids), [1, 2, 3]);
  assertEq("FRI kept once", r.keptFriInvoiceIds, [40]);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} topup-slip-dedup: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
