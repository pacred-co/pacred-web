import {
  canRenderWalletBulkCheckbox,
  findWalletBulkContainmentBlock,
  walletReceiptBatchKey,
} from "./wallet-bulk-containment";

let pass = 0;
let fail = 0;
function eq(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
}

const base = { id: 10, type: "4", reforder2: null };

eq(
  "any migration-0274 row blocks even if its bridge was deleted",
  findWalletBulkContainmentBlock(
    [{ id: 19, type: "1", reforder2: null, payment_group_id: "group-1" }],
    new Set<number>(),
  ),
  { id: 19, kind: "atomic-payment-group" },
);

eq(
  "type-1 header with paydeposit links blocks the whole bulk request",
  findWalletBulkContainmentBlock(
    [{ id: 20, type: "1", reforder2: null }, base],
    new Set([20]),
  ),
  { id: 20, kind: "linked-payment-header" },
);
eq(
  "any non-empty reforder2 child blocks even when its parent is off-page",
  findWalletBulkContainmentBlock(
    [{ id: 21, type: "4", reforder2: "20" }],
    new Set<number>(),
  ),
  { id: 21, kind: "linked-payment-child" },
);
eq(
  "empty legacy reforder2 does not misclassify a direct-slip row",
  findWalletBulkContainmentBlock(
    [{ id: 22, type: "4", reforder2: "  " }],
    new Set<number>(),
  ),
  null,
);
eq(
  "exact shared-slip direct rows remain eligible for the group action",
  findWalletBulkContainmentBlock(
    [base, { ...base, id: 11 }],
    new Set<number>(),
  ),
  null,
);

const slipA = { id: 30, userid: "PR001", imagesslip: " user/slips/a.jpg " };
eq(
  "same customer and exact physical slip share one receipt batch",
  walletReceiptBatchKey(slipA),
  walletReceiptBatchKey({ ...slipA, id: 31, imagesslip: "user/slips/a.jpg" }),
);
eq(
  "different physical slips for the same customer never share a batch",
  walletReceiptBatchKey(slipA) === walletReceiptBatchKey({ ...slipA, id: 31, imagesslip: "user/slips/b.jpg" }),
  false,
);
eq(
  "rows without a slip fall back to wallet_hs id and never coalesce",
  walletReceiptBatchKey({ ...slipA, imagesslip: null }) === walletReceiptBatchKey({ ...slipA, id: 31, imagesslip: null }),
  false,
);
eq(
  "the same slip path for another customer never collides",
  walletReceiptBatchKey(slipA) === walletReceiptBatchKey({ ...slipA, userid: "PR002" }),
  false,
);

eq(
  "ops/read-only role sees no bulk checkbox",
  canRenderWalletBulkCheckbox({ canSettle: false, status: "1", reforder2: null }),
  false,
);
eq(
  "ledger payment parent sees no bulk checkbox",
  canRenderWalletBulkCheckbox({ canSettle: true, status: "1", reforder2: null, groupKind: "ledger" }),
  false,
);
eq(
  "atomic payment header sees no bulk checkbox even when children are off-page",
  canRenderWalletBulkCheckbox({
    canSettle: true,
    status: "1",
    reforder2: null,
    paymentGroupId: "group-1",
  }),
  false,
);
eq(
  "cross-page orphan child sees no bulk checkbox",
  canRenderWalletBulkCheckbox({ canSettle: true, status: "1", reforder2: 20 }),
  false,
);
eq(
  "pending exact-slip group row is handled only from its detail group action",
  canRenderWalletBulkCheckbox({ canSettle: true, status: "1", reforder2: null, groupKind: "direct-slip" }),
  false,
);
eq(
  "standalone direct forwarder slip is hidden from the generic list action",
  canRenderWalletBulkCheckbox({
    canSettle: true,
    status: "1",
    reforder2: null,
    type: "4",
    typeservice: "2",
    reforder: "101",
  }),
  false,
);
eq(
  "terminal rows remain unselectable",
  canRenderWalletBulkCheckbox({ canSettle: true, status: "2", reforder2: null }),
  false,
);

console.log(`\n${fail === 0 ? "✅" : "❌"} wallet-bulk-containment: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
