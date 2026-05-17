# 💸 เบิก/จ่าย — Disbursement & Payment System — Survey + Design

> **Captured:** 2026-05-18 · **Owner ask:** พี่ป๊อป (relayed by เดฟ) — "get the
> เบิก/จ่าย system done right; it's the one that always has problems."
> **Type:** research + design. **No code in this doc.**
>
> **Read with:**
> [`docs/research/legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md) ·
> [`docs/research/audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md) ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) ·
> [ADR-0015 withholding tax](../decisions/0015-withholding-tax-model.md) ·
> [ADR-0014 state transitions](../decisions/0014-customer-self-service-state-transitions.md) ·
> [ADR-0002 admin architecture](../decisions/0002-admin-architecture.md) ·
> [ADR-0005 launch decisions](../decisions/0005-launch-operational-decisions.md).

---

## 1. TL;DR — what this is, in six sentences

1. **เบิก/จ่าย = disbursement = money OUT.** A staff member (or back-office)
   requests money from the company to pay a real cost — a carrier freight bill,
   a customs officer's fee, a labourer, a fuel top-up, the China-warehouse float,
   their own commission. The company categorises it, approves it, pays it,
   recovers it (where it belongs to a customer job), and — where Thai law
   requires — **issues a withholding-tax certificate** to the payee.
2. **Pacred has fragments, not a system.** Three disconnected ledgers exist —
   `commission_*` (migration 0054), `container_disbursements` (0069), the wallet.
   None of them model **claim modes** (เบิกขาด/เบิกเกิน/เบิกด่วน), none of them
   do a **per-recipient line-item breakdown**, only commission has an
   approve→pay state machine, and **none issue a WHT certificate** — `0044` only
   records WHT the *customer* withheld from *us*.
3. The owner's model is one unified flow: **request → categorise + allocate →
   approve → pay → (recover) → WHT-cert**, covering every cost category
   (ค่าคอม · ค่าเบิก · ค่าล่วงหน้า · ค่าแรงงาน · ค่าโกดัง · ค่าน้ำมัน · …) and
   every claim mode, with each request decomposable into **N recipient lines**
   (item 1 → person → amount; item 2 → person → amount).
4. **Disbursement is money OUT, so it is designed fail-closed:** every line is
   `numeric(12,2) > 0`, every state transition is a guarded `from→to`, paying
   needs a slip, the central-fund balance is a *computed* running total, and a
   double-click can never double-pay (partial-unique idempotency, the F-11
   pattern the money-audit found missing everywhere else).
5. The **WHT certificate** Pacred *issues* (the 50-ทวิ หนังสือรับรองการหักภาษี
   ณ ที่จ่าย) is normal Thai Revenue-Department law: when Pacred pays a juristic
   vendor / a contractor / a commission earner, Pacred withholds **1%**
   (transport — ค่าขนส่ง) or **3%** (services — ค่าบริการ/ค่าจ้างทำของ), pays
   Net = Gross − WHT, and hands the payee a numbered certificate. This is the
   *mirror* of ADR-0015 (which handles WHT customers withhold from Pacred).
6. **This document designs zero gray-channel accounting.** Only legitimate,
   RD-compliant withholding. The legacy "แผน VAT" / declared-value-engineering
   material is **explicitly out of scope** and not ported.

---

## 2. Survey — what Pacred HAS today (ground truth)

Five money structures exist. Read each for what it does **and** what it cannot do.

### 2.1 `commission_*` ledger — migration `0054_commissions.sql`

The **only** existing structure with a proper request→approve→pay lifecycle.
Five tables:

| Table | Role |
|---|---|
| `commission_tiers` | per-role / per-service rate lookup (`rate_pct` XOR `flat_thb`) |
| `commission_accruals` | earned-but-unpaid — one row per (earner × source order) |
| `commission_withdrawal_seq` | monthly serial counter `CW-{YYMM}-{seq}` |
| `commission_withdrawals` | request header — `pending→approved→paid` / `→rejected` |
| `commission_withdrawal_items` | join: a withdrawal aggregates N accruals |

**What it does well** (and the disbursement system should copy):
- A real **status machine** with **consistency CHECKs**: `paid` requires
  `paid_at + paid_by_admin_id + slip_storage_path`; `rejected` requires a
  ≥3-char reason; `approved/paid` requires an approver.
- **Snapshot-at-request** financials (`gross_thb / wht_amount_thb / net_thb`,
  payee bank account frozen onto the header).
- A **WHT field** — `wht_rate_pct` default 15.00 with a consistency CHECK
  (`wht_amount = 0 OR (gross > 5000 AND rate > 0)`).
- `unique (commission_accrual_id)` on the items table — an accrual can be in
  **at most one** withdrawal (no double-pay).
- Atomic serial via `next_commission_withdrawal_no()` (SECURITY DEFINER).
- RLS: customer reads **nothing**; earner reads own; super+accounting full r/w.
- Private storage bucket `commission-slips`, earner-folder read pattern.

**Gaps vs the owner's model:**
- ❌ **Only commission.** It cannot record ค่าเบิก / ค่าล่วงหน้า / ค่าแรงงาน /
  ค่าโกดัง / ค่าน้ำมัน — a withdrawal's amount is *always* a sum of
  `commission_accruals`, which only exist for closed sales/forwarder orders.
- ❌ **No per-recipient line breakdown.** `commission_withdrawal_items` joins
  *accruals*, not arbitrary `(description → person → amount)` lines. One
  withdrawal = one earner. The owner wants item-1→person-A, item-2→person-B in
  one request.
- ❌ **No claim modes.** No เบิกขาด (under) / เบิกเกิน (over) / เบิกด่วน (urgent)
  concept — a withdrawal is just gross→net.
- ❌ The WHT field is a *number on the header*, not a **certificate** — no
  cert number, no PDF, no storage path, no per-line rate (1% vs 3%).
- ⚠️ The 15% default is for **commission to an individual** (PIT §50(1)
  bracket withholding) — correct for that case, but the disbursement system
  needs the **1%/3%** rates for transport/service payments to vendors.

### 2.2 `container_disbursements` — migration `0069_container_costs_disbursements.sql`

The closest thing to a real AP/เบิก ledger. **One row per actual outflow against
one `cargo_container`.**

- Columns: `kind` (freight · customs_duty · handling · fuel · storage · trucking
  · other), `amount_thb > 0`, `vendor_name`, `invoice_no`, `paid_at`,
  `paid_by_admin_id`, `attachment_path`, `note`.
- Sibling `container_costs` = the carrier **rate card** (expected cost) — the
  two feed an R-7 margin reconciliation later.
- RLS: super + accounting WRITE+READ only — **no ops/warehouse** (finance-only,
  the W-1 keystone). Storage bucket `disbursement-receipts`.
- Actions: `actions/admin/disbursements.ts` — `adminCreateDisbursement` /
  `adminUpdateDisbursement` / `adminDeleteDisbursement` (delete = super only),
  all `withAdmin(["super","accounting"])`, all `logAdminAction`.

**Gaps vs the owner's model:**
- ❌ **No approval workflow.** A disbursement is created already-final.
  `paid_at` presence *is* the only "paid" signal — there is no
  `requested → pending_approval → approved → paid` lifecycle, no approver, no
  reject path. The migration header literally says *"V1.1 may add a status
  enum; for now timestamp-presence = paid."* The owner explicitly wants the
  approve step — it is where the problems are.
- ❌ **Container-scoped only.** `cargo_container_id` is `not null`. A เบิก for
  office fuel, a labourer paid for a non-container job, the China-warehouse
  central-fund top-up, a freight job that has a `freight_shipment` but no
  `cargo_container` — **none can be recorded.** The owner's scope is "every
  cost, any job, or no job."
- ❌ **No per-recipient lines.** One row = one `vendor_name` + one amount. No
  way to express "this เบิก pays 3 people."
- ❌ **No claim modes**, no allocation across multiple jobs/customers.
- ❌ **No WHT cert.** A freight bill or a labour fee paid here generates no
  withholding certificate.
- ❌ **No recovery link.** Nothing ties a disbursement to the customer
  invoice that should reimburse it (the legacy `advance` column).

### 2.3 Withholding-tax tables — migrations `0044` + `0053`

`withholding_tax_entries` — **WHT the customer withholds from Pacred** (inbound):
- Row existence = "WHT applies"; XOR parent (`order_h_no` / `forwarder_f_no` /
  `freight_invoice_id` after 0053).
- `gross_invoice_thb`, `wht_base_thb`, `wht_rate_pct ∈ {1,1.5,2,3,5}`,
  `wht_amount_thb`, `net_expected_thb`.
- `cert_status` (pending → received → / waived) — receipt issuance is **gated**
  on the customer handing Pacred their 50-ทวิ. Storage bucket `wht-certs`.

**This is the right shape — but pointed the wrong way for เบิก/จ่าย.** It tracks
the cert Pacred *receives*. Disbursement needs the cert Pacred *issues* to its
own payees. The math, the rate set, the `{1,1.5,2,3,5}` CHECK, the cert-status
lifecycle, the dedicated storage bucket — all directly reusable as a template.

### 2.4 Customer credit line — migration `0071_customer_credit_line.sql`

Not a disbursement structure, but the **best money-modelling pattern in the
repo** and worth copying:
- Extends `wallet_transactions.kind` rather than spawning a parallel table — so
  the audit trigger (0062 G-6), overdraw guard (0064), and history UI all pick
  up the new flow **for free**.
- `v_customer_credit_outstanding` — a **computed view** is the single source of
  truth for "how much is owed", never a hand-maintained column.
- Partial-unique `wallet_tx_credit_settlement_uniq` guards double-debit on a
  retry.

**Lesson for disbursement:** the **central-fund balance must be a computed
view**, never a stored running total; idempotency must be a **DB partial-unique
index**, not a check-then-act SELECT.

### 2.5 The wallet + the money-safety guards

- `wallet_transactions` — the unified customer ledger; `wallet_recompute_balance`
  trigger sums `completed` rows per bucket (0007).
- `0061` — money idempotency guards (tax-invoice duplicate).
- `0062` — RLS role-pin: every admin policy on a money table is role-pinned,
  never bare `is_admin()`; every `wallet_transactions` write logs to
  `admin_audit_log`.
- `0064` — wallet overdraw guard: `wallet_available_balance()` (completed +
  open pending debits) + a `BEFORE INSERT/UPDATE` trigger = a hard non-negative
  floor, with `SELECT … FOR UPDATE` so it holds under concurrency.
- `0072` — wallet self-serve amount-sign guard.
- `actions/admin/refunds.ts` + `lib/validators/refund.ts` `checkRefundCeiling()`
  — the **refund-ceiling guard**: a pure function that rejects a payout when
  `priorPaidRefunds + thisRefund > collected`. Money-OUT can never exceed
  money-IN for that parent. NaN/negative inputs treated as a violation
  (fail-closed). **This is the exact pattern an over-claim guard needs.**

### 2.6 Survey verdict — the gap in one table

| Owner requirement | Today | Gap |
|---|---|---|
| Every cost category (6+ named) | only commission + 7 container `kind`s, container-bound | **NEW: a category-flexible, job-optional disbursement table** |
| Per-recipient line items | commission joins accruals only | **NEW: a `disbursement_lines` child table** |
| Claim modes (under/over/urgent) | none | **NEW: `claim_mode` + `urgency` + variance handling** |
| Categorised + allocated | container `kind` enum; no allocation | **NEW: `category` + `disbursement_allocations`** |
| request → approve → pay | only commission has it | **NEW: lifecycle on the unified table** |
| WHT cert 1% / 3% issued to payee | `0044` only records inbound WHT | **NEW: `wht_certificates` (outbound) + per-line rate** |
| Money-OUT safeguards | strong for wallet/refund; absent for disbursement | **EXTEND: ceiling + overdraw + idempotency patterns to disbursement** |
| Central fund (กองกลาง) | a 19 MB legacy spreadsheet | **NEW: a fund ledger + computed-balance view** |

---

## 3. The legacy decode — the model Pacred is replacing

From [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md)
§5 + §9 + §11.6. The legacy "เบิกเงิน" is a set of Google-Sheet tabs:

- **Per-company-per-mode "เบิก" sheets** (`AXELRA_TRUCK`, `NNB_SEA`, …) — one
  AP row per cost, columns `date · vendor · shipment_id · amount · remark ·
  details · status`.
- **Status lifecycle:** `ต้องการเบิก / รออนุมัติ` (pending) → `โอนแล้ว /
  จ่ายแล้ว / เบิกแล้ว` (paid). Batch tags: `รอบเช้า 09.30` / `รอบบ่าย`,
  `เบิกแล้ว` / `ยังไม่ได้เบิก`.
- **`Axelraเบิกเงินทั่วไป`** (general เบิก) — the closest legacy match to the
  owner's ask. Columns include **`หัก ณ ที่จ่าย`** (the WHT amount), **`ชื่อ
  ผู้เบิกเงิน`** (the claimant), bank account, **`เลขที่ใบหัก ณ ที่จ่าย`** (the
  WHT-certificate number), `เอกสารอ้างอิง`, `เลขที่ใบเสร็จรับเงิน`. Grouped by
  `ประจำเดือน MM/YYYY` with per-batch `รวม`. → confirms: the legacy เบิก already
  carries a **WHT cert number per row** — Pacred must keep that.
- **`Axelra เบิกเงินค่าสินค้า`** (ฝากจ่าย / pay-on-behalf) — large CNY goods
  payments via Alipay; columns `หมวดหมู่รายการเบิกเงิน` (the **category**),
  `จำนวนเงินยอดเบิก` (claimed) **and** `จำนวนเงินยอดคืน` (returned/refunded) —
  → confirms the **เบิกเกิน return** flow (over-claim → return the excess).
- **กองกลาง (central fund)** — the China-warehouse revolving float; CNY top-ups
  at rate 4.54–4.66, balance `ยอดหาร` split 50/50 with TTP. *"No ledger
  discipline beyond a spreadsheet"* — §9.2 risk #4, **high leakage surface**.

The 10 money risks (§9.2) the new design must close are folded into §8 below.

---

## 4. Design — the unified disbursement model

### 4.1 The core flow

```
  ┌──────────┐   categorise    ┌───────────┐  super/acct  ┌──────────┐
  │  DRAFT   │ ───────────────▶│  PENDING  │ ────────────▶│ APPROVED │
  │ (staff   │   + add lines   │ APPROVAL  │   approve     │          │
  │  builds) │   + allocate    │           │              │          │
  └──────────┘                 └─────┬─────┘              └────┬─────┘
                                     │ reject (reason)         │ pay out
                                     ▼                         │ + slip
                               ┌──────────┐                    ▼
                               │ REJECTED │              ┌──────────┐
                               │(terminal)│              │   PAID   │
                               └──────────┘              └────┬─────┘
                                                              │ (recover from
                                                              │  customer invoice
                                                              │  where job-linked)
                                                              ▼
                                                        ┌────────────┐
                                                        │ RECONCILED │
                                                        │ (optional) │
                                                        └────────────┘
   On PAY: each taxable line → issue a WHT certificate (1% / 3%).
```

Status enum: `draft · pending_approval · approved · rejected · paid · cancelled`.
`reconciled` is a **flag** on a paid request, not a 7th status (a request can be
paid-and-not-yet-recovered for weeks; recovery is asynchronous).

### 4.2 Three tables (+ two satellites)

A new migration `0073_disbursements.sql` introducing the **request header**, the
**per-recipient line items**, and the **allocations**; `0074` the **central
fund**; `0075` the **outbound WHT certificates**. (Numbers are the next free
slots — 0072 is the latest applied.) Naming `disbursement_*` is deliberately
*generic* — not `container_*` — because a เบิก need not touch a container.

#### Table A — `disbursement_requests` (the header / claim)

One row per เบิก request. Carries the claim mode, the requester, the status
machine, the financial snapshot, the payout method.

Key columns (design intent — not final DDL):

| Column | Purpose |
|---|---|
| `id` uuid PK | |
| `request_no` text unique | `DB-{YYMM}-{seq}` via `next_disbursement_no()` (mirror `0054`) |
| `requested_by_admin_id` uuid → profiles | the claimant (ชื่อผู้เบิกเงิน) |
| `claim_mode` text | `standard` · `under_claim` (เบิกขาด) · `over_claim` (เบิกเกิน) · `urgent` (เบิกด่วน) — see §5 |
| `urgency` text | `normal` · `urgent` — drives SLA + notification; `urgent` allowed only with `urgent_reason` |
| `title` text | e.g. "ค่าเบิกตู้ GZE2605-001 รอบเช้า" |
| `category` text | the **primary** cost category (see §4.3) — header-level rollup; per-line category can differ |
| `status` text | the §4.1 enum |
| `claimed_total_thb` numeric(12,2) > 0 | sum of line `claimed_amount_thb` — frozen at submit |
| `wht_total_thb` numeric(12,2) ≥ 0 | sum of line `wht_amount_thb` |
| `net_total_thb` numeric(12,2) | `claimed_total − wht_total` — what actually leaves the bank |
| `paid_from` text | `central_fund` · `company_bank` · `petty_cash` |
| `payout_method` text | `bank_transfer` · `cash` · `alipay_scan` (legacy สแกนจ่าย) |
| `payee_*` snapshot | when the payout is to ONE account — frozen bank name/acct/no; multi-payee → per-line (see Table B) |
| `requested_at / approved_at / approved_by / rejected_at / rejected_by / rejected_reason / paid_at / paid_by / slip_storage_path` | the audit + consistency columns — **same CHECK discipline as `commission_withdrawals`** |
| `is_reconciled` bool + `reconciled_at` | recovery flag (§7) |
| `expected_total_thb` numeric(12,2) | for เบิกขาด/เบิกเกิน — the originally-budgeted amount (§5); nullable |
| `variance_thb` numeric(12,2) | `claimed_total − expected_total`; generated/computed; sign = under vs over |

**Consistency CHECKs (fail-closed — copy `commission_withdrawals`):**
- `status='paid'` ⇒ `paid_at`, `paid_by_admin_id`, `slip_storage_path` all NOT NULL.
- `status='rejected'` ⇒ `rejected_at`, `rejected_by_admin_id`, `rejected_reason`
  (≥3 chars).
- `status IN ('approved','paid')` ⇒ `approved_at`, `approved_by_admin_id`.
- `claim_mode='over_claim'` ⇒ `over_claim_reason` NOT NULL (variance must be
  explained — ADR-0014 pattern).
- `urgency='urgent'` ⇒ `urgent_reason` NOT NULL.
- `net_total_thb = claimed_total_thb - wht_total_thb` (arithmetic CHECK).

#### Table B — `disbursement_lines` (the per-recipient breakdown)

**This is the owner's "item 1 → person → amount" requirement.** One row per
`(line item × recipient)`. A request with three payees has three lines.

| Column | Purpose |
|---|---|
| `id` uuid PK | |
| `disbursement_request_id` uuid → requests `on delete cascade` | |
| `line_no` int | display order, 1-based |
| `category` text | per-line cost category (§4.3) — a request can mix categories |
| `description` text not null | "ค่าแรงยกตู้ 40HQ", "ค่าน้ำมันรถหัวลาก" |
| `recipient_kind` text | `staff` · `vendor` · `customs_officer` · `labourer` · `carrier` · `other` |
| `recipient_profile_id` uuid → profiles (nullable) | set when the payee is a Pacred staff/member |
| `recipient_name` text not null | free-text payee name (legacy `vendor_name` pattern) — always present even when `recipient_profile_id` is too |
| `recipient_tax_id` text (nullable) | 13-digit — **required if `wht_applicable`** (the cert needs it) |
| `claimed_amount_thb` numeric(12,2) > 0 | the gross for this line |
| `wht_applicable` bool default false | does Pacred withhold on this line? |
| `wht_rate_pct` numeric(4,2) | `1` (transport) or `3` (service) — see §6; CHECK `∈ {1,3}` (extensible) |
| `wht_amount_thb` numeric(12,2) ≥ 0 | `round(claimed_amount × rate/100, 2)`; 0 when `wht_applicable=false` |
| `net_amount_thb` numeric(12,2) | `claimed_amount − wht_amount` |
| `wht_certificate_id` uuid → wht_certificates (nullable) | backfilled when the cert is issued at pay-time |
| `payee_bank_name / payee_account_name / payee_account_no` (nullable) | per-line bank when multi-payee; else header snapshot covers it |
| `receipt_storage_path` text (nullable) | the vendor receipt for THIS line |
| `note` text | `'other' category` ⇒ note required (CHECK, mirror 0069) |

**Why a child table, not JSON:** lines must be individually queryable (sum WHT
by rate for the monthly RD filing — ภ.ง.ด.53/3), individually FK'd to a
certificate, and individually validated by CHECK constraints. JSON would lose
all three.

**CHECKs:** `wht_applicable=true` ⇒ `wht_rate_pct` NOT NULL AND
`recipient_tax_id` NOT NULL (cannot withhold without the payee's tax id);
`wht_applicable=false` ⇒ `wht_amount_thb = 0`; `net_amount_thb =
claimed_amount_thb - wht_amount_thb`.

#### Table C — `disbursement_allocations` (categorise + allocate)

**The owner's "allocated" requirement** — a single เบิก can be split across
several jobs / containers / customers, so cost lands on the right margin.

| Column | Purpose |
|---|---|
| `id` uuid PK | |
| `disbursement_line_id` uuid → lines `on delete cascade` | allocate a *line* (most granular) |
| `target_kind` text | `cargo_container` · `forwarder` · `freight_shipment` · `service_order` · `central_fund` · `overhead` (`overhead` = unallocated company cost) |
| `target_ref` text | the container code / `f_no` / shipment id / `h_no` — nullable when `target_kind IN ('central_fund','overhead')` |
| `allocated_amount_thb` numeric(12,2) > 0 | |

**Invariant (enforced in the action, asserted by a deferred trigger):**
`Σ allocations.allocated_amount = line.claimed_amount` for every line. A line
must be **fully** allocated — `overhead` is the catch-all so this always holds.
This is what produces real per-job cost (R-7 margin) without the legacy
free-text-shipment-ID orphan problem (§8 risk #3).

> **Bridge to `container_disbursements` (0069):** the existing table is *not*
> dropped. It stays as the **container AP read-model**. When a disbursement is
> `paid` with an allocation to `target_kind='cargo_container'`, the pay action
> also writes the matching `container_disbursements` row (or — cleaner, post-V1
> — `container_disbursements` becomes a VIEW over
> `disbursement_allocations WHERE target_kind='cargo_container'`). V1 keeps both
> and syncs in the action; the migration footer records this as the open
> consolidation question. This avoids breaking the live R-7 / container pages.

#### Satellite D — `disbursement_fund` + `disbursement_fund_movements` (กองกลาง)

Replaces the 19 MB legacy spreadsheet with a disciplined ledger.

- `disbursement_fund` — one row per fund (`central_fund_cn` China-warehouse,
  `central_fund_th`, `petty_cash`): `id`, `name`, `currency` (`THB`/`CNY`).
- `disbursement_fund_movements` — append-only: `fund_id`, `direction`
  (`top_up` + / `disbursement` − / `recovery` + / `adjustment` ±),
  `amount` (in fund currency), `fx_rate_to_thb` (the legacy `เรท(หยวน)`),
  `disbursement_request_id` (nullable — set when the movement *is* a paid เบิก),
  `created_by_admin_id`, `note`, `created_at`.
- **`v_disbursement_fund_balance`** — a **computed view** (`security_invoker`,
  `SUM` over movements per fund). The balance is **never a stored column** —
  the 0071 credit-line lesson. Over-disbursing a fund below zero is blocked by
  the same projected-balance trigger pattern as `0064`.

#### Satellite E — `wht_certificates` (the outbound 50-ทวิ) — see §6.

### 4.3 The cost-category model

`category` is a **text column with a CHECK** (not a separate lookup table for
V1 — keep it simple; promote to a table only if the set churns). The owner
named six; the design ships a complete starter set, each mapped to its **default
WHT treatment**:

| `category` value | TH label | Typical recipient | Default WHT |
|---|---|---|---|
| `commission` | ค่าคอมมิชชั่น | staff / sales rep | 3% service (or 15% PIT bracket — see §6.4) |
| `reimbursement` | ค่าเบิก (ทั่วไป) | staff (reimbursed) | none (pass-through) |
| `advance` | ค่าล่วงหน้า / เงินทดรอง | staff (advance, later cleared) | none at advance; WHT on the *final* vendor line |
| `labour` | ค่าแรงงาน | labourer / contractor | 3% if ค่าจ้างทำของ to a juristic/contractor; none for casual daily wage |
| `warehouse_fee` | ค่าโกดัง / ค่าเช่า | warehouse vendor | 5% on rent (ค่าเช่าอสังหาฯ) — see §6.3 |
| `fuel` | ค่าน้ำมัน | fuel station / staff | none (goods purchase, not a service) |
| `freight` | ค่าระวาง / ค่าขนส่ง | carrier | 1% transport |
| `customs_duty` | ค่าภาษีอากร / ค่าธรรมเนียมศุล | กรมศุลกากร | none (government) |
| `customs_fee` | ค่าดำเนินพิธีการ / ค่าตัวแทนออกของ | broker / customs agent | 3% service |
| `do_fee` | ค่า D/O | carrier / agent | 3% service (or per invoice) |
| `office_expense` | ค่าใช้จ่ายสำนักงาน | various | per case |
| `other` | อื่นๆ | — | per case — **note required** |

**Rule:** the per-line WHT default is *suggested* from `category` but the staff
member can override per line (audited via `wht_rate_pct`). A category never
hard-forces WHT — Thai WHT depends on **who the payee is** (juristic vs
individual vs government), which only the operator knows. The UI proposes; the
human confirms; the DB records.

---

## 5. Claim modes — เบิกขาด / เบิกเกิน / เบิกด่วน

`claim_mode` on the header. Four values; each changes one thing.

### 5.1 `standard` — เบิกปกติ
Claim = actual. Nothing special. Most เบิก.

### 5.2 `under_claim` — เบิกขาด (under-claim / shortfall top-up)
A previous เบิก paid out **less than the real cost**; this request is the
**top-up for the shortfall**. The owner's phrasing — เบิกขาด = "the claim came
up short."

Design:
- `expected_total_thb` = the originally-budgeted/expected cost.
- `claimed_total_thb` < `expected_total_thb` would normally be the *first* claim;
  `under_claim` is the **follow-up**: `parent_disbursement_id` (nullable
  self-FK) points at the earlier request, and `claimed_total` here = the gap.
- `variance_thb` (computed) is **negative on the parent** (under) — the report
  surfaces "เบิกขาด ฿X — รอ top-up".
- No special money risk: it is just another disbursement. The guard is that the
  **parent + child claimed sum** must still respect the job's cost ceiling
  (§8.2).

### 5.3 `over_claim` — เบิกเกิน (over-claim → must return the excess)
The claim paid out **more than the real cost** — the legacy
`จำนวนเงินยอดคืน` (returned amount) column. The excess is **money owed back to
Pacred** and must not be silently kept.

Design — this is the **highest-risk mode**, designed fail-closed:
- `expected_total_thb` = the real (lower) cost; `claimed_total_thb` = the
  (higher) amount paid; `variance_thb` (computed) is **positive** = the
  over-claim.
- `over_claim_reason` NOT NULL CHECK (must explain why more was taken).
- A paid `over_claim` request **opens an obligation**: a row in a
  `disbursement_returns` view/state — `return_status ∈ (pending, returned)`,
  `return_amount_thb = variance_thb`, `returned_at`, `return_slip_path`.
- The request **cannot be marked `reconciled`** until `return_status='returned'`
  with a slip — same gate philosophy as the commission-paid-needs-slip CHECK.
- Reporting: an **"เบิกเกินค้างคืน" aging list** (who owes return money, how
  long) — directly closes legacy §9.2 risk on the float having no discipline.

### 5.4 `urgent` — เบิกด่วน (urgent / expedited)
Not a *money* difference — a **process** difference. The cost is real and
normal; the claimant needs it **paid fast** (a carrier holding cargo, a customs
deadline).

Design:
- Modelled as `urgency='urgent'` (a column, orthogonal to `claim_mode`, so an
  urgent request can also be standard/under/over) **plus** `urgent_reason` CHECK.
- **Process effect, never a control bypass:** `urgent` may *route* approval to a
  faster lane (notify super immediately; shorter SLA target) but it **still
  requires the full approve→pay→slip path**. There is **no "skip approval"
  flag** — the money-OUT discipline is identical. Urgency changes the *speed*
  and *visibility*, not the *gates*. (This is the single most important
  anti-pattern to avoid: a "ด่วน" checkbox that disables review is exactly how
  embezzlement enters.)
- A guarded escape valve for true emergencies: `super` (only) may approve **and**
  pay in one action — but both the approval and the payment audit rows are still
  written, with `urgent_reason` attached. Two-person control is *preserved on
  the record* even when one person acts.

---

## 6. Withholding-tax certificate — the outbound 50-ทวิ (1% / 3%)

When Pacred **pays** a vendor/contractor, Thai law (ป.3266 / Revenue Code §3 ทวิ,
§50) makes Pacred the **withholding agent**: withhold a %, remit it to the RD by
the 7th of next month (ภ.ง.ด.3 for individuals / ภ.ง.ด.53 for juristic persons),
and hand the payee a **หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)**.

This is **legitimate, mandatory** Thai accounting — fully designed here. (It is
the *mirror* of ADR-0015, which is the cert Pacred *receives*.)

### 6.1 The rate set Pacred needs (per RD ป.3266 for service payments)

| WHT rate | ใช้กับ (applies to) | Pacred case |
|---|---|---|
| **1%** | ค่าขนส่ง (transport / freight) | paying a carrier, a trucking vendor — `category` freight / `do_fee`(transport part) |
| **3%** | ค่าบริการ / ค่าจ้างทำของ / ค่าจ้างวิชาชีพ | broker fees, customs-clearance service, contracted labour (ค่าจ้างทำของ), agent fees — `category` customs_fee / labour(contractor) / commission(to a juristic) |
| **5%** | ค่าเช่า (rental — incl. ค่าเช่าโกดัง) | warehouse rent paid to a lessor — `category` warehouse_fee |
| **2%** | ค่าโฆษณา | rare for เบิก — included for completeness |
| **PIT bracket** | เงินเดือน / ค่าคอมฯ จ้างบุคคลธรรมดา | commission to an *individual* — withheld per the progressive table; `commission_withdrawals` already defaults 15% |

The owner explicitly named **1% and 3%** — those are the two everyday เบิก rates
(freight vs service). The CHECK on `disbursement_lines.wht_rate_pct` ships as
`∈ {1,1.5,2,3,5}` (same allowed set as `0044`, future-proof), with the **UI
defaulting** 1% for transport categories and 3% for service categories. **A line
may carry both cases in one request** — line 1 (freight) → 1% cert, line 2
(broker fee) → 3% cert — exactly the owner's "issue 1% or 3% (or both), per
line."

### 6.2 `wht_certificates` table (migration `0075`)

One row per certificate issued. A certificate may cover **one or more lines to
the same payee at the same rate** (the RD form groups by payee + ประเภทเงินได้).

| Column | Purpose |
|---|---|
| `id` uuid PK | |
| `certificate_no` text unique | `WHT-{YYYY}-{seq}` — annual serial via `next_wht_certificate_no()` (RD wants per-year sequencing) |
| `disbursement_request_id` uuid → requests | the parent เบิก |
| `payee_name` text not null | |
| `payee_tax_id` text not null | 13-digit — validated |
| `payee_address` text | printed on the 50-ทวิ |
| `payer_entity` text not null | **which legal entity withheld** — Pacred (`0105564077716`); future-proofs the AXELRA/NNB two-entity problem (§8 risk) |
| `income_type` text | `transport` (40(8) ค่าขนส่ง) · `service` (40(8) ค่าบริการ/ค่าจ้างทำของ) · `rent` (40(5)) · `commission` (40(2)) — drives the RD form's ประเภทเงินได้ section |
| `tax_form` text | `pnd3` (payee = individual) · `pnd53` (payee = juristic) — decides which monthly return it rolls into |
| `gross_amount_thb` numeric(12,2) > 0 | sum of covered lines' `claimed_amount` |
| `wht_rate_pct` numeric(4,2) | the rate (1/3/5/…); CHECK against the allowed set |
| `wht_amount_thb` numeric(12,2) > 0 | `round(gross × rate/100, 2)` |
| `issued_at` timestamptz | when the cert was generated (at pay-time) |
| `issued_by_admin_id` uuid → profiles | |
| `pdf_storage_path` text | the rendered 50-ทวิ PDF — bucket `wht-certs-issued` |
| `rd_filing_period` text | `YYYY-MM` — the ภ.ง.ด. period this belongs to |
| `rd_filed_at` timestamptz (nullable) | set when the monthly return is filed — drives a "not-yet-filed" report |
| `status` text | `issued` · `voided` (a voided cert needs `void_reason`) |

**Linkage:** `disbursement_lines.wht_certificate_id` is backfilled to point here.
A deferred-FK pattern (same as `0054` accruals ↔ withdrawal_items) — the lines
exist first, the cert is created at pay-time, then the lines are stamped.

### 6.3 When the cert is issued — at **pay-time**, atomically

The certificate is created **inside the `markDisbursementPaid` action**, in the
same logical unit as the payment:

```
markDisbursementPaid(request_id, slip, paid_at):
  withAdmin(["super","accounting"]):
    1. load request + lines  (FOR UPDATE on the request row)
    2. assert status = 'approved'                    ← state guard
    3. assert no existing paid record (idempotency)  ← partial-unique catch
    4. for each group of lines (payee_tax_id, wht_rate_pct) where wht_applicable:
         create wht_certificates row  (next_wht_certificate_no)
         stamp the lines' wht_certificate_id
         render the 50-ทวิ PDF → wht-certs-issued bucket
    5. if paid_from involves a fund:
         insert disbursement_fund_movements (direction='disbursement', −net)
         ← the fund overdraw trigger fires here (fail-closed)
    6. update request: status='paid', paid_at, paid_by, slip_storage_path
    7. logAdminAction('disbursement.paid', ...)
```

Steps 4–6 must be **one transaction** (a Postgres function, mirroring the
recommendation in the money-audit §6 P2-3) so a half-state — money recorded
out, no cert; or cert issued, payment not recorded — is impossible.

### 6.4 Commission ↔ disbursement reconciliation

`commission_withdrawals` (0054) **already** handles commission payout with its
own approve→pay→slip lifecycle and a WHT field. To avoid two systems paying
commission:

- **V1:** the disbursement system **does not** re-implement commission payout.
  `commission_withdrawals` stays the system of record for commission. The
  disbursement system's `category='commission'` is for **ad-hoc / non-accrual**
  commission only (a one-off referral bonus). The two are siblings.
- **V1.1 convergence:** give `commission_withdrawals` the ability to **emit a
  `wht_certificates` row** when a withdrawal > the threshold is paid — so the
  commission earner gets a proper 50-ทวิ, and **all** WHT Pacred issues is in
  **one** `wht_certificates` table feeding **one** monthly ภ.ง.ด. export.
  Recorded as the convergence task — not built in V1.

---

## 7. Allocation, recovery & reconciliation

### 7.1 Allocation (categorise the cost onto a job)
Done at line level via `disbursement_allocations` (§4.2 Table C). Every line is
**fully allocated** — to a container / forwarder / freight shipment / order, or
to `central_fund`, or to `overhead`. `Σ allocations = line.claimed_amount`
(action-enforced + deferred-trigger-asserted). This produces a **clean per-job
cost roll-up** with referential integrity — the legacy free-text-shipment-ID
orphan bug (§8 risk #3) cannot recur.

### 7.2 Recovery (get the money back from the customer)
A job-allocated disbursement is a **cost the customer reimburses** via their
invoice (legacy `advance` column). Design:
- A view `v_job_disbursement_cost` — `SUM(allocated_amount_thb)` per
  `target_kind, target_ref` over **paid** disbursements.
- The freight/forwarder **invoice builder** reads this view so the operator can
  see "actual cost paid on this job = ฿X" while billing — the **billing-vs-cost
  cross-check** the legacy workflow did by hand (§7 step C9 of the legacy doc).
- `disbursement_requests.is_reconciled` flips true once the operator confirms
  the cost is reflected in an issued customer invoice. Not automatic — a human
  ties it (V1); a rule can automate later.

### 7.3 The margin guard
With `v_job_disbursement_cost` (cost) next to `freight_invoices` /
`forwarders.total_price` (revenue), a job's **margin is computed, never typed** —
killing legacy §9.2 risk #2 (hand-entered profit) and risk #1 (double-counting:
there is exactly **one** cost source — the disbursement ledger).

---

## 8. Money safeguards — disbursement is money OUT, design fail-closed

Each safeguard ties to an **existing** Pacred pattern so this is *extension*,
not invention.

### 8.1 Two-person control (the core control)
No money leaves on one person's say-so. `requested_by_admin_id` ≠
`approved_by_admin_id` ≠ (ideally) `paid_by_admin_id` — enforced by CHECK where
possible (`requested_by <> approved_by`) and by the action layer. Pattern:
`commission_withdrawals` approve/pay split. Even `urgent` (§5.4) keeps both
audit rows.

### 8.2 Over-claim ceiling guard — *the* headline safeguard
Mirror `lib/validators/refund.ts::checkRefundCeiling` exactly. A **pure
function** `checkDisbursementCeiling(jobExpectedCost, priorPaidDisbursements,
thisClaim)`:
- For a **job-allocated** request, the sum of paid disbursements allocated to a
  job **may not exceed that job's budgeted/expected cost** (from
  `container_costs` rate card, or the quote) without an explicit
  `over_claim` + reason. Money OUT against a job is ceilinged by the job's cost
  basis — just as a refund is ceilinged by what the customer paid.
- NaN / negative inputs ⇒ **treated as a violation** (fail-closed — copy
  `checkRefundCeiling` line 173).
- 2dp rounding before compare so float dust never trips it.

### 8.3 Fund overdraw guard
The `disbursement_fund` balance is a **computed view** (never a stored total —
the 0071 lesson). A `BEFORE INSERT` trigger on `disbursement_fund_movements`
projects `current_balance − this_disbursement` and **rejects a negative
projection**, with `SELECT … FOR UPDATE` on the fund row so it holds under
concurrent pays — a direct copy of `0064`'s `wallet_assert_no_overdraw`. You
cannot disburse a fund into the red.

### 8.4 Idempotency — no double-pay on a retry/double-click
A partial-unique index on the *paid* slice — e.g.
`unique (disbursement_request_id) where status='paid'` is implicit (one request
= one row), so the real guard is on the **side-effects**: the
`disbursement_fund_movements` insert for a given request is partial-unique on
`(disbursement_request_id) where direction='disbursement'`; the
`wht_certificates` insert is guarded by `next_wht_certificate_no()` + a unique
`(disbursement_request_id, payee_tax_id, wht_rate_pct)`. `markDisbursementPaid`
catches `23505` and re-SELECTs idempotently. This is the **F-11 pattern** the
money-audit (§2 P0-1, P1-2) found missing on forwarder/freight pay — the
disbursement system **bakes it in from day one**.

### 8.5 State-transition guard (no `paid → pending`)
The status machine is a **whitelist of `from→to` edges**, validated in the
action (the money-audit P1-5 found `adminUpdateWalletTransaction` lacks this).
Allowed: `draft→pending_approval`, `pending_approval→approved|rejected`,
`approved→paid|cancelled`, `pending_approval→cancelled`. **Forbidden:** anything
*out of* `paid` except a deliberate `void` flow (which writes a reversing fund
movement + voids the cert + logs — never a silent un-pay). `paid` and `rejected`
are otherwise terminal.

### 8.6 Amount sanity
Every money column `numeric(12,2)`. `claimed_amount_thb > 0` (CHECK — no zero,
no negative; a "negative เบิก" is a return, modelled explicitly as `over_claim`
+ `disbursement_returns`, not a sign flip). Per-line cap (`max 50_000_000`,
mirror `disbursements.ts`). `net = claimed − wht` arithmetic CHECK so the three
numbers can never disagree.

### 8.7 RLS — finance-only, role-pinned
Mirror `container_disbursements` + the 0062 W-1 keystone:
- `disbursement_requests` / `_lines` / `_allocations` / `wht_certificates` /
  fund tables: **super + accounting** full r/w.
- The **requester** (any staff role) may `INSERT` a `draft`/`pending_approval`
  request where `requested_by_admin_id = auth.uid()` and READ their **own**
  requests — same earner-scoped pattern as `commission_withdrawals`.
- Customer reads **nothing** — disbursement is internal AP. No customer policy
  = default-deny.
- Every admin policy **role-pinned** (no bare `is_admin()`).

### 8.8 Audit trail
Every mutation → `logAdminAction` → `admin_audit_log` (ADR-0014). `draft`,
`submit`, `approve`, `reject`, `pay`, `void`, `reconcile`, `return-received`
each log with the financial snapshot. A paid disbursement is fully reconstructable
from the audit log even if the row is later voided (the `disbursements.ts`
delete-then-log pattern).

### 8.9 Receipt / slip discipline
`status='paid'` ⇒ `slip_storage_path` NOT NULL (CHECK). Each line *should*
carry a `receipt_storage_path` (the vendor receipt) — a soft rule surfaced as a
"missing receipt" report, not a hard block (the receipt sometimes arrives after
payment). Storage buckets private, super+accounting + folder-scoped — copy
`disbursement-receipts` (0069) and `wht-certs` (0044).

### 8.10 The 10 legacy money risks — closed

| Legacy risk (§9.2) | Closed by |
|---|---|
| 1 — profit double-counting | §7.3 — one cost source (the disbursement ledger), margin computed |
| 2 — hand-entered profit/cost | §7.3 — `v_job_disbursement_cost` is a SUM, never typed |
| 3 — free-text shipment-ID orphans | §7.1 — `disbursement_allocations.target_ref` + FK'd targets |
| 4 — กองกลาง float, no discipline | §4.2-D + §8.3 — fund ledger + computed balance + overdraw trigger + approver on every movement |
| 5 — inconsistent rate cards | out of this doc's scope — `container_costs` (0069) already versions them |
| 6 — no WHT model | §6 — full outbound 50-ทวิ system |
| 7 — two entities, one tax ID reused | §6.2 — `wht_certificates.payer_entity` explicit; carry `billing_entity` on every doc |
| 8 — open CargoThai webhook | out of scope (a webhook-auth task) |
| 9 — manual PEAK mirroring | §6.2 `rd_filing_period` + a ภ.ง.ด. export feed PEAK reconciliation |
| 10 — slip-as-image, no amount match | §8.9 — slip required; pay action compares slip amount to `net_total_thb` before confirming |

---

## 9. Schema summary

Three new migrations (next free numbers — 0072 is latest applied):

**`0073_disbursements.sql`**
- `disbursement_seq` — monthly counter for `DB-{YYMM}-{seq}`.
- `disbursement_requests` — header (claim_mode, urgency, status, totals, payout).
- `disbursement_lines` — per-recipient items (category, recipient, amounts, WHT).
- `disbursement_allocations` — line → job/container/fund/overhead splits.
- `next_disbursement_no()` SECURITY DEFINER serial generator.
- RLS (super+accounting full; requester own; customer none) + audit-friendly.
- Storage bucket reuse: `disbursement-receipts` (already exists, 0069).

**`0074_disbursement_fund.sql`**
- `disbursement_fund` + `disbursement_fund_movements`.
- `v_disbursement_fund_balance` computed view (`security_invoker`).
- `disbursement_fund_assert_no_overdraw()` BEFORE-INSERT trigger (copy 0064).

**`0075_wht_certificates.sql`**
- `wht_certificates` — outbound 50-ทวิ (annual serial, payer_entity, income_type,
  tax_form, rd_filing_period).
- `next_wht_certificate_no()` SECURITY DEFINER (`WHT-{YYYY}-{seq}`).
- Backfill `disbursement_lines.wht_certificate_id` FK.
- New private storage bucket `wht-certs-issued` (separate from inbound
  `wht-certs` — different retention/access class, per the ADR-0015 Q4 logic).
- `v_job_disbursement_cost` view (paid-disbursement cost per job).

All migrations: idempotent (`if not exists` / `drop … if exists`), additive,
zero data migration, safe on prod live — the house style.

---

## 10. Build phases

Revenue-first lens — the cargo team needs to pay carriers/customs **now**;
WHT-cert and recovery refinement can follow.

**Phase D1 — the core เบิก loop (P0, ~1.5–2 days)**
- `0073` migration. `actions/admin/disbursement-requests.ts` —
  `createDisbursementDraft`, `addDisbursementLine` / `updateLine` / `removeLine`,
  `allocateLine`, `submitDisbursement` (draft→pending_approval),
  `approveDisbursement`, `rejectDisbursement`, `markDisbursementPaid`
  (the transactional pay — Postgres fn).
- All categories, all line/recipient breakdown, all four claim modes
  (under/over/urgent), the ceiling guard, idempotency, state guards.
- WHT fields recorded on the line; **cert PDF deferred to D3** (record the
  numbers in D1, generate the document in D3).
- Admin pages: `/admin/accounting/disbursements` list + a build/approve/pay
  detail view. RBAC super+accounting; requester self-serve create.

**Phase D2 — central fund (กองกลาง) (P1, ~0.5–1 day)**
- `0074`. Fund top-up / movement actions; `markDisbursementPaid` writes the
  fund movement; the overdraw trigger; the fund-balance + "เบิกเกินค้างคืน"
  aging dashboards.

**Phase D3 — WHT certificate (50-ทวิ) (P1, ~1–1.5 days)**
- `0075`. The cert generated atomically at pay-time; the 50-ทวิ PDF
  (`lib/pdf/*`, THSarabunNew — the house PDF stack); the **ภ.ง.ด.3 / ภ.ง.ด.53
  monthly export** grouped by `rd_filing_period`.
- This is a hard *legal* requirement but not a *revenue-blocker* — Pacred can
  pay carriers in D1 and issue the certs in D3 within the same tax month.

**Phase D4 — recovery, margin & convergence (P2, post-launch)**
- `v_job_disbursement_cost` wired into the freight/forwarder invoice builders
  (billing-vs-cost cross-check); `is_reconciled` flow.
- Commission convergence (§6.4) — `commission_withdrawals` emits
  `wht_certificates` rows; one unified WHT export.
- Consider folding `container_disbursements` (0069) into a VIEW over
  `disbursement_allocations` (§4.2 Table C note) so there is one AP ledger.

---

## 11. Open questions for เดฟ / ก๊อต

1. **`container_disbursements` (0069) fate** — keep as a synced read-model
   (V1, §4.2-C) or migrate to a VIEW (D4)? V1 design keeps both; D4 converges.
2. **Casual labour WHT** — ค่าแรงรายวัน to an individual labourer (not a
   contractor) is generally **not** withheld; ค่าจ้างทำของ to a contractor **is**
   (3%). The `labour` category defaults to *no WHT*; the operator ticks
   `wht_applicable` for the contractor case. Confirm this matches how Pacred
   actually pays labour.
3. **`paid_from` granularity** — `central_fund` / `company_bank` / `petty_cash`
   enough, or per-bank-account? V1 ships the 3-value enum; promote if needed.
4. **Annual vs monthly WHT serial** — `WHT-{YYYY}-{seq}` (annual) proposed;
   the RD form numbers per book/year. Confirm Pacred's accountant's preference.
5. **Two legal entities** — if AXELRA/NNB both still issue, `payer_entity` must
   be a controlled list and the PDF must print the right tax ID. Confirm the
   final entity list with ก๊อต (ties to the brand-split plan).
6. **`over_claim` return** — modelled as a `disbursement_returns` state gating
   `is_reconciled`. Confirm staff will actually record the return slip, or the
   aging report becomes the enforcement.

---

**End — `disbursement-system-2026-05-18.md`.** Survey grounded in migrations
0044/0053/0054/0064/0069/0071/0072 + `actions/admin/{disbursements,refunds,
commissions}.ts`; design grounds the เบิก/จ่าย flow, cost categories,
per-recipient lines, claim modes, the 1%/3% outbound WHT certificate, and the
money-OUT fail-closed safeguards. No gray-channel accounting designed — only
RD-compliant withholding.
