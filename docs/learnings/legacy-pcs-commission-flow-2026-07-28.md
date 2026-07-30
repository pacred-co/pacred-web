# Legacy PCS commission flow — source-of-truth learning

> Date: 2026-07-28  
> Status: research baseline before changing Pacred  
> Sources: local PCS UI, canonical PHP under `member/pcs-admin`, local `pcsc_main`
> aggregate queries, and current Pacred actions/pages.

## Executive finding

PCS does **not** have one commission system. It has three independent money
flows which happen to use similar Thai labels:

1. employee sales commission (`tb_withdraw_comm_sale_*`);
2. Chinese-interpreter commission (`tb_withdraw_comm_interpreter_*`);
3. customer sales-agent share (`tb_user_sales*`).

They have different earn events, owners, detail rows, payout headers and
eligibility rules. A single generic “commission” page cannot faithfully replace
them unless it preserves these three ledgers and their source references.

The local database is a historical snapshot (latest employee batches are in
2024), so it cannot answer “how many jobs this month in July 2026”. It is useful
for proving formulas, joins, status transitions and report shapes only. A
current-month operational report must query Pacred's live canonical tables.

## Flow A — employee sales commission

### Source and eligibility

- Entry: `withdraw-commission-sale.php?page=add`
- Candidate source: `tb_wallet_hs wh`
  joined to `tb_forwarder f` by `f.ID = wh.refOrder` and user id.
- Only customer-paid wallet rows: `wh.status = '2'`.
- Legacy cutoff: `DATE(wh.date) > '2023-09-30'`.
- Month means **customer payment month** (`DATE(wh.date)`), not order creation
  month and not delivery month.
- Attribution: `tb_users.adminIDSale`.
- Rows already linked through `tb_withdraw_comm_sale_item` are shown with their
  withdrawal status and cannot be selected again.

### Formula

Per forwarder:

```text
commission base = fTotalPrice - fDiscount
gross commission = commission base × 1%
```

Batch:

```text
gross = sum(per-forwarder gross)
WHT = gross × 3%
net = gross - WHT
```

Legacy exception: `adminType` 3 or 4 (intern) has zero WHT.

### Payout record and state

- Header: `tb_withdraw_comm_sale_h`
- Detail: `tb_withdraw_comm_sale_item(fID, wcsID)`
- Header captures payee, title, gross (`commBefore`), WHT, net (`amount`),
  bank snapshot and creator.
- The UI labels are:
  - `1` = รอดำเนินการ
  - `2` = สำเร็จ/จ่ายแล้ว after slip upload
  - `3` = ไม่สำเร็จ
- Pay action is guarded by `status = 1`, uploads a slip, then changes the header
  to status 2 and records updater/time.

### UI/report shape

- Employee selector for authorised management/accounting roles.
- Year + month selector.
- One row per forwarder with paid date, created date, order, tracking,
  container, warehouse, transport, product type, weight, volume, price,
  discount, commission, member and withdrawal status.
- Total row for weight, volume, base and commission.
- Multi-select opens a payout modal; payout is a **group/batch**, not one
  tracking at a time.

## Flow B — Chinese-interpreter commission

### Source and eligibility

- Entry: `withdraw-commission-interpreter.php?page=add`
- Source: paid wallet rows joined to `tb_header_order`.
- `wh.status = '2'`.
- Legacy cutoff: `DATE(wh.date) > '2023-08-31'`.
- Attribution: `tb_header_order.adminIDIP`.
- Percentage: `tb_set_comm_interpreter.perCom`, configured per interpreter
  from the admin profile.
- Month means customer payment month.

### Formula

```text
yuan margin = (hTotalPriceCHN + hShippingCHN) - hCostAll
if margin < 0 or hStatus = 6, margin = 0
commission THB = yuan margin × hRateCost × (perCom / 100)
```

Batch gross is the sum of item commission THB. WHT is 3%, except intern
`adminType` 3/4, and net is gross minus WHT.

### Payout record and state

- Header: `tb_withdraw_comm_interpreter_h`
- Detail: `tb_withdraw_comm_interpreter_item(hNo, diffYaun, wciID)`
- Same 1 → 2 payout transition and slip requirement as employee sales.
- The item stores the yuan margin snapshot (`diffYaun`), which is necessary for
  later audit even if source-order values change.

### UI/report shape

Month + interpreter filters, one row per shop order, sale yuan, cost yuan,
margin yuan, cost exchange rate, interpreter percentage, commission THB,
order status and withdrawal status. Selected rows become one monthly batch.

## Flow C — customer sales-agent share

This is not an employee payroll bonus.

### Source and eligibility

- Earn ledger: `tb_user_sales`, one row per delivered forwarder (`idf`).
- Canonical teams: `THADA.VIP`, `SIN.VIP`, `OOAEOM.VIP`, `SWAN`.
- Earn status:
  - `1` unpaid/available;
  - `2` linked to a pending payout;
  - `3` paid (legacy data currently does not consistently update item rows to
    3; the payout header is the reliable payment state).

### Formula and gate

```text
base = sum(fTotalPrice - fDiscount)
gross = base × 1%
WHT = gross × 3%
net = gross - WHT
withdrawal allowed only when net >= 1,000 THB
```

Customer submits bank details plus an ID-card PDF.

### Payout record and state

- Header: `tb_user_sales_admin_pay`
- Links: `tb_user_sales_pay(IDUS, IDUSAP)`
- Customer request creates header status 2, links selected earn rows and
  changes `tb_user_sales.usStatus` to 2.
- Accounting uploads the payment slip and changes header 2 → 3.
- Admin page: `report-user-sales-history.php`.
- Per-team audit pages: `report-user-sales/{team}/`.

## Verified local historical data

These values are evidence that the tables are live historical ledgers, **not
current July 2026 KPIs**:

| Ledger | Headers | Items / earns | State summary |
|---|---:|---:|---|
| employee sales batches | 25 | 3,204 item links | 25 status-1 headers |
| interpreter batches | 46 | 2,947 item links | 46 status-1 headers |
| customer-agent earns | — | 4,104 | 3,664 status 1; 440 status 2 |
| customer-agent payouts | 5 | — | 5 paid headers |

Historical date ranges:

- employee sales batches: 2024-02-01 → 2024-11-25;
- interpreter batches: 2023-12-09 → 2024-08-30.

## Pacred today — preliminary gap assessment

### Correctly ported/live

- `actions/commissions-tb.ts` uses the canonical `tb_user_sales*` customer-agent
  family.
- `actions/admin/sales-payouts-tb.ts` implements the matching accounting
  payout queue and slip-confirmed 2 → 3 transition.
- `/admin/reports/agent-payouts` exists for the customer-agent ledger.
- `actions/admin/withdraw-comm-batch.ts` and
  `/admin/accounting/withdraw/comm-{sale,interpreter}` read and write the two
  employee batch families.

### Risks requiring the next audit pass

1. There are still parallel rebuilt `commission_*`, `sales_commissions` and
   freight commission surfaces. Each route must clearly name its business
   meaning; a generic `/admin/commissions` label is ambiguous.
2. Current-month “งานกี่คิว” needs a first-class period summary over the
   canonical source rows, not only payout headers.
3. The summary must expose counts at four stages:
   eligible source jobs → selected/accrued jobs → pending payout batches →
   paid batches.
4. Sales month must be based on customer-paid date to match PCS. Grouping by
   created/delivered/payout date produces different totals.
5. Interpreter calculations need the historical `diffYaun` and rate snapshots;
   recomputing old payouts from mutable order fields is unsafe.
6. Current `withdraw-comm-batch.ts` comments and UI must be checked against the
   verified legacy status contract (`1 pending`, `2 paid`, `3 failed`).
7. PCS menu links to `withdraw-commission-sale-new.php` and
   `withdraw-commission-interpreter-new.php`, but those files are absent in the
   local/canonical extract. They are dead legacy menu entries, not a fourth
   commission flow to port.

### Test audit result (2026-07-28)

The customer-agent earn-trigger initially failed its unit test at the first VIP
case (`THADA.VIP`: inserted 0, skipped 1). The production helper was correct:
it queries legacy camelCase `tb_users.userID/coID` and aliases the returned
payload to lowercase `userid/coid`. The fake Supabase client filtered its
lowercase fixture using the unaliased `userID` key, so it falsely returned no
customer. The fake now translates the filter column just as PostgREST does.

Result after correction: **58 passed, 0 failed**, covering all four VIP teams,
non-VIP rejection, idempotency, mixed batches, timestamp fallback and duplicate
input ids. This was test drift, not evidence of a production earn failure.

## Required operational monthly report

For each commission family and selected month:

| Metric | Meaning |
|---|---|
| eligible jobs | source jobs satisfying paid/status/cutoff/owner rules |
| already batched jobs | item rows linked to a payout header |
| unbatched jobs | eligible minus linked |
| gross base | source amount before rate |
| gross commission | calculated commission before WHT |
| WHT | withholding snapshot |
| net payable | gross minus WHT |
| pending batches | header status 1 (employee) or 2 (customer-agent) |
| paid batches | header status 2 (employee) or 3 (customer-agent) |
| exceptions | missing owner, missing rate, negative margin, duplicate link |

Every total must drill down to its source jobs and payout batch. This is the
minimum shape needed for accounting to reconcile the staff view, customer view,
slip and final document as one straight data line.

## Next implementation gate

Before changing code:

1. run live-row cardinality and reachability checks on Pacred/Supabase;
2. map every Pacred commission route to exactly one of flows A/B/C or freight;
3. test the current actions against the formulas and status transitions above;
4. produce a route-by-route fidelity/gap table;
5. only then design the consolidated monthly overview and drill-down.

## Pacred owner extension — six internal earning groups

Owner clarification received 2026-07-28 expands the target beyond the three
legacy PCS flows:

| Group | Named roster / owner input | Proposed earning unit | Money/document gate | Rate status |
|---|---|---|---|---|
| warehouse | warehouse staff (roster still to confirm) | one unique forwarder queue (`fid`) at its first real warehouse intake | active paid receipt covers the `fid` | **pending owner confirmation** |
| interpreter | `admin_web`, `admin_manow` | one paid shop-order/interpreter job, preserving yuan-margin snapshot | paid + issued document for that job | use legacy margin formula only after owner confirms applicability |
| sales | `admin_bam`, `admin_looknut`, `admin_may`, `admin_pee` (normalized candidates; verify against live roster) | one receipt-covered source job attributed to its sales owner | active paid receipt | legacy Cargo 1% is evidence, but final Pacred rate needs owner confirmation |
| CS | roster still to confirm | one receipt-covered source job attributed to `tb_users.adminIDCS` | active paid receipt | **pending owner confirmation** |
| driver | driver owning `tb_forwarder_driver.fdadminid` | one **unique delivered location**, not one tracking/fid | every included job paid + receipt issued; delivery status 2 with completed timestamp | **10 THB per location** (owner-confirmed) |
| customer sales-agent | four VIP team codes | existing `tb_user_sales` earn row per delivered forwarder | existing paid/delivered contract | existing 1%, 3% WHT, net ≥1,000 |

The local historical PCS database does not contain the current full roster.
Repository evidence confirms the current sales IDs `admin_bam`,
`admin_looknut`, `admin_may`, and `admin_pee`; the final implementation must
still validate each against the live `tb_admin` / `admin_contact_extras`
bridge. Do not silently create an accrual under a misspelled or inactive id.

### Non-negotiable eligibility gate

An operational event alone does not mint payable commission.

```text
eligible =
  source work completed
  AND payment approved/settled
  AND a non-cancelled receipt/document exists
  AND an eligible active owner can be resolved
  AND an owner-confirmed rate exists
```

For Cargo forwarders, the strongest existing document proof is:

```text
tb_receipt_item.fid = source fid
→ tb_receipt.rid = tb_receipt_item.rid
→ tb_receipt.rstatus = '1'  (paid/active)
```

`tb_receipt.rstatus='2'` is cancelled and must never earn. A pending/manual
receipt (`rstatus='3'`) is not paid evidence. The accrual must snapshot
`receipt_id`, `rid`, `issuedate`, source owner and rate so later edits do not
rewrite payroll history.

Shop-order document linkage is not represented by legacy
`tb_receipt_item` (it only has `rid,fid`). Pacred's shop document path uses
`tb_shop_tax_invoice.hno` and its `receipt_id`; that exact paid-state contract
must be verified before interpreter/CS shop-order accrual is enabled.

### Warehouse earning contract

Evidence already available:

- `actions/admin/warehouse-intake.ts` writes one audit event to
  `warehouse_intake_log` with `step='intake'`, `fid`, `admin_id`,
  `warehouse_code`, before/after status and timestamp.
- The same action flips `tb_forwarder` into warehouse status and stamps
  `fdatestatus2`.

Proposed canonical unit:

```text
one accrual per (role=warehouse, fid, first valid intake event)
```

Duplicate scans must not double-pay. Month should be a stated business basis:
the owner described “เดือนนี้มีของเข้ามาที่โกดังเรากี่คิว”, so the default
period is **warehouse intake month**, while receipt eligibility is a gate and
not the grouping date. If a queue enters in June but is paid/receipted in July,
it belongs to June operational volume but becomes payable in July. Reports
must show both `work_month` and `eligible_at`; silently choosing one date will
create reconciliation drift.

### Driver earning contract — 10 THB per delivered location

Existing proof:

- `tb_forwarder_driver.fdadminid` = assigned driver;
- `tb_forwarder_driver_item.fdistatus='2'` = delivered;
- `fdicompletedat` = precise delivery timestamp;
- delivery action also flips `tb_forwarder.fstatus` to 7.

A driver item is one `fid`, but the owner explicitly pays per **location**.
Multiple fids/trackings delivered together must therefore collapse into one
stop. Proposed idempotency key:

```text
(driver batch fdid, normalized delivery-address fingerprint)
```

The fingerprint should derive from the frozen delivery address fields, not a
free-text display label. All fids grouped into the stop remain visible as
detail rows. The stop earns exactly 10 THB once:

```text
all included driver items delivered
AND all included fids covered by active paid receipts
AND stop not already accrued
```

Do not pay `10 × tracking count`; that overpays grouped deliveries. Failed
items (`fdistatus='3'`) and re-uploaded delivery photos must not mint another
accrual.

### Sales and CS attribution

For Cargo, both roles can be resolved from the customer owning the receipt
covered `fid`:

- sales: `tb_forwarder.userid → tb_users.adminIDSale`;
- CS: `tb_forwarder.userid → tb_users.adminIDCS`.

The assignment must be snapshotted at accrual time. Reassigning a customer next
month must not transfer historical commission to the new staff member.

There is a policy choice still requiring owner/Claude architecture approval:
whether both Sales and CS earn on every paid receipt, or only when a separate
job action proves that role completed its work. Until that is confirmed, the
report may show “eligible source candidates” but must not mint payable rows for
CS or apply an invented rate.

### Interpreter attribution warning

Legacy `tb_header_order.adminidip` currently contains placeholders such as
`customer` and `admin_web`; existing Pacred code deliberately excludes
`admin_web` from the legacy interpreter payee list. The new owner instruction
explicitly names `admin_web` and `admin_manow` as interpreters, so that legacy
placeholder assumption is no longer safe.

Before enabling accrual:

1. ensure each order has an explicit interpreter assignment (prefer the
   order-level `adminidip`; customer-level `adminIDInterpreter` is only a
   fallback);
2. distinguish a real `admin_web` assignment from old placeholder rows;
3. backfill only from auditable evidence, never all historical
   `adminidip='admin_web'` rows;
4. snapshot yuan margin, exchange rate and percentage.

### Data model direction (draft; no migration yet)

Do not extend the frozen/dead `commission_accruals` family from ADR-0020, and
do not overload the legacy sale/interpreter withdrawal tables with warehouse,
CS or driver rows.

Claude architecture review should choose an isolated Pacred staff ledger with:

- owner-confirmed effective-dated rules;
- one immutable accrual per `(role_kind, source_kind, source_ref,
  earner_admin_id)`;
- source work timestamp and `eligible_at` timestamp;
- payment/receipt proof snapshot;
- role-specific calculation payload (warehouse intake, yuan margin, driver
  stop grouping);
- batch withdrawal header + item links;
- pending → approved → paid/rejected state with slip and audit trail.

The monthly report should present operational month and payout month side by
side instead of forcing all roles onto one ambiguous “เดือน”.

### Payment/receipt audit addendum — do not infer eligibility from status alone

The current shop-order payment paths are not yet symmetrical:

- linked wallet-payment approval can issue a shop tax document, but that
  feature remains dormant behind `tax_invoice.shop_yuan_enabled`;
- direct shop-order slip approval (`tb_wallet_hs.type='8'`,
  `typeservice='1'`) flips the slip to paid and the order from `hstatus=2` to
  `hstatus=3`, then returns without issuing a receipt;
- `tb_shop_tax_invoice.receipt_id` is optional, and a tax invoice is not by
  itself proof that the receipt remains active.

Therefore `hstatus='3'`, `paydeposit='1'`, or the existence of a shop tax
invoice must **not** mint commission. The direct-slip missing-receipt handoff is
a P0 prerequisite for shop-order interpreter/Sales/CS commission.

For Cargo, the verified proof is:

```text
tb_wallet_hs.status = '2'
AND tb_receipt_item.fid = source fid
AND tb_receipt.rstatus = '1'
```

For shop orders, Claude architecture must first choose and implement an
equivalent canonical receipt/payment link. Until that exists, the commission
reconciler should report shop rows as `blocked_missing_receipt_proof`, never
guess eligibility from order status.

### Reconciliation is mandatory, not only event hooks

Warehouse intake or delivery can happen before accounting approves the slip.
If accrual runs only inside the intake/delivery action, the row will be missed
forever when receipt proof appears later. Conversely, a payment hook alone
cannot know that later warehouse/delivery work has completed.

The safe design is:

1. event actions record immutable work facts;
2. payment/receipt actions record immutable money facts;
3. an idempotent reconciliation job intersects both sets and mints accruals;
4. cancellation/void produces an auditable reversal, never a silent delete.

Run the same reconciler after relevant actions and on a scheduled/admin
backfill path. Its unique source key makes retries safe.
