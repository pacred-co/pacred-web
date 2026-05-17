# 🔎 Revenue-Flow Gap Hunt — quote → order → billed → closed

> **Produced:** 2026-05-17 · **Scope:** the cargo + freight money path end-to-end.
> **Method:** traced live code (`actions/service-order.ts`, `forwarder.ts`,
> `payment.ts`, `wallet.ts`, `actions/admin/*`, `lib/warehouse/*`, migrations
> 0033–0061) against the legacy decode (`docs/research/legacy-*`).
>
> **Excludes already-planned work** — every gap below is NOT in
> [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) (R-1…R-19) or
> [`PORT_PLAN.md`](../PORT_PLAN.md) Part V (V-A…V-H). The known P0/P1 money
> bugs (P0-1, P0-2, P1-1…P1-5) are **fixed** — migration 0061 + the admin-client
> rewrite landed. This doc finds what those audits did **not** cover.

---

## 1. Summary

The spine is built but the **stages are not chained**. Pacred-web has three
container systems (`forwarders`, `cargo_containers`/`cargo_shipments`,
`freight_shipments`) and three money tables (`wallet_transactions`,
`freight_invoice_payments`, `forwarder_cost_adjustments`) — each works in
isolation, **none signals the next**. The result: the flow has no automatic
progression. A container marked `delivered` never closes the customer's order;
an order paid never appears on a container; a freight job marked `delivered`
never produces an invoice. Every hand-off is a manual admin click, and several
hand-offs **have no screen at all** — they only exist as a status the staffer
forgets to set.

The single scariest hole: **the cargo spine (`cargo_*`) is write-only.**
`setContainerStatus` (warehouse.ts) flips a container through `packing → sealed
→ … → closed` and logs history, but the linked `forwarders.status` /
`service_orders.status` are **never touched**. The customer's `/service-import`
page reads `forwarders.status`, which is frozen at `shipped_china` from the
moment they paid. The "track my shipment" promise is wired to a table nothing
updates — this is the legacy "ของอยู่ไหน" leak **reproduced inside Pacred**, not
fixed by it. R-1 plans the *board*; it does not plan the *propagation*.

Biggest unplanned stage gaps, in order: **(A) arrival→billing has no
container-attach gate** (legacy's #1 revenue freeze, only half-planned), **(B)
no deposit / partial-payment model** (legacy bills in 2+ rounds; Pacred's wallet
debit is all-or-nothing), **(C) refund has no money path** (statuses exist,
`kind='refund'` is in the CHECK, but nothing ever writes a credit row), **(D)
the freight chain quote→shipment→invoice→receipt is a set of disconnected
stubs**.

---

## 2. Flow-stage gap map

Stage-by-stage. Severity: 🔴 breaks revenue · 🟠 daily pain · 🟡 fix soon.
Effort: S ≤3d · M 1–2wk · L 2–4wk.

### Stage 1 — Quote / lead (cargo + freight)
- 🟠 **No quote→order continuity for `service-import` (cargo).** `previewPrice`
  (forwarder.ts) computes a price but returns nothing persistent; `createForwarder`
  recomputes from scratch. A customer who gets quoted ฿X then places the order
  can be charged ฿Y if a rate changed in between — **no price-lock token, no
  quote record**. (R-3/R-5 plan a freight quote builder + lead inbox; they do
  **not** cover persisting the *cargo* `previewPrice` result as a lockable
  quote.) · effort M · dep: none.
- 🟡 **`getCurrentYuanRate` reads `process.env`, `placeServiceOrder` reads the
  `settings` table.** Two different rate sources for the same CNY→THB number on
  the same flow → the yuan-transfer quote and the shop-order total can disagree.
  V-A4 plans rate *validation*; it does not plan *unifying the source*. · S.

### Stage 2 — Order placement
- 🟠 **`placeServiceOrder` item-insert rollback marks the header `cancelled`,
  never deletes it.** Comment admits it ("so the row doesn't dangle"). Every
  failed cart submit leaves an orphan `cancelled` order with 0 items. These
  pollute `/admin/service-orders`, the debtors report, and any order-count KPI.
  No cleanup job. · 🟡 · S.
- 🟠 **No stock / availability / China-shop validation.** `service_order_items`
  snapshots a `url` + `price_cny` the customer typed; nothing re-checks the
  product exists or the price is current before the order is billed. Legacy did
  this human-side in chat. No system gate, not planned. · 🟡 · M.

### Stage 3 — Payment
- 🔴 **No deposit / partial-payment model.** `payServiceOrderFromWallet` /
  `payForwarderFromWallet` / `adminMark*Paid` all debit **the full total in one
  shot** and flip status in one step. The legacy accounting flow
  ([`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md)
  §3, §6.4) bills freight/cargo in **multiple rounds** — มัดจำ (deposit) up
  front, balance on arrival; the rate can move between rounds. Pacred cannot
  represent "50% paid". `freight_invoice_payments` *can* hold partial rows, but
  the **cargo `wallet_transactions` path cannot** — its idempotency guard
  (0049/0061 partial-unique on `reference_id`) enforces **exactly one** completed
  `order_payment`/`import_payment` per order. A deposit + balance would be two
  rows → the second hits 23505 and is silently swallowed as "already paid". So
  the DB guard that fixes double-debit **also forbids legitimate split
  payment**. Not planned anywhere. · effort L · dep: needs an ADR.
- 🟠 **`wallet_transactions` has no `freight_invoice` reference type.** Confirmed
  in `freight-invoice-payments.ts` (the `method='wallet'` branch is a bookkeeping
  note that does **not** debit the wallet) and migration 0007's `reference_type`
  CHECK. A customer with wallet balance **cannot pay a freight invoice from it** —
  freight and the wallet are separate money universes. Flagged in-code as
  "follow-up V-E7.1" but **V-E7.1 is not a row in Part V**. · M.
- 🟡 **PromptPay deposit slip is never matched to an amount.** `createDeposit`
  stores `slip_url` + a customer-typed `amount`; admin approval (`/admin/wallet`)
  trusts the typed number. Nothing OCRs or cross-checks the slip. Legacy had the
  identical hole (accounting §9.2). A customer can type ฿10,000, attach a ฿100
  slip. Not planned. · M.

### Stage 4 — Warehouse intake
- 🔴 **Container status never propagates to the order.** `setContainerStatus`
  (warehouse.ts → `lib/warehouse/containers.ts`) updates `cargo_containers` +
  writes `cargo_container_status_history`, but **never updates the
  `forwarders` / `service_orders` rows** the shipment is linked to (FK
  `cargo_shipments.forwarder_f_no` / `service_order_h_no` exists since 0033 but
  is read-only for status). The customer portal reads `forwarders.status`. So a
  container can be `arrived` / `closed` while the customer still sees
  `shipped_china`. R-1 (status board) plans a *new* board UI; it does **not**
  plan back-propagating container state onto the order the customer actually
  watches. This is the legacy leak rebuilt. · effort M · dep: status-mapping ADR.
- 🟠 **Two parallel container tables, no bridge.** `actions/admin/containers.ts`
  writes a `containers` table (statuses `preparing…delivered`); `lib/warehouse/`
  writes `cargo_containers` (statuses `packing…closed`). `forwarders.container_id`
  points at `containers`; `cargo_shipments.cargo_container_id` points at
  `cargo_containers`. **The same physical container is two unrelated rows.** Any
  board built on one is blind to data entered in the other. Neither audit names
  this — it is structural debt that will silently corrupt R-1/R-10. · M.

### Stage 5 — Transport / in-transit
- 🟠 **Demurrage / container-rent clock has no record at all.** PACRED-GAP §1.8
  routes this to R-8, but R-8 is scoped as *driver scheduling* — there is no
  field anywhere for "rent accrues from date X at ฿Y/day", no line item, no way
  to bill it. The fee exists in legacy (`ค่าเร้น`) and lands on the customer.
  Currently it would have to be a manual `forwarder_cost_adjustment` with
  `kind='other'` — workable but unmodelled and uncomputed. · 🟡 · M.

### Stage 6 — Arrival
- 🔴 **No "ready to bill" gate keyed on a container number.** Legacy's
  most-repeated revenue failure — *"กดให้ลูกค้าชำระเงินไม่ได้เลยครับ"*, billing
  frozen until a container number is attached
  ([`legacy-chat-dev-it-momo`](legacy-chat-dev-it-momo.md) DI-4/DI-5). Pacred has
  the **inverse** problem: there is **no gate at all**. `adminMarkForwarderPaid`
  /`payForwarderFromWallet` happily charge a forwarder with `tracking_chn` =
  NULL, `container_id` = NULL, `volume_cbm` = whatever was typed at order time.
  V-D1 plans surfacing the *CBM diff*; V-D3 plans *linking* the carrier
  container no. Neither makes "container attached + final CBM confirmed" a
  **precondition of billing**. Cargo bills on order-time estimates, not arrival
  reality → systematic over/under-collection. · effort M · dep: V-D1/V-D3.

### Stage 7 — Billing / invoice
- 🔴 **The freight chain quote→shipment→invoice→receipt is four disconnected
  stubs.** Traced in code: `freight_quotes` "convert-to-shipment" is a **stub**
  (V-E6 ships V1 with the convert wired to nothing — confirmed in PORT_PLAN
  V-E6 note); `adminCreateFreightShipment` does not read a quote;
  `adminIssueFreightInvoice` snapshots shipment figures but **nothing auto-creates
  an invoice when a shipment is marked `delivered`** (`adminMarkFreightDelivered`
  just flips status). So a freight job can reach `delivered` with **no invoice**
  — revenue silently never billed. The "convert" + "delivered→invoice" hand-offs
  are missing. V-E1/E6/E7 each ship a piece; **the chain between them is the
  gap.** · effort M · dep: V-E1/E6/E7.
- 🟠 **`cargo_shipments` has no invoice/receipt path of its own.** It bridges
  `forwarders` + `service_orders` for the *container* view, but billing still
  happens on the parent `forwarders.total_price`. If two forwarders share a
  container and one splits (DI-6 qty→1 class), there is no per-shipment billing
  record to reconcile. · 🟡 · M.
- 🟡 **`billing_entity` (AXELRA vs NNB) is on no table.** PACRED-GAP §1.8 flags
  the two-legal-entity ambiguity as "Partly — needs explicit `billing_entity`",
  but no Part-V/R task **adds the column**. `tax_invoices`, `freight_invoices`,
  receipts all print one hardcoded entity. RD-compliance risk if the wrong tax
  ID prints. · S.

### Stage 8 — Receipt
- 🟠 **Freight WHT gate is a permanent no-op.** `getFreightReceiptGate`
  (freight-invoice-payments.ts) always returns `{blocked:false}` because
  `withholding_tax_entries` (0044) has no `freight_invoice_id` column. A juristic
  freight customer who deducts WHT can pull a receipt with **no 50-ทวิ cert on
  file** — the exact leak ADR-0015 closed for cargo, still open for freight. The
  in-code hook calls it "V-A6.1"; **V-A6.1 is not a tracked row.** · M.
- 🟡 **Receipt download is not idempotent against re-issue.** `tax_invoices` is
  guarded (0061 P1-4), but `freight_invoices` issuance only checks "no existing
  non-cancelled invoice" with a check-then-act SELECT and **no partial-unique
  index** — concurrent `adminIssueFreightInvoice` on one shipment can reserve two
  `invoice_no` serials. P1-4 fixed this for `tax_invoices`; `freight_invoices`
  has the same shape and was **not** given the same index. · S.

### Stage 9 — Close / reconcile
- 🔴 **No order ever auto-closes.** `service_orders` terminal state is
  `completed`; nothing sets it. `adminMarkServiceOrderPaid` flips to `ordered`;
  there is no `…→completed` action and no trigger from container `delivered`.
  Every order sits in `ordered` forever unless an admin manually edits status.
  Same for `forwarders` (`delivered` is manual-only) and the cargo spine. The
  flow **has no finish line**. · effort S (the action) + dep Stage 4 propagation.
- 🔴 **No AP / cost ledger → no `net_profit`, no margin.** Already R-7 — **but
  R-7 is "post-launch P1, ADR launch-week" and unbuilt.** Restated here because
  it is the literal last stage of the revenue flow: without it, "close" means
  "stopped touching it", not "confirmed profitable". The legacy double-count
  (§1.5) cannot even be reproduced in Pacred because the cost side does not
  exist. Flagging that the *flow trace* dead-ends here. · XL · R-7.
- 🟡 **`yuan_payments.cost_thb` / `profit_thb` are staff-typed cells.**
  `adminUpdateYuanPayment` accepts them as free input — the **identical**
  typed-not-computed risk the legacy decode flags (§9.2 risk 2). The one place
  Pacred *does* have a cost field, it copied the legacy mistake. Should be
  derived. · S.

---

## 3. Holes in existing flow code (state-machine + money)

Beyond the known/fixed P0-1, P0-2, P1-1…P1-5:

- 🔴 **H-1 — `adminUpdateYuanPayment` has no status-transition guard.** Unlike
  `adminUpdateServiceOrder`/`adminUpdateForwarder` (which have `isStatusRollback`),
  the yuan-payment update lets **any** status → any status. Concretely:
  `completed → processing` re-stamps `executed_at` and the wallet-tx flip block
  only fires on a *new* `completed`, so a refunded payment re-set to `completed`
  **does not re-debit** the wallet (the `.eq("status","pending")` filter misses
  the already-`cancelled` tx) → customer keeps the money and the goods. And
  `refunded → completed` is freely allowed. No guard, no audit distinction.
  `actions/admin/yuan-payments.ts:46-79`. · effort S.
- 🟠 **H-2 — yuan refund only cancels a *pending* wallet tx.** The refund branch
  filters `.eq("status","pending")`. But by the time a yuan payment is refunded
  it has usually been `completed` → the wallet tx is also `completed`, not
  `pending`. So `refunded`/`failed` on a completed wallet-paid payment **leaves
  the debit standing** — the customer's wallet is never credited back. This is a
  real money-loss path the money-audit's P1-3 ("refund→re-complete gap") gestures
  at but does not pin to this filter. · S.
- 🟠 **H-3 — order/forwarder cancellation after a completed payment orphans the
  debit.** `cancelServiceOrder` only allows `pending`/`awaiting_payment`, but
  `adminUpdateServiceOrder` / `adminUpdateForwarder` can set `cancelled` from
  **any** non-terminal state — including `ordered`/`shipped_china` *after* the
  wallet was debited. Nothing reverses the `order_payment`/`import_payment` tx on
  cancel. The order shows `cancelled`; the customer's money is gone with no
  refund row. V-C1 plans a *post-lock refund for carrier-change over-collection*
  — it does **not** cover "cancelled-after-paid". · M.
- 🟠 **H-4 — money tx written, status update fails → permanent inconsistency.**
  Every `mark*Paid` action has the pattern: insert wallet tx → update order
  status → *"if update fails, the tx stays, surface the error"*. Deliberate (no
  silent rollback) but there is **no reconciliation tool** to find these. A
  failed status update leaves a completed debit against an `awaiting_payment`
  order with no automated detection — `/admin/reconciliation` exists but (per its
  filename only) is not wired to this class. Needs an "orphan paid tx" report.
  · S.
- 🟠 **H-5 — `adminBulkUpdateForwarderStatus` bypasses the rollback guard.** The
  single-row `adminUpdateForwarder` enforces `rollback_reason` on backward
  transitions; the **bulk** action (same file, `adminBulkUpdateForwarderStatus`)
  applies any status to ≤100 rows with **no rollback check, no reason**. A bulk
  op can silently roll 100 forwarders backward. Governance hole. · S.
- 🟡 **H-6 — container status flip writes history best-effort.** `setContainerStatus`
  updates the row, then inserts `cargo_container_status_history` **without
  checking the insert error** (comment: "fire-and-forget"). A failed history
  insert = a status change with no audit row → the future board's timeline lies.
  · S.
- 🟡 **H-7 — `forwarder_cost_adjustments` has no double-submit guard.** Unlike
  the main payment (0061 partial-unique), two fast clicks of "add D/O fee" insert
  **two** unpaid adjustments; admin then pays both → customer double-charged. The
  audit caught the *main* payment double-debit, not the adjustment one. · S.
- 🟡 **H-8 — `refreshContainerTotals` is manual-only.** Container `total_cbm` /
  `total_weight_kg` are denorm caches refreshed only if a caller invokes the
  function. Attach/detach a shipment and the totals silently drift until someone
  remembers. Feeds the V-D1 CBM-diff with a stale number. · S.

---

## 4. Chain notes — the meta-gap

The individual stages are mostly *present*; the **edges between them are
absent**. Pacred-web is a set of correct islands:

```
quote ──✗──▶ order ──✗──▶ payment ──✗──▶ container ──✗──▶ arrival ──✗──▶ invoice ──✗──▶ receipt ──✗──▶ close
       no lock      (ok, manual)   no attach    no propagate   no auto-bill   (ok)          no auto-close
```

Every `✗` is a hand-off that today is either a manual admin click **or nothing
at all**. The audits planned the **islands** (R-1 board, R-7 ledger, V-E
freight docs) but not the **bridges**. Recommended framing for a Part W:

1. **W-1 — Container→order status propagation** (Stage 4, 🔴, M). `setContainerStatus`
   maps onto `forwarders`/`service_orders` status via a documented enum. The
   single highest-leverage bridge — it makes the customer portal *true* and is a
   precondition for R-1 being worth anything.
2. **W-2 — Unify the two container tables** (Stage 4, 🟠, M). Pick `cargo_containers`,
   migrate `containers`, repoint `forwarders.container_id`. Do this **before**
   R-1/R-10 build on top, or they inherit the split.
3. **W-3 — Arrival→billing gate** (Stage 6, 🔴, M). Block `mark*Paid` /
   pay-from-wallet for an arrived cargo job until container-no + final CBM are
   confirmed. Pairs with V-D1/V-D3.
4. **W-4 — Deposit / partial-payment model** (Stage 3, 🔴, L, needs ADR). Replace
   the one-shot full debit + single-row idempotency with an invoice-style
   `amount_paid` running total for cargo too. The current 0049/0061 guard must
   be reworked so it stops double-debit **without** forbidding a real second
   round.
5. **W-5 — Refund money path** (Stage 8 + H-2/H-3, 🔴, M). One credit-writing
   action (`kind='refund'`) covering: cancel-after-paid, yuan refund of a
   *completed* payment, carrier-change over-collection (V-C1). Today statuses say
   "refunded" while no money moves.
6. **W-6 — Freight chain wiring** (Stage 7, 🔴, M). `quote.convert` actually
   creates a shipment; `markFreightDelivered` (or a billing action) auto-drafts
   the invoice; add the `freight_invoices` partial-unique index (mirror P1-4).
7. **W-7 — Yuan-payment transition guard + freight WHT gate** (H-1, Stage 8, S
   each). Add `isStatusRollback` to `adminUpdateYuanPayment`; add
   `freight_invoice_id` to `withholding_tax_entries` so `getFreightReceiptGate`
   stops being a no-op.
8. **W-8 — Orphan-paid-tx reconciliation report** (H-4, S). Find completed
   payment tx whose order is not in a paid state. Cheap, catches every W-class
   failure that slips through.

**Smallest-effort / highest-leverage first:** W-7 + W-8 (all S, close real
money holes), then W-1 (makes the product honest), then W-3/W-5/W-6.

---

**End — `gap-revenue-flow.md`.** Extends PACRED-GAP-ANALYSIS + PORT_PLAN Part V;
every item here is unplanned as of 2026-05-17. The known P0/P1 bugs are fixed —
the gap that remains is **the flow has no edges**.
