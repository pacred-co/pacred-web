# Slip-review combo flow audit — one slip, many shipments (2026-07-22)

## Owner-visible bug

`submitForwarderPayment` accepts several selected `tb_forwarder.id` values and
one uploaded slip, then stores one `tb_wallet_hs` row per shipment.  The admin
dashboard and transaction history rendered those physical rows independently,
so accounting reviewed the same bank slip once per shipment.  Round 1, date
correction, reject, and round 2 also targeted one row id at a time.

Production read-only evidence: PR050 rows `105713` and `105714` pay forwarders
`52380` and `52478`; both have the exact same `imagesslip`, submit timestamp,
pending state and direct-payment shape.  Their line amounts are 415.13 and
414.87, so the one transferred payment is **830.00**, not two separate slips.

## PCS legacy truth

`pcs-admin/include/pages/wallet/w-s-deposit.php` lists one type-1 payment head.
`w-s-deposit-detail.php` then progressively reveals the workflow:

1. Save the bank-slip date and run the duplicate check (lines 301-310).
2. Re-render the same work item with status confirmation plus receipt/document
   number, previous number/date, customer tax identity and address preview
   (lines 313-469).
3. Confirm and create the receipt (lines 471+); the completed view exposes the
   issued receipt number, direct print link, and receipt-history link (270-284).

The URL does not change between legacy steps, but each submit advances the
operator to a newly revealed next stage.  The important fidelity is guided
progression, not a flat page containing unrelated controls.

## Implemented contract

- Direct multi-shipment slips group only by the persisted exact key
  `(userid, imagesslip)` plus the strict direct-import shape
  `type=4/typeservice=2/reforder2=NULL`.  Amount/date heuristics are forbidden.
- The canonical queue/history row is the first ledger id; every shipment stays
  visible inside its expandable detail.
- Group totals sum integer satang (`round(line * 100)`), then convert once for
  display.  This prevents binary-float drift and repeated decimal rounding.
- Dashboard and sidebar badges count review jobs (slips), not ledger children.
- Editing the transfer time and completing round 1 update the whole exact-slip
  group in one guarded database statement.
- Round 2 uses the existing bulk settlement engine so all forwarders advance
  and one combined receipt is issued.  A hand-picked receipt number from step 2
  is carried into that batch.
- Group rejection validates exact membership, then flips the group atomically.
- The detail page displays a visible three-step guide.  A successful receipt
  settle navigates directly to the newly issued receipt rather than a generic
  history list.

No migration and no production mutation were required.

## Verification

- `pnpm run test:wallet-slip-group`
- `pnpm tsx actions/admin/wallet-hs.test.ts`
- `pnpm tsx lib/forwarder/forwarder-collect-total.test.ts`
- `pnpm tsx lib/receipt/receipt-frozen-totals.test.ts`
- `pnpm exec tsc --noEmit`
- targeted ESLint on every changed TS/TSX file

