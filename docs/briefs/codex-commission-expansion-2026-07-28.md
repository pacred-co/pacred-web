# Pacred internal commission expansion — Codex implementation brief

**Status:** discovery/task breakdown for Claude architecture review

**Date:** 2026-07-28

**Scope:** Cargo + shop-order staff earnings; no production activation or
owner-unconfirmed rates in this brief.

## Owner outcome

Create one reconcilable commission flow for:

| Group | Known staff/rule | Work unit |
|---|---|---|
| Warehouse | rate pending owner confirmation | one first valid warehouse intake queue (`fid`) |
| Interpreter | `admin_web`, `admin_manow`; rate/formula pending final approval | one attributable paid shop order |
| Sales | `admin_bam`, `admin_looknut`, `admin_may`, `admin_pee`; rate pending final approval | one attributable paid source |
| CS | roster/rate pending owner confirmation | one attributable paid source or separately proven CS action |
| Driver | **10 THB per delivered location** | one completed delivery stop, not one tracking |
| Customer agent | retain existing legacy contract | existing eligible paid customer source |

Every lane has one global gate:

```text
work completed
AND customer payment approved
AND active receipt proof exists
AND source not cancelled/refunded/previously accrued
```

## Confirmed source-of-truth facts

### Cargo money proof

Use all three facts, not an operational status:

- `tb_wallet_hs.status='2'` — accounting approved payment;
- `tb_receipt_item.fid` — receipt covers this Cargo row;
- `tb_receipt.rstatus='1'` — receipt is active.

`tb_forwarder.fstatus`, `paydeposit`, or merely having a receipt item is
insufficient.

### Warehouse work proof

`warehouse_intake_log(step='intake')` records `fid`, actor, warehouse and
timestamp. Use the first valid intake per `fid`. Repeat scan/status refresh must
not create another earning.

The report needs two dates:

- `work_month` = month of first intake;
- `eligible_at` / payout month = when payment plus active receipt proof became
  complete.

### Driver work proof

`tb_forwarder_driver.fdadminid` is the driver;
`tb_forwarder_driver_item.fdistatus='2'` plus `fdicompletedat` proves delivery.
Group multiple `fid`s at one stop by:

```text
(driver batch fdid, normalized frozen delivery-address fingerprint)
```

Pay 10 THB once per stop only after every included row is delivered and every
included `fid` has active paid receipt proof. Keep all `fid`s as stop detail for
audit. Never calculate `10 × tracking count`.

### Owner attribution

For Cargo, source owner candidates are:

- Sales: `tb_forwarder.userid → tb_users.adminIDSale`;
- CS: `tb_forwarder.userid → tb_users.adminIDCS`.

Snapshot the legacy admin ID and resolved profile ID at accrual. A future
customer reassignment must not move historical earnings.

For interpreter, prefer order-level `tb_header_order.adminidip`; customer-level
`tb_users.adminIDInterpreter` is only a controlled fallback. Historical
`adminidip='admin_web'` was previously treated as a placeholder, while the
owner now names `admin_web` as a real interpreter. Do not bulk-credit those
historical rows without auditable assignment evidence.

## P0 blocker found

The direct shop slip path in `actions/admin/wallet-hs.ts`:

1. approves `tb_wallet_hs` type 8;
2. flips `tb_header_order.hstatus 2→3`;
3. returns without issuing/linking a receipt.

The linked shop-payment tax-document bridge is separately dormant behind
`tax_invoice.shop_yuan_enabled`, and `tb_shop_tax_invoice.receipt_id` is
optional. Consequently there is no safe shop-order equivalent of the Cargo
receipt proof today.

Do not accrue shop interpreter/Sales/CS commission from `hstatus=3`,
`paydeposit=1`, or tax-invoice existence. First close the direct-slip receipt
handoff and define an idempotent `hno → active receipt/payment` relation.

## Architecture constraints for Claude

1. Do not revive the dead/frozen `commission_*` World-A tables.
2. Do not overload legacy `tb_withdraw_comm_*` with new Warehouse/CS/Driver
   semantics.
3. Treat migration 0167 `freight_commission_*` as a useful pattern, not a
   drop-in Cargo ledger: its earner FK is `profiles(id)`, source uniqueness is
   too coarse for role-specific delivery stops, and it stores net accrual while
   withdrawal also calculates WHT.
4. Rates must be effective-dated editable data, inactive until
   `is_owner_confirmed=true`; no guessed Warehouse/Sales/CS/interpreter rates.
5. Accruals are immutable snapshots. Voids/refunds create reversal records.
6. Payout must remain explicit `pending → approved → paid/rejected`, with bank
   and slip snapshots plus actor/time audit.
7. Keep `work_month`, `eligible_at`, and `paid_at` separate.

## Required reconciliation model

Do not rely on one event hook. Warehouse intake/delivery can precede payment;
payment can precede operational completion.

Build one idempotent reconciler that intersects:

```text
immutable work facts × active payment/receipt facts × confirmed effective rule
```

Invoke it after intake, delivery, payment approval and receipt issuance, plus a
scheduled/admin repair run. Duplicate invocations must converge on the same
accrual. Receipt cancellation/refund must make the prior accrual reversible and
visible.

Suggested source identity:

```text
(role_kind, source_kind, source_ref, earner_legacy_admin_id)
```

Examples:

- warehouse: `warehouse / cargo_intake / fid`;
- driver: `driver / delivery_stop / fdid:address_fingerprint`;
- sales: `sales / cargo_receipt_source / fid`;
- CS: `cs / cargo_receipt_source / fid`;
- interpreter: `interpreter / shop_order / hno`.

## Delivery tasks

### Phase A — money integrity

1. Fix direct shop-slip approval so paid shop orders receive a durable,
   idempotent receipt/payment proof.
2. Define active/cancelled/refunded shop receipt semantics and tests.
3. Add a data-health report for paid shop orders missing proof.

### Phase B — ledger foundation

4. Claude approves ledger schema, WHT timing, role policy and reversal model.
5. Add confirmed-rate gate and seed only the owner-confirmed driver 10 THB
   rule; all other rate rows remain unconfirmed/inactive.
6. Implement pure calculation and source-key tests.

### Phase C — Cargo earners

7. Warehouse first-intake reconciler and duplicate-scan tests.
8. Driver stop grouper, address normalizer, grouped-tracking and failed-stop
   tests.
9. Sales attribution snapshot; enable only after rate confirmation.
10. CS completion policy + roster/rate confirmation before accrual.

### Phase D — shop earners

11. Interpreter assignment cleanup/report for real vs placeholder
    `admin_web`.
12. Shop interpreter reconciliation after Phase A proof exists.
13. Shop Sales/CS attribution only if the owner confirms those lanes apply.

### Phase E — reporting and payout

14. Monthly operational report: queues/stops/orders by work month.
15. Monthly finance report: eligible, reversed, batched and paid by payout
    month, drillable to receipt and source rows.
16. Withdrawal review, approval, slip upload and paid lock.
17. End-to-end tests: payment → receipt → work → reconciliation → batch →
    payout; plus cancellation/refund/reassignment/retry cases.

## Owner decisions still required before money can accrue

- Warehouse rate per queue.
- Interpreter formula/rate for Pacred (reuse PCS margin formula or new rule).
- Sales formula/rate and which service lanes qualify.
- CS roster, qualifying action and formula/rate.
- WHT timing/rate policy across roles.
- Whether a delivery stop is all-or-nothing when one grouped `fid` lacks paid
  receipt proof, or whether it becomes payable when the final `fid` clears
  (recommended: wait for the final `fid`, then pay the stop once).
