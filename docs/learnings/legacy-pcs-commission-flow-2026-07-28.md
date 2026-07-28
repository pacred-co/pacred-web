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
