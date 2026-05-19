# 07 — Billing, Payments & Subscriptions — R&D

> **Author:** Dr. Billing (R&D specialist · billing/payments/subscriptions/dunning lens)
> **Date:** 2026-05-19 · **Branch surveyed:** `dave` (frosty-bhaskara-a38ced worktree)
> **Pacred state:** Post-launch (live since 2026-05-17). Phase 1 release running; the U1-U4 + Tier 0/1/2 capability batches have shipped on `dave`.
> **Scope reminder:** ADR-0004 = PromptPay-only pre-beta. Omise/Stripe/2C2P deferred post-beta; T+30d the owner picked Xendit + K-Biz + K-Shop (d7-payment-gateway-decision-matrix.md). This doc treats payment-gateway choice as **resolved** and zooms into the **billing/dunning/subscription layer**.
>
> **Owner ask (verbatim, the spine of this doc):**
> 1. **"ติ๊กรวดเดียววางบิล"** — bulk-tick → bulk invoice generation
> 2. **"ตั้งทุนรวมทีเดียว"** — bulk cost-setting
> 3. **"ปุ่มเดียวแจ้งไปหาลูกค้า"** — one button → notify customer (SMS + email + LINE)
> 4. **"ระบบเตือนจ่ายบิลรายเดือน"** — recurring bill payment reminders / dunning
> 5. **"บันทึกยอด subscribe program หน่วยงานละ ทีมละ คนละ กี่บาท หมดอายุเมื่อไหร่ ใครเป็นผู้รับผิดชอบ"** — subscription tracking per team/person with expiry + owner
>
> The 5 features above each get a dedicated subsection in §2 Gaps and §3 Recommendations.

---

## Table of contents

1. [Current state — what Pacred has today](#1-current-state)
   - 1.1 Customer wallet (live)
   - 1.2 Tax invoice + credit note (live)
   - 1.3 Freight invoice + payment ledger (live)
   - 1.4 Withholding tax (live, inbound only)
   - 1.5 Disbursement / AP (fragmentary)
   - 1.6 Refund money path (live)
   - 1.7 Notifications stack (in-app + LINE + email)
   - 1.8 Broadcasts (push-popup)
   - 1.9 Cron infrastructure (7 jobs)
   - 1.10 Bulk operations inventory
2. [Gaps — answering the 5 owner asks specifically](#2-gaps)
   - 2.1 ติ๊กรวดเดียววางบิล (bulk invoice)
   - 2.2 ตั้งทุนรวมทีเดียว (bulk cost-setting)
   - 2.3 ปุ่มเดียวแจ้งไปหาลูกค้า (one-button notify)
   - 2.4 ระบบเตือนจ่ายบิลรายเดือน (recurring dunning)
   - 2.5 บันทึกยอด subscribe program (subscription tracking)
   - 2.6 Cross-cutting gaps
3. [Recommendations — minimum-to-ship per owner ask](#3-recommendations)
   - 3.1 Bulk-invoice generator (BG-1)
   - 3.2 Bulk cost-setter (BC-1)
   - 3.3 Multi-channel notify (NF-1)
   - 3.4 Dunning engine (DN-1)
   - 3.5 Subscription tracker (SB-1)
   - 3.6 Cross-cutting recommendations
4. [Deeper research — tools, gateways, vendor matrix](#4-deeper-research)
   - 4.1 Email — Resend vs SendGrid vs SES
   - 4.2 LINE — Messaging API SDK + LIFF
   - 4.3 SMS — ThaiBulkSMS economics
   - 4.4 Invoicing — build vs Stripe Invoicing vs Xero/Odoo/PEAK
   - 4.5 Subscriptions — Postgres+cron vs Lago/Orb
   - 4.6 Dunning automation — work_items+crons vs Inngest
5. [References](#5-references)

---

## 1. Current state

### 1.0 Snapshot

| Capability | State | Surface |
|---|---|---|
| Customer wallet (top-up · withdraw · history · pay) | ✅ live | `actions/wallet.ts`, `/wallet/*`, migration 0007/0064 |
| Tax invoice issue / cancel / credit note | ✅ live | `actions/admin/tax-invoices.tsx`, migration 0034/0085 |
| Freight invoice + line items + payments ledger | ✅ live | `actions/admin/freight-invoices.ts`, `actions/admin/freight-invoice-payments.ts` |
| Withholding tax (inbound — customer withholds from Pacred) | ✅ live | migration 0044/0053, ADR-0015 |
| Container payments ledger (PCS-faithful) | ✅ shipped 2026-05-18 | `actions/admin/pcs-container-payments.ts`, migration 0081 |
| Container disbursements (AP, container-scoped) | ✅ live | `actions/admin/disbursements.ts`, migration 0069 |
| Commission ledger | ✅ live | migration 0054, real request→approve→pay cycle |
| Refund money path (U1-6) | ✅ live | `actions/admin/refunds.ts`, RF-YYMMDD-NNNN serial |
| In-app notifications (single-event log) | ✅ live | `lib/notifications/index.ts`, table `notifications` |
| LINE Messaging push (channel 2009931373 wired) | ✅ wired 2026-05-18 (LINE_PUSH_BYPASS gate) | `sendLinePush` in `lib/notifications/index.ts` |
| Email via Resend (code path live, awaiting key) | 🟡 code-ready | `sendEmail` in `lib/notifications/index.ts` |
| SMS (ThaiBulkSMS — OTP only today) | ✅ live (OTP path) | `lib/sms/gateway.ts` |
| Broadcasts (push-popup, bulk-insert notifications) | ✅ V1 live | `actions/admin/broadcasts.ts`, migration 0055 |
| Vercel crons (7 jobs registered) | ✅ live | `lib/cron/registry.ts` |
| Payment gateway integration (card/e-wallet) | ⏳ T+30d post-launch | Xendit + K-Biz + K-Shop per d7-matrix |
| **Bulk-tick → bulk invoice** | ❌ **not built** | — |
| **Bulk cost-setting** | 🟡 partial (container_costs rate card + per-row UI) | migration 0069 (single-row write) |
| **Single-button multi-channel notify** | 🟡 partial (auto-fanned, but no "send-now" admin button) | `sendNotification` always tries LINE→email |
| **Recurring bill reminders / dunning** | ❌ **not built** | only `auto-cancel-orders` cron exists (a hard-cancel, not a dunning ladder) |
| **Subscription tracking** | ❌ **not built** | no table, no UI, no enforcement |

### 1.1 Customer wallet (live)

Tables: `wallet` (3 buckets — `balance / cashback_balance / credit_balance`, migrated by 0007 trigger on `wallet_transactions` insert) + `wallet_transactions` (append-only ledger).

Server actions:
- `getWallet()` → balance read
- `listWalletTransactions(limit)` → history feed
- `getDepositQr(amount)` → PromptPay QR data-URL
- `createDeposit(input)` → PromptPay deposit request (slip optional; admin reviews)
- `createWithdraw(input)` → withdraw request with available-balance check (pending-aware via `getWalletAvailableBalance`, gap-customer §H-1 fix)
- `customerCancelPendingWalletTx(input)` → self-cancel a pending tx (uses admin client past RLS, audited as customer-initiated)

Admin actions: `actions/admin/wallet.ts` — `adminUpdateWalletTransaction` (approve/reject deposit/withdraw, slip-review).

DB safety:
- Migration 0064 `wallet_overdraw_guard` trigger (rejects any insert/update that would push balance negative — including pending-aware for non-credit transactions; gap-schema-security S-1).
- Partial-unique index on (`profile_id`, `kind`, `reference_type`, `reference_id`, `status='completed'`) — migration 0049 — protects service-order pay-from-wallet from double-debit. *Note: freight-payment and yuan-payment do NOT have this; see audit-money-billing-2026-05-17.md.*

Kinds enum (CHECK constraint, migration 0007 + extensions 0049/0063):
```
deposit · withdraw · refund · adjustment ·
order_payment · order_top_up · import_payment · import_top_up · yuan_payment ·
cashback_earn · cashback_redeem ·
credit_charge · credit_payment · wallet_to_credit_transfer
```

reference_type enum: `service_order · forwarder · yuan_payment · freight_invoice · manual · admin_adjustment` (last expanded 0063 for the freight-invoice bridge).

### 1.2 Tax invoice + credit note (live)

`tax_invoices` (ADR-0006 design, migration 0034) — header + immutable financial snapshot, monthly serial `INV-YYYYMM-NNNN` via `next_tax_invoice_serial()` SECURITY DEFINER RPC.

Actions: `actions/admin/tax-invoices.tsx`
- `issueTaxInvoice(id)` — pending→issued. WHT-cert gate enforces ADR-0015 ("ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ"). Reserves serial → renders PDF (@react-pdf/renderer with Sarabun font) → uploads to `tax-invoices` bucket → flips row.
- `cancelTaxInvoice(id, reason)` — issued→cancelled; original PDF stays, watermark on re-render.
- `issueCreditNote(originalInvoiceId, reason)` — **shipped 2026-05-18 (R3/G2e-2, migration 0085)**. Snapshots header+lines into a new row with `credit_note_for_id` backref + own serial; PDF renders "ใบลดหนี้".

VAT modes: inclusive (default — retail) / exclusive (enterprise-requested). Both 7%.

### 1.3 Freight invoice + payment ledger (live)

`freight_invoices` (ADR-0016 value model, migration 0051) — draft→issued→cancelled with value-block snapshot (commercial_value_usd/exchange_rate/declared_customs_value_thb/duty_thb/vat_thb/vat_plan_label/form_e_applied).

`freight_invoice_payments` (migration 0052) — append-only ledger keyed to `freight_invoices`:
- methods: `cash / bank_transfer / wallet`
- status: `recorded / voided`
- `payment_status` cache on parent (unpaid/partial/paid/overpaid) recomputed every insert/void
- Slips upload to bucket `freight-payment-slips`
- W-3 / G-3 wallet bridge fixed in migration 0063 — method='wallet' now writes a real `import_payment` debit referencing the payment row id, idempotency-guarded by partial-unique index `wallet_tx_freight_payment_uniq`.

Actions:
- `adminCreateFreightInvoice` → draft
- `adminAddFreightInvoiceLine` / `adminUpdateFreightInvoiceLine` / `adminDeleteFreightInvoiceLine` (draft only)
- `adminIssueFreightInvoice` → draft→issued, reserves invoice_no via `next_freight_invoice_serial`, snapshots parties + logistics + value block
- `adminCancelFreightInvoice` → issued→cancelled
- `recordFreightPayment` / `voidFreightPayment` / `uploadFreightPaymentSlip` / `listFreightPayments` / `getFreightReceiptGate`

PDFs generated under `/api/freight-invoice/[id]`:
- commercial invoice
- packing list
- Form E (ASEAN-China FTA)
- D/O letter (sea)

### 1.4 Withholding tax (live — inbound only)

`withholding_tax_entries` (migration 0044 + 0053 for freight-invoice key) — when a juristic customer withholds 1% / 1.5% / 2% / 3% / 5% from Pacred, this row exists and gates receipt issuance until cert_status flips from `pending → received` (cert uploaded) or `waived` (super/accounting only, requires reason).

Schema:
- Parent XOR: exactly one of `order_h_no / forwarder_f_no / freight_invoice_id` must be set
- `wht_base_thb` (staff-confirmed service portion) · `wht_rate_pct` · `wht_amount_thb` · `net_expected_thb`
- `cert_status` (`pending / received / waived`) · `cert_number` · `cert_storage_path` (bucket `wht-certs`)
- `cert_received_at` · `waived_reason` · `recorded_by_admin`

**Critical scope point: outbound WHT (50-ทวิ Pacred issues to its own vendors) is NOT modelled.** Disbursement-system-2026-05-18.md flags this as a hole. The disbursement design includes `wht_certificates` as a sibling table for outbound certs — not built yet.

### 1.5 Disbursement / AP (fragmentary)

Three disconnected ledgers exist; this is **the largest single billing-system gap** even bigger than the 5 owner asks because it underpins all of them:

| Ledger | Migration | Scope | Has approve flow? | Has WHT cert? |
|---|---|---|---|---|
| `commission_*` (5 tables) | 0054 | commission earnings only | ✅ pending→approved→paid | 🟡 number-on-header, no cert PDF |
| `container_disbursements` | 0069 | container-scoped AP outflows | ❌ paid_at presence = paid | ❌ |
| `tb_cnt` PCS-faithful ledger | 0081 | China-side container payment slips | 🟡 status "1"/"2" only | ❌ |

The owner's model (per `disbursement-system-2026-05-18.md`) is **request → categorise+allocate → approve → pay → recover → WHT-cert**, with:
- Per-recipient line breakdown (item-1→person-A, item-2→person-B in one request)
- Claim modes: เบิกขาด (under) / เบิกเกิน (over) / เบิกด่วน (urgent)
- Central-fund (`disbursement_fund`) balance as a computed running total
- Outbound WHT cert PDF issuance to vendors

V1 design exists. Not built.

### 1.6 Refund money path (live)

`refund_requests` (U1-6, R1-style) — pending→approved→paid lifecycle. Customer can self-create (`customerCreateRefundRequest`); admin can also create on customer's behalf (`adminCreateRefund` — over-collection scenario).

Serial: `RF-YYMMDD-NNNN` via `next_refund_request_no` RPC.

On `adminMarkRefundPaid`:
- Writes a `wallet_transactions` row: `kind='refund'`, `amount=+x` (positive credit; overdraw guard ignores credits), `reference_type='manual'`, `reference_id=request_no`, `note='Refund RF-... : <reason snippet>'`
- Ceiling check via `checkRefundCeiling` (never refund more than the parent flow netted)
- Audit log + customer notification

### 1.7 Notifications stack (in-app + LINE + email)

`lib/notifications/index.ts::sendNotification(profileId, payload)`:
1. **Always inserts** into `notifications` table (append-only event log) — always reaches the bell icon
2. Tries LINE push if `profiles.line_user_id` present AND `notify_channels.line !== false` (LIFF link flow at `/liff/link`)
3. Email fallback (Resend) if LINE failed AND `notify_channels.email !== false`
4. `LINE_PUSH_BYPASS=true` (default) → step 2 skipped; just logs

Templates live in `lib/notifications/templates.ts` (379 lines · all builders typed): wallet (deposit/withdraw/status), forwarder, tax invoice, credit note, sales rep transfer, customer lifecycle, refunds. Pattern: `notify.<verbInDomain>(opts) → NotifyPayload`.

The send is **already multi-channel by default** for every triggered event — LINE first then email. SMS is **not** wired into `sendNotification` today (it's only used for OTP via `lib/sms/gateway.ts::sendSms`).

### 1.8 Broadcasts (push-popup)

`actions/admin/broadcasts.ts` + migration 0055 — V1 admin broadcast system. Lifecycle `draft → scheduled → sending → sent / cancelled`.

`adminSendBroadcastNow`:
1. Resolves target `profile_ids` from audience filter (all / specific_ids / segments — what segments exist depends on schema; the broadcast table supports it)
2. Bulk-inserts `notifications` rows (1 per target, all linked via `notifications.broadcast_id` FK)
3. Updates `broadcasts.sent_count = N` + status='sent' + sent_at

Cron: `/api/cron/send-scheduled-broadcasts` every 5 min — flips `scheduled` rows whose `scheduled_for <= now()` into `sent`.

**Hard limits today:**
- V1 = in-app `notifications` rows ONLY. **No fan-out to LINE push or email** in the broadcast path. (Each individual `notifications` row WILL get the LINE-push attempt the next time a relevant action fires `sendNotification` — but the broadcast fan-out itself uses a raw insert.)
- No per-second rate limiting (V1 = single bulk insert which is fast)
- No "send to LINE OA" wholesale (this would use LINE Messaging API multicast endpoint — `up to 500 user IDs per call`)

### 1.9 Cron infrastructure (7 jobs)

`lib/cron/registry.ts`:

| path | schedule | what |
|---|---|---|
| `/api/cron/auto-cancel-orders` | `*/15 * * * *` | ยกเลิก service_orders ที่ status=awaiting_payment + payment_due_at < now |
| `/api/cron/sales-daily-digest` | `5 17 * * *` (00:05 ICT) | สรุปยอดขายเมื่อวานให้ super + sales_admin |
| `/api/cron/refresh-active-customers` | `0 1 * * *` (08:00 ICT) | flip profiles.is_active |
| `/api/cron/expire-probation` | `0 2 * * *` (09:00 ICT) | ปิดสิทธิ์ probation พนักงาน |
| `/api/cron/expire-driver-assignments` | `0 * * * *` | flip forwarder_driver 1→3 ถ้ามอบงานเกิน 17 ชม. |
| `/api/cron/sms-balance-check` | `0 23 * * *` (06:00 ICT) | เตือน super/ops/accounting เมื่อ SMS balance < threshold |
| `/api/cron/send-scheduled-broadcasts` | `*/5 * * * *` | ส่ง broadcast ตั้งเวลา |

**Cron infrastructure is healthy** (vercel.json + registry + `instrument.ts` for audit log) — extending it for dunning/subscription is straightforward.

### 1.10 Bulk operations inventory

What we DO have:
- `adminBulkTransferRep` (mass-transfer customers between sales reps; `actions/admin/admins.ts`)
- `bulk-tracking-search` (paste 50 tracking numbers, get forwarder lookup; `actions/admin/bulk-tracking-search.ts`)
- `adminSendBroadcastNow` (bulk-insert notifications)
- `csv-imports` (mass import via CSV — `actions/admin/csv-imports.ts`)

What we DO NOT have:
- Multi-select-and-bulk-act on invoices ❌
- Multi-select-and-bulk-act on freight shipments ❌
- Multi-select-and-bulk-act on disbursements ❌
- Multi-select-and-bulk-act on container costs ❌
- Multi-select-and-bulk-act on wallet transactions ❌
- Multi-select-and-bulk-act on customers (apart from sales-rep transfer) ❌

**No "checkbox + bulk action" pattern exists in the admin UI today**. Every transactional admin action is per-row.

---

## 2. Gaps

### 2.1 Owner ask #1 — ติ๊กรวดเดียววางบิล (bulk invoice)

**What the owner asked for:** A list view where admin checks N rows + clicks "วางบิล" once → N invoices materialise (drafted + issued + customer notified + ready to download).

**Current state — partial, ~25% of flow:**
- ✅ The per-row issuance flow exists for both tax_invoices (`issueTaxInvoice`) and freight_invoices (`adminIssueFreightInvoice`).
- ✅ Atomic serial generators (`next_tax_invoice_serial`, `next_freight_invoice_serial`) handle concurrent calls safely — bulk-issue won't break numbering.
- ✅ PDF render + storage upload + customer notification pattern is solid per-row.
- ❌ **No multi-select UI on `/admin/tax-invoices` or `/admin/freight/shipments`**.
- ❌ **No `adminBulkIssueTaxInvoices(ids[])` or `adminBulkIssueFreightInvoices(ids[])` server action**.
- ❌ **No "create draft + issue in one go" combined action** — today admin creates a draft, then issues. Bulk path needs both compressed into one click.
- ❌ **No "select shipments without invoices → create draft → issue all" cascade**. Today: shipment → manually click "create invoice" → manually click "add line" N times → manually click "issue". A bulk path needs to draft from a template, lines auto-derived from shipment value block.

**Failure modes a naive bulk path would hit (must be designed around):**
- WHT-cert gate (ADR-0015) fires per-row → bulk-issue must surface a "5 of 12 blocked on WHT cert" report instead of partial-fail.
- Tax invoice has manual VAT-mode choice (inclusive/exclusive) per customer — bulk path needs a default + per-row override.
- Freight invoice lines must come from somewhere — either the shipment commodities (if structured), or a template (freight forwarder fee + container handling + last-mile delivery) the admin tweaks once and applies to all selected.
- Serial reservation gaps on PDF render failure (already accepted gap-by-design per `tax-invoices.tsx` comments) — bulk path must log per-row outcomes; never let one PDF failure kill 49 successes.

**% of flow built today: ~25%.** Mechanics (serial, render, RLS, audit, notify) are solid. UI multi-select + bulk action server-side + "compress draft + issue" + per-row outcome surfacing = all missing.

### 2.2 Owner ask #2 — ตั้งทุนรวมทีเดียว (bulk cost-setting)

**What the owner asked for:** Set the cost for many rows (containers / shipments / orders) in one action. *"ทุน"* = expected cost (container_costs rate card) or actual outflow (container_disbursements / freight_invoice line).

**Current state — partial, ~20% of flow:**
- ✅ `container_costs` table (migration 0069) stores expected/rate-card cost per container per kind. Per-row write path exists in `actions/admin/container-costs.ts`.
- ✅ `container_disbursements` table stores per-container actual AP outflows.
- ✅ `freight_invoice_lines` table stores per-line qty × unit_price = amount.
- ✅ Forwarder `total_price` calc is centralised in `lib/forwarder/calc-price.ts`.
- ❌ **No `adminBulkSetContainerCost(containerIds[], kind, amount_thb)` server action**.
- ❌ **No "apply same rate-card to N selected containers" admin UI**.
- ❌ **No "templated lines" pattern** — admin can't say "every selected freight shipment gets these 3 standard lines at these standard prices".
- ❌ **No rate-card library** — admin has to retype the unit price for every shipment. A library would be: warehouse-Guangzhou-truck-to-Bangkok = ฿X/cbm; sea-ningbo-to-Laem-Chabang = $Y/TEU; etc.
- ❌ **No mass-update with cost reason** — e.g. "ราคาน้ำมันขึ้น 5% → apply +5% to all open freight quotes" requires per-row UI today.

**% of flow built today: ~20%.** The tables and per-row writes are solid. The "select N + apply once" UI + the rate-card library + the templated-lines pattern are all missing.

### 2.3 Owner ask #3 — ปุ่มเดียวแจ้งไปหาลูกค้า (one-button multi-channel notify)

**What the owner asked for:** An admin button on a customer / order / invoice that fires a notification across SMS + email + LINE in one click — for ad-hoc cases like "this customer needs to be told their container is delayed" or "this customer needs to pay the outstanding bill now".

**Current state — partial, ~55% of flow:**
- ✅ `sendNotification` already fans out to LINE + email automatically for every event-triggered notification.
- ✅ LINE Messaging API is wired (channel 2009931373; LINE_PUSH_BYPASS gate).
- ✅ Email path via Resend is code-ready (awaiting `RESEND_API_KEY` from ก๊อต).
- ✅ Per-customer channel prefs exist (`profiles.notify_channels.line / .email`).
- ✅ Broadcasts system covers the "tell many customers something" case (V1 = in-app only; LINE multicast not wired).
- ❌ **SMS is NOT plumbed into `sendNotification`** — only OTP uses the SMS gateway. Adding ad-hoc SMS notifications means adding a `sendSms` call in the notification dispatcher.
- ❌ **No admin UI "send custom message now" button** on a customer / order / invoice detail page. The closest thing is broadcasts (audience-of-1 use case is awkward).
- ❌ **No templating UI** for one-off messages — admin types body free-text per send. Risk of inconsistent wording.
- ❌ **No per-channel delivery feedback UI** — admin clicks send, doesn't see "✅ LINE delivered · ❌ email bounced · ⏳ SMS queued".
- ❌ **Cost-aware channel ordering missing** — SMS is ~฿0.20-0.50/send (Thai), email is ~฿0.01, LINE-push is free (within OA monthly quota). A one-click "all channels" without cost awareness can burn SMS budget. The owner needs a "LINE first, email fallback, SMS only if both fail" or per-channel toggle on the UI.

**% of flow built today: ~55%.** Multi-channel fan-out exists for event-driven notifications; the per-channel pieces are wired or code-ready. The ad-hoc admin button, SMS dispatcher, delivery feedback UI, and the cost-aware sequencing are missing.

### 2.4 Owner ask #4 — ระบบเตือนจ่ายบิลรายเดือน (recurring dunning)

**What the owner asked for:** A system that reminds customers to pay bills (forwarder, freight, tax invoice) on a monthly cadence, escalating if unpaid (T+0 reminder → T+3 follow-up → T+7 final notice → admin escalation).

**Current state — minimal, ~10% of flow:**
- ✅ `auto-cancel-orders` cron exists — but it's a hard-cancel of unpaid `service_orders` at `payment_due_at`, not a dunning ladder. After 24-48h it cancels the order entirely — no reminder before.
- ✅ `notifications` table + `sendNotification` are the right dispatch path; templates can be added in 1 line each to `lib/notifications/templates.ts`.
- ✅ Cron infrastructure exists (7 jobs registered; adding `/api/cron/dunning-sweep` is mechanical).
- 🟡 The **work_items spine** (migration 0080, shipped) provides exactly the right substrate for "tasks staff need to follow up on" — a dunning ladder could materialise an `dunning_followup` work item at T+3 to assign to the customer's sales rep.
- ❌ **No `dunning_schedules` or `dunning_steps` table** — no model of "which bill is on which step".
- ❌ **No `dunning_events` log** — no audit of when each step fired and what channel.
- ❌ **No `/admin/dunning` UI** for staff to see all customers in dunning + override / pause / mark "paid via off-platform channel".
- ❌ **No customer-portal "you have overdue invoices" banner** — today the wallet/orders pages don't aggregate overdue across all flows.
- ❌ **No "outstanding balance per customer" rollup** — to dun you have to know what's owed. Today `freight_invoices.payment_status` exists per invoice but no per-customer view aggregates `unpaid + partial` across all invoice types.

**Critical sub-point: there is NO TRUE "MONTHLY BILL" CONCEPT TODAY.** Each cargo order / freight shipment is billed separately. The owner's request for "เตือนจ่ายบิลรายเดือน" implies monthly aggregated billing — a statement-style "you owe Pacred ฿42,000 this month" rollup that's billed once. Pacred bills per-shipment. The dunning system therefore needs to be either:
- (a) **per-invoice dunning** — chase each unpaid invoice individually, OR
- (b) **build a monthly statement system first**, then dun the statement.

Option (a) is the minimum-to-ship; option (b) is the larger correct system the owner likely envisions for VIP/SVIP customers who do many shipments per month.

**% of flow built today: ~10%.** All the parts (cron, templates, notifications) are independently solid. The dunning model itself, the monthly statement model, and the admin/customer UIs are all missing.

### 2.5 Owner ask #5 — บันทึกยอด subscribe program (subscription tracking)

**What the owner asked for** (verbatim): *"บันทึกยอด subscribe program หน่วยงานละ ทีมละ คนละ กี่บาท หมดอายุเมื่อไหร่ ใครเป็นผู้รับผิดชอบ"*

Translation: a registry of subscriptions Pacred carries — per department / per team / per person — tracking the THB amount, expiry date, and responsible owner. **This is Pacred-internal SaaS-spend tracking** (Notion / Vercel / Supabase / Resend / Sentry / GTM Pro / etc.) — NOT a customer-facing subscription billing system.

> Re-reading: *"subscribe program หน่วยงานละ ทีมละ คนละ"* = subscription program {per dept · per team · per person}. The split is by **internal cost-center**, not by customer. The owner wants to know who pays for what, when each renews, who's accountable. Same insight as the SaaS-spend-audit playbook.

**Current state — 0% built:**
- ❌ No `subscriptions` table
- ❌ No `subscription_renewals` schedule
- ❌ No `/admin/subscriptions` UI
- ❌ No renewal-reminder cron
- ❌ No vendor / receipt-PDF storage
- ❌ No cost-center assignment (admin / role)
- ❌ No depreciation / TCO model

**Re-interpretation alternative (less likely but worth flagging):** if the owner *did* mean customer-facing subscriptions (e.g. monthly storage subscription, VIP-tier monthly fee, premium support tier) — that's also 0% built. Pacred has no recurring-billing infrastructure of any kind. ADR-0004 explicitly notes "Recurring payment / saved card — N/A for cargo's discrete-order model anyway."

**Recommendation: build for the internal-SaaS-tracking interpretation first** (smaller scope, immediate operational value). If a customer-facing subscription product emerges later (VIP membership, premium warehousing), the schema generalises.

**% of flow built today: 0%.**

### 2.6 Cross-cutting gaps

#### 2.6.1 No customer-side dunning UX

Customer dashboards don't show **aggregate overdue balance**. Each page (`/wallet`, `/sales`, `/shipments`) shows its own slice. A customer with 3 unpaid freight invoices + 2 unpaid forwarders + 1 unpaid tax invoice sees three lists but no single "you owe Pacred ฿X across N invoices" header. This silently lengthens DSO (days sales outstanding) because customers don't see the totality.

#### 2.6.2 No outbound WHT (50-ทวิ Pacred issues)

Inbound WHT (customer withholds from Pacred) is modelled by `withholding_tax_entries`. Outbound WHT (Pacred withholds 1% from a transport vendor, 3% from a service vendor — required by Section 50 of RD Code when Pacred pays a juristic vendor) is not modelled. The disbursement system design (disbursement-system-2026-05-18.md) addresses this but not yet built.

#### 2.6.3 Template management lives in code, not DB

`lib/notifications/templates.ts` (379 lines) holds all notification copy in TypeScript. Edits require code change + deploy. There's no admin UI to edit a template — say, "shorten the wallet-deposit-approved body" — without a dev. For Pacred's "marketing reps need to A/B test wording" use case, this would burn dev time on every iteration.

Tradeoff: code-templates are type-safe and easier to grep. DB-templates need a templating engine (Handlebars-style or simple `{var}` substitution) + escaping discipline + an admin UI. Build a DB-template system only when wording iteration friction is real.

#### 2.6.4 No audit trail on money movements (almost)

Most money-mutating actions DO log to `admin_audit_log` via `logAdminAction(adminId, action, target_type, target_id, payload)` — wallet approve/reject, tax-invoice issue/cancel, freight invoice issue, disbursement create/update/delete, refund approve/paid, broadcast send. Good.

What's missing:
- **Customer-initiated** wallet-cancel uses the same pattern but `admin_id` is set to the customer's `profile_id` with a `customer_initiated=true` marker in payload. Querying "all actions by customer C" requires WHERE on `payload->>'customer_initiated'` — awkward but works.
- **Bulk operations** (broadcasts, bulk-rep-transfer) log a single audit row with `target_id="{count}_targets"` — losing individual target traceability. For a bulk-invoice flow at scale (issue 200 invoices), the audit needs N rows or a `bulk_id` foreign key. Today the broadcast system has `notifications.broadcast_id` (good); the bulk-rep-transfer does not.

#### 2.6.5 Payment-gateway timeline (T+30d)

Per d7-payment-gateway-decision-matrix.md, **Xendit + K-Biz + K-Shop wire-up starts T+30d post-launch** (so ~mid-June 2026). All five owner asks must work **without** the gateway too — because for the first 30-60 days Pacred is still on PromptPay-only + slip-upload. The bulk-invoice flow is independent of gateway choice (it makes the invoice; payment happens however). But customer-side "pay this invoice with one click" needs the gateway to be ergonomic.

#### 2.6.6 The `notifications.broadcast_id` linkage is good — generalise it

Today the `notifications` table has a `broadcast_id` FK so "where did this notification come from" is queryable for broadcast events. The same pattern would help for `dunning_step_id` (which dunning step fired this) and `subscription_renewal_id` (which subscription reminder fired this). Add as the build proceeds.

#### 2.6.7 Idempotency drift across money-mutation paths

Per audit-money-billing-2026-05-17.md: `service_order` pay-from-wallet has the F-11 DB-level partial-unique guard (migration 0049). `freight_invoice` payment ledger has the partial-unique guard added in migration 0061. `yuan_payment` does not. `forwarder` cost-adjustment vs main-payment used to collide (P0-1 in the audit). Bulk-invoice + bulk-cost paths must lean on the existing F-11 pattern wherever they touch money — and the audit's recommendation of "give cost adjustments their own kind" should land before any bulk path multiplies the exposure.

---

## 3. Recommendations

> Naming convention: **BG-X** = bulk-invoice; **BC-X** = bulk-cost; **NF-X** = notify; **DN-X** = dunning; **SB-X** = subscription. Effort estimates assume ภูม-grade engineer familiar with the codebase.

### 3.1 BG-1 — Bulk-invoice generator (owner ask #1)

**Scope:** Multi-select on `/admin/tax-invoices` and `/admin/freight/shipments` → "วางบิล" button → bulk action. Return per-row outcomes.

**Minimum to ship — two flavours:**

#### 3.1.1 BG-1a — Bulk-issue tax invoices (already-drafted pending rows)

The narrowest correct version. Today admin draft-creates a tax invoice (`tax_invoices.status='pending'`) by customer request. To go from pending to issued is one button per row. Bulk just lets you tick 50 pending rows and issue them all.

**Files to add/touch:**
- `actions/admin/tax-invoices.tsx` — add `bulkIssueTaxInvoices(ids: string[])`:
  - For each id, call internal `_issueOneTaxInvoice(id, adminId)` (extract from `issueTaxInvoice` body)
  - Collect per-row `{id, ok, error?}` outcomes
  - Single audit log row with `target_id="${ids.length}_invoices"` + payload `{ids, outcomes}` PLUS individual rows from the existing `_issueOneTaxInvoice` audit
  - Return `{ok: true, data: outcomes}` always (caller renders outcome list)
- `app/[locale]/(admin)/admin/tax-invoices/page.tsx` — add checkbox column + bulk-action toolbar + outcome modal
- Notification: one batched email/LINE to the issuing admin summarising "Issued N · skipped M (WHT pending) · failed K" (the per-customer notifications already fire from `_issueOneTaxInvoice`)

**Effort: ~6-8h.** Sequential issuance (not parallel — serial generator is sequential by design; concurrent calls would mostly serialise anyway).

**Impact: high.** Closes the smallest version of owner ask #1. Single screen action. Audit-clean.

#### 3.1.2 BG-1b — Bulk "draft from shipment + issue" (the bigger one)

The owner's true ask is probably *"select 30 shipments → ติ๊กรวดเดียววางบิล → 30 invoices DONE"*. That needs the draft creation in the bulk path too.

**New server action:** `bulkCreateAndIssueFreightInvoices(shipmentIds: string[], options: { templateLines: TemplateLine[]; vatMode: 'inclusive'|'exclusive' })` — for each shipment:
1. Refuse if shipment.status='cancelled' or already has issued invoice
2. Create draft via existing `adminCreateFreightInvoice` internals
3. Add template lines (e.g. `{description: 'Freight charge', qty: shipment.cbm, unit_price_usd: rateCardUsd}`)
4. Issue via existing `adminIssueFreightInvoice` internals
5. Per-row outcome

**Template-lines mechanism (this is the critical sub-piece):**

Add `freight_invoice_templates` table — staff-curated line patterns:
```sql
create table freight_invoice_templates (
  id uuid pk,
  name text,                                 -- "Standard FCL 20'", "LCL air China-BKK"
  applies_to_mode text,                      -- 'fcl_sea', 'lcl_sea', 'air', 'truck_china'
  lines jsonb,                               -- [{description, qty_formula, unit_price_usd}, ...]
  created_by_admin_id uuid,
  active boolean default true
);
```

`qty_formula` examples: `'cbm'` (read from shipment.cbm), `'cartons'`, `'gross_weight_kg/1000'`, `'1'` (fixed). Server-side resolver evaluates the formula against the shipment row.

**Effort: ~12-16h** for the bulk action + template table + admin UI to pick/preview templates before issue.

**Impact: very high.** This is the biggest single revenue-velocity feature the owner asked for — turns 30 minutes of clicking into 30 seconds.

**Risk to design around:**
- WHT-cert gate per shipment — bulk path must return blocked rows so admin can chase the certs and re-run
- Serial reservation gaps on render fail — accept-and-log (precedent)
- The 50-ทวิ chase loop — see DN-1 for the dunning side of this

### 3.2 BC-1 — Bulk cost-setter (owner ask #2)

**Scope:** Multi-select on `/admin/warehouse/containers` and `/admin/freight/shipments` → "ตั้งทุน" button → enter one amount → apply to all. Plus a rate-card library to avoid retyping.

**Minimum to ship:**

#### 3.2.1 BC-1a — Bulk container_costs set

**New action:** `bulkSetContainerCosts(containerIds: string[], kind: ContainerCostKind, amount_thb: number, source: 'manual'|'ratecard', rateCardId?: string)`:
- For each container, upsert (`cargo_container_id`, `kind`) → `amount_thb`
- Audit per row + parent-bulk row
- Idempotent (upsert)

**Effort: ~3-4h.** Smallest bulk action.

#### 3.2.2 BC-1b — Rate-card library

**New table:** `cost_rate_cards`:
```sql
create table cost_rate_cards (
  id uuid pk,
  name text,                                 -- "Guangzhou-BKK truck per cbm", "Ningbo-LCB FCL 20'"
  applies_to text,                           -- 'container', 'shipment', 'forwarder'
  kind text,                                 -- matches container_disbursements.kind
  unit text,                                 -- 'cbm', 'kg', 'piece', 'flat'
  unit_price_thb numeric(12,2),
  currency text default 'THB',
  effective_from date,
  effective_to date,
  source_warehouse text,                     -- 'gz', 'sz', 'sha'
  destination text,                          -- 'bkk', 'cm', 'cnx'
  notes text,
  active boolean default true,
  created_by_admin_id uuid
);
```

UI: `/admin/accounting/rate-cards` — CRUD list (super + accounting). On the bulk-cost-setter modal, admin picks a rate card → unit price + currency auto-populated; admin still confirms amounts before commit.

**Effort: ~10-14h** (table + admin UI + bulk-setter integration).

#### 3.2.3 BC-1c — Templated lines feeding both BG-1b and BC-1b

The freight_invoice_templates in BG-1b are conceptually a rate-card. The minimum win is **one** templates table that BOTH the bulk-invoice and bulk-cost paths read from. Build BC-1b's `cost_rate_cards` as the foundation; BG-1b extends to allow `unit_price_usd` (foreign-currency) for invoice lines.

**Total BC-1 effort: ~13-18h.**

### 3.3 NF-1 — Multi-channel notify (owner ask #3)

**Scope:** Admin button on customer / order / invoice → ad-hoc message → sent to SMS + email + LINE simultaneously, with cost-aware sequencing and per-channel delivery feedback.

**Minimum to ship:**

#### 3.3.1 NF-1a — Plumb SMS into `sendNotification`

Extend `lib/notifications/index.ts::sendNotification` to optionally try SMS:
- After LINE + email path, IF `payload.allow_sms === true` AND no delivery yet AND `profile.phone` present → call `sendSms(phone, smartShortify(payload))`
- Add `delivered_sms_at` column on `notifications` (migration ~3 lines)
- Update `profiles.notify_channels` to include `.sms?: boolean` (default false — opt-in, because of cost)
- Audit log per send (covered already)

**Effort: ~3-4h.**

#### 3.3.2 NF-1b — "Send custom message" admin action

**New action:** `adminSendAdHocNotification(input: { recipient_profile_id: string; subject: string; body: string; channels: ('line'|'email'|'sms')[]; link_href?: string; reference_type?: string; reference_id?: string })`:
- Calls `sendNotification` with `category: 'admin_message'` + the right `notify_channels` overrides
- Returns per-channel delivery result `{line: 'delivered'|'failed'|'skipped'; email: ...; sms: ...}`
- Audit row

**Admin UI placement:**
- On customer detail page (`/admin/customers/[id]`) — "Send message" button → modal
- On freight shipment detail — "Notify customer" button → preselects `reference_type='freight_invoice'`
- On forwarder detail — same pattern

**Effort: ~6-8h** (action + 3 UI placements).

#### 3.3.3 NF-1c — Template-pick modal (optional but recommended)

A dropdown of common ad-hoc templates so admin doesn't free-type every time:
- "Your shipment is delayed by N days" `{shipment_code} {delay_days}`
- "Your invoice is overdue — please pay" `{invoice_no} {amount_thb} {pay_url}`
- "Your WHT cert is needed" `{cert_amount_thb} {upload_url}`
- "Custom message" — free-text fallback

**New table:** `notification_templates` (10-15 starter rows; admin can add more):
```sql
create table notification_templates (
  id uuid pk,
  name text,
  category text,                             -- matches notifications.category
  subject_th text, subject_en text,
  body_th text, body_en text,                -- with {placeholders}
  vars jsonb,                                -- ["shipment_code", "delay_days"]
  default_channels jsonb,                    -- ["line", "email"]
  active boolean,
  created_by_admin_id uuid
);
```

**Effort: ~6-8h** (table + seed + render-with-substitution + admin UI).

**Total NF-1 effort: ~15-20h.**

**Impact: high.** Owner ask #3 → solved. Also unblocks the dunning system (DN-1 uses the same templates).

### 3.4 DN-1 — Dunning engine (owner ask #4)

**Scope:** Auto-remind customers about overdue bills on a configurable cadence; escalate via channels; surface a staff queue when customer doesn't pay.

**Minimum to ship — three-table model:**

#### 3.4.1 DN-1a — Schema

**`dunning_policies`** — staff-configurable ladders (one default policy V1; later, per-customer/per-product overrides):
```sql
create table dunning_policies (
  id uuid pk,
  name text default 'default',
  steps jsonb,                                -- [{offset_days, channels, template_id, severity}, ...]
  active boolean default true,
  created_by_admin_id uuid
);
-- Example seed:
-- steps = [
--   { offset_days: 0,  channels: ['line','email'],         template_id: '<reminder_template>',  severity: 'info' },
--   { offset_days: 3,  channels: ['line','email'],         template_id: '<followup_template>',   severity: 'warning' },
--   { offset_days: 7,  channels: ['line','email','sms'],   template_id: '<final_notice>',       severity: 'urgent' },
--   { offset_days: 14, channels: [],                       template_id: null,
--     severity: 'critical', escalate_to_admin: true }
-- ]
```

**`dunning_schedules`** — one row per "bill in a dunning ladder":
```sql
create table dunning_schedules (
  id uuid pk,
  profile_id uuid not null,
  bill_type text not null check (bill_type in ('freight_invoice','forwarder','tax_invoice','service_order')),
  bill_id text not null,                     -- bill_type-typed FK (text to be polymorphic across the 4 PK types)
  total_thb numeric(12,2) not null,
  outstanding_thb numeric(12,2) not null,    -- recomputed by cron
  due_at timestamptz not null,               -- when the bill became "overdue"
  policy_id uuid references dunning_policies(id),
  next_step_index int default 0,
  next_run_at timestamptz not null,          -- when the next reminder fires
  status text not null check (status in ('active','paused','paid','escalated','written_off')),
  paused_reason text,
  paused_at timestamptz, paused_by_admin_id uuid,
  resolved_at timestamptz,
  created_at timestamptz default now()
);
create index on dunning_schedules (status, next_run_at) where status='active';
```

**`dunning_events`** — append-only log:
```sql
create table dunning_events (
  id uuid pk,
  dunning_schedule_id uuid not null,
  step_index int not null,
  fired_at timestamptz default now(),
  channels jsonb,                            -- ['line','email','sms']
  template_id uuid,
  notifications_ids jsonb,                   -- the notifications.id rows this step produced
  outcome text,                              -- 'delivered_line','delivered_email','delivered_sms','partial','failed','skipped_paid'
  details jsonb
);
```

Add `notifications.dunning_event_id` FK (mirror `notifications.broadcast_id`). Update the notifications table CHECK.

#### 3.4.2 DN-1b — Cron

`/api/cron/dunning-sweep` every 30 min:
```ts
// pseudocode
const due = await admin.from('dunning_schedules')
  .select('*').eq('status', 'active').lte('next_run_at', now);
for (const sched of due) {
  const policy = await loadPolicy(sched.policy_id);
  const step = policy.steps[sched.next_step_index];
  if (!step) { await markEscalatedOrComplete(sched); continue; }

  // 1) Recompute outstanding (defensive — customer may have paid)
  const outstanding = await computeOutstanding(sched.bill_type, sched.bill_id);
  if (outstanding <= 0) { await markPaid(sched); continue; }

  // 2) Fire the step
  const notifIds = await sendNotification(sched.profile_id, {
    category: 'dunning',
    severity: step.severity,
    title:   ...renderTemplate(step.template_id, {...sched, outstanding}),
    body:    ...,
    link_href: `/pay/${sched.bill_type}/${sched.bill_id}`,
    reference_type: sched.bill_type, reference_id: sched.bill_id,
    allow_sms: step.channels.includes('sms'),
  });

  // 3) Record event
  await admin.from('dunning_events').insert({ ... });

  // 4) Advance + schedule next
  await admin.from('dunning_schedules').update({
    next_step_index: sched.next_step_index + 1,
    next_run_at: addDays(now, nextOffset),
  }).eq('id', sched.id);

  // 5) If step has escalate_to_admin → create a work_item assigned to customer's sales rep
  if (step.escalate_to_admin) await createWorkItem({ ... });
}
```

#### 3.4.3 DN-1c — Triggers (when does a bill enter dunning)

Hook into the existing money flows:
- On `freight_invoices.payment_status` transitioning to `unpaid` or `partial` AND issued >24h ago → INSERT `dunning_schedules` row with `due_at=now`, `policy_id=default`, `next_run_at=now`
- On `service_orders` reaching `awaiting_payment` (existing flow) → same pattern (with shorter offsets — order payment is more urgent)
- On `forwarders.payment_status='unpaid'` AND container is in transit → enter dunning
- On any of these paid → cron self-heals (step 1 above marks paid)

Implement triggers as Postgres `AFTER UPDATE` triggers — keeps the dunning entry as a side-effect of the money state change.

#### 3.4.4 DN-1d — Admin queue UI

`/admin/dunning`:
- List view of all active dunning schedules grouped by customer
- Filter by status / bill_type / overdue-days
- Per-row actions: Pause / Resume / Force-step / Mark-paid (with reason) / Write-off (with reason; super only)
- Per-customer rollup: "Total outstanding: ฿X across N invoices · Last contact: T-3d via LINE · Next reminder: T+2h"
- Escalations panel: dunning schedules at step_offset >= 14d → show as work_items so a human picks up

#### 3.4.5 DN-1e — Customer queue UI

`/wallet` or `/dashboard` adds a banner: "You have ฿X overdue across N invoices · [Pay all] · [See list]". Click → list view aggregated across freight + forwarder + tax_invoice + service_order. Each row has a [Pay] CTA → wallet pay-from path.

**Effort: ~25-35h.** Three tables + cron + 4 hooks + admin UI + customer banner. Phased delivery possible:
- **Phase 1 (~12h)** — schema + cron + freight-invoice hook + admin queue (most overdue $$$ today is freight)
- **Phase 2 (~10h)** — service-order + forwarder hooks + customer banner
- **Phase 3 (~8h)** — escalation → work_items + write-off flow

**Impact: very high.** Closes owner ask #4 directly. Reduces DSO. Reduces admin "follow-up by hand" load. Improves cash flow.

#### 3.4.6 DN-1 — Monthly statement (optional second phase)

If the owner explicitly wants "monthly bill" (statement-style billing), add a `monthly_statements` table that groups all of a customer's open invoices into a single document with a single payment_due_at. Dunning then runs on the statement, not the individual invoices. This is **a much larger lift** (~30-50h on top) — defer until owner reads phase 1 and confirms whether per-invoice dunning solves their actual need.

### 3.5 SB-1 — Subscription tracker (owner ask #5)

**Scope (internal-SaaS interpretation):** A registry of Pacred's external SaaS subscriptions (Vercel, Supabase, Resend, Sentry, GTM, Notion, ...) with renewal dates, monthly cost, responsible owner.

**Minimum to ship:**

#### 3.5.1 SB-1a — Schema

```sql
create table subscription_programs (
  id uuid pk,
  name text not null,                        -- "Vercel Pro", "Supabase Team"
  vendor text not null,                      -- "Vercel", "Supabase Inc."
  vendor_url text,
  category text,                             -- 'hosting', 'database', 'monitoring', 'email', 'crm', 'design', ...
  description text,

  -- Money
  cost_thb numeric(12,2) not null,           -- frozen for the current billing cycle (re-snapshot on renewal)
  cost_currency text default 'THB',
  cost_original numeric(12,2),               -- e.g. 20 USD
  billing_period text check (billing_period in ('monthly','annual','quarterly','one_time')),

  -- Cost-center attribution
  cost_center_kind text check (cost_center_kind in ('department','team','person')),
  cost_center_id text,                       -- 'engineering', 'sales_bkk', or a profile_id
  responsible_admin_id uuid,                 -- the "owner" — who keeps the receipt + handles renewal

  -- Lifecycle
  status text check (status in ('active','expired','cancelled','negotiating')) default 'active',
  started_at date not null,
  expires_at date not null,                  -- the next renewal date
  auto_renew boolean default true,
  notice_period_days int default 30,         -- to cancel before renewal

  -- Receipt + audit
  receipt_storage_path text,                 -- last invoice PDF
  notes text,                                -- what this is for, who can answer questions
  tags jsonb,                                -- ['critical','dev-only','marketing']

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table subscription_renewals (
  id uuid pk,
  subscription_id uuid not null,
  renewed_at timestamptz default now(),
  cost_thb numeric(12,2) not null,           -- historic — what we paid this cycle
  receipt_storage_path text,
  notes text,
  recorded_by_admin_id uuid
);
```

#### 3.5.2 SB-1b — Admin UI

`/admin/subscriptions`:
- List view sorted by `expires_at` ASC → upcoming renewals on top
- Filter by category / cost_center / responsible / status
- Cost rollups: total monthly THB · total annual THB · per-cost-center breakdown · "expiring in next 30 days" badge
- Per-row: edit · mark-renewed (creates `subscription_renewals` row + bumps `expires_at`) · cancel · upload-receipt
- Owner page: each admin sees "subscriptions you own" + a notify when one is < 30 days from expiry

`/admin/subscriptions/new`:
- Form with vendor / cost / renewal / cost-center / owner

#### 3.5.3 SB-1c — Renewal cron

`/api/cron/subscription-renewals-sweep` daily 09:00 ICT:
- Find subscriptions where `expires_at - now < notice_period_days` AND `status='active'`
- For each: `sendNotification(responsible_admin_id, ...)` + create a `work_item` in the owner's queue
- Find subscriptions where `expires_at < now` AND `status='active'` → flip to `expired` AND alert super+accounting

#### 3.5.4 SB-1d — Customer-facing extension (deferred)

If the owner LATER wants customer-facing subscriptions (VIP membership · monthly storage subscription · premium support), the schema generalises:
- Add `subscriber_kind` enum: `'internal'` (Pacred SaaS) | `'customer'` (Pacred's customer)
- Add `subscriber_profile_id uuid` (customer subscriber)
- Add `auto_charge boolean` + `payment_method_id uuid` (saved card via Xendit Token API at T+30d gateway wire-up)
- A recurring-billing engine on top — `subscription_invoices` auto-generated by a cron, dunning flows from DN-1

**Defer customer-side until a) the owner explicitly asks for it, b) Xendit Token API is integrated.**

**Effort: ~15-20h** (internal-only V1: schema + admin UI + cron + seed for ~20 existing subscriptions).

**Impact: medium-high.** Owner ask #5 → solved. Pacred stops paying for forgotten subscriptions. The team gets visibility into recurring spend (a CFO-grade view they don't have today).

### 3.6 Cross-cutting recommendations

#### 3.6.1 XC-1 — Generalise the notification-source FK pattern

Add three columns + indexes (one migration, low risk):
- `notifications.dunning_event_id uuid references dunning_events(id)`
- `notifications.subscription_renewal_id uuid references subscription_renewals(id)`
- `notifications.work_item_id uuid references work_items(id)` (for work-item-driven notifies)

Existing FKs: `notifications.broadcast_id` (already there). Pattern: every "I produced this notification" subsystem gets a FK column. Audit trail becomes: `SELECT * FROM notifications WHERE dunning_event_id = X` to see what fired for one dunning step.

**Effort: 1h.**

#### 3.6.2 XC-2 — Outstanding-balance materialised view (or computed)

Build `customer_outstanding_balances` view (or scheduled-refresh materialised view if perf matters):
```sql
create view customer_outstanding_balances as
  select
    p.id as profile_id,
    coalesce(fi.total_thb, 0) + coalesce(fo.total_thb, 0) + ... as total_outstanding_thb,
    ...
  from profiles p
  left join (... freight_invoices unpaid+partial sum group by profile_id) fi on fi.profile_id = p.id
  left join (... forwarders unpaid sum group by profile_id) fo on fo.profile_id = p.id
  left join (... service_orders awaiting_payment sum group by profile_id) so on so.profile_id = p.id
  left join (... tax_invoices issued-but-not-paid sum) ti on ti.profile_id = p.id;
```

Feeds: customer banner (DN-1e), admin customer detail page, dunning entry trigger, CFO dashboard.

**Effort: ~3-4h** (view + indexes + add to `/admin/customers/[id]` and `/dashboard`).

#### 3.6.3 XC-3 — Cost-aware channel routing (the "free → email → SMS" ladder)

Today `sendNotification` tries LINE → email. Add a `costCeiling` knob:
```ts
sendNotification(profileId, { ...payload, channelPolicy: 'free-only' | 'cheap' | 'all' })
// free-only: LINE only (free within OA quota), then in-app only
// cheap:     LINE → email (Resend ~฿0.01/email)
// all:       LINE → email → SMS (~฿0.30/SMS)
```

Default for dunning step 1 = cheap; step 3 (final notice) = all; admin ad-hoc = caller-specified.

**Effort: ~2-3h.**

#### 3.6.4 XC-4 — Bulk-action audit pattern

Standardise: every bulk action returns `outcomes: [{id, ok, error?}]` AND writes:
- One parent `admin_audit_log` row with `action='<x>.bulk'`, `target_id='<count>_targets'`, payload `{outcomes_summary, ids}`
- N child `admin_audit_log` rows from the per-row mutation (existing pattern unchanged)

Helper: `withBulkAdmin(roles, items, perItemFn)` in `actions/admin/common.ts` — applies the pattern uniformly to BG-1 / BC-1 / NF-1 / DN-1.

**Effort: ~3-4h** (helper + retrofit broadcast + bulk-rep-transfer).

#### 3.6.5 XC-5 — Idempotency-key on bulk actions

Bulk actions are triggered by a multi-second click. The user double-clicks. The bulk re-runs. If the bulk action mutates without idempotency, money/invoice doubles. Mitigation:

Accept an optional `idempotency_key: string` from the client; before the bulk runs, INSERT into `bulk_action_runs(key, kind, started_at, completed_at?, outcomes_json?)` — if duplicate key, return cached outcomes. The 23505 unique-violation acts as the lock.

**Effort: ~3-4h.**

#### 3.6.6 XC-6 — Switch on RESEND_API_KEY ASAP

The email code path is ready. ก๊อต has Resend keys pending. **This is one Vercel env var away from "all our notifications double-deliver via email backup"** — a free reliability boost. Should be the first Tier-0 dashboard click after analytics envvars.

**Effort: 5 min.**

---

## 4. Deeper research

### 4.1 Email — Resend vs SendGrid vs SES

| Provider | Per-1k emails | DX | Thai-friendly? | Verdict |
|---|---|---|---|---|
| **Resend** | $0.40/1k (~฿14/1k) | Best (Next.js / Vercel native; React Email components; structured webhooks) | TH characters work; no dedicated TH presence | ✅ **Keep — code is already plumbed** |
| **SendGrid** | $0.60/1k starter, free 100/day | Solid but older API; HTML-templates UI; well-known | TH characters work | 🟡 Switch only if Resend deliverability tanks |
| **AWS SES** | $0.10/1k (lowest) | Lowest level (requires you to manage DKIM/SPF/auth yourself); CLI / SDK heavy | TH characters work; AWS regions ap-southeast-1 helps latency | ❌ Overkill for Pacred's volume; ops burden not worth $0.30/1k savings |
| **Mailchimp Transactional (Mandrill)** | $20/mo + $0.20/1k | Marketing-leaning; transactional is a side product | TH characters work | ❌ Marketing tool — wrong fit |
| **Postmark** | $1.25/1k | Excellent deliverability + transactional-first; well-loved | TH characters work | 🟡 More expensive than Resend; no upside for Pacred today |

**Recommendation: stick with Resend.** Switch only if (a) deliverability becomes a problem after launch, or (b) volume exceeds 100k/month (where Postmark's per-domain warm-up advantages kick in).

Resend specifics:
- API key + verified-sender domain
- `from: 'Pacred <noreply@pacred.co>'` (configured in code)
- React Email templates (composable; could replace `lib/notifications/templates.ts` if we want HTML emails)
- Webhook for delivery events (would feed the per-channel delivery feedback in NF-1)
- 100/day free tier covers internal testing

**Action: ก๊อต gets the production key + sets `RESEND_API_KEY` + `RESEND_FROM` in Vercel.**

### 4.2 LINE — Messaging API SDK + LIFF

Pacred already uses the LINE Messaging API push endpoint directly (`fetch https://api.line.me/v2/bot/message/push`). For deeper UX:

#### 4.2.1 The official SDK
`@line/bot-sdk` (Node.js) — typed wrapper over all endpoints. Pacred's current `sendLinePush` uses raw fetch — works but lacks types + retries + error normalisation. **Worth migrating** at the next LINE-touching commit. Effort: ~3h.

#### 4.2.2 Multicast (the bulk lever)
`POST /v2/bot/message/multicast` — up to 500 user IDs per call. Today's broadcast system bulk-inserts `notifications` rows; if `LINE_PUSH_BYPASS=false`, those rows get pushed one-at-a-time as actions fire. **Broadcast LINE fan-out should switch to multicast** for cost (LINE counts multicast as 1 send-event for billing purposes, not 500). Effort: ~4-6h.

#### 4.2.3 Flex Messages — richer cards
Today Pacred sends plain text. LINE Flex Messages support buttons, images, vertical/horizontal layouts. The "pay this invoice" CTA in dunning DN-1 should be a Flex Message:
```json
{
  "type": "flex",
  "altText": "You have an overdue invoice",
  "contents": {
    "type": "bubble",
    "header": {...},
    "body": {... amount + due date ...},
    "footer": {"type":"box", "contents":[{"type":"button","action":{"type":"uri","label":"Pay now","uri":"https://pacred.co/pay/..."}}]}
  }
}
```
Effort: ~5-8h for a small template set (3-5 Flex templates).

#### 4.2.4 LIFF — login + frictionless link follows
LIFF (LINE Front-end Framework) opens web pages inside the LINE app with the user's LINE userId already available. Pacred has `/liff/link` (linking flow). For dunning, putting `/pay/<bill_id>` inside LIFF lets a customer pay in 2 taps from a LINE message without re-login. Effort to extend: ~5-10h (depends on existing `/liff/link` reuse).

#### 4.2.5 Rich menu
A persistent menu inside the OA chat. Useful for "Check outstanding · Pay now · Contact support". Out of billing-system scope but mention for completeness.

### 4.3 SMS — ThaiBulkSMS economics

ThaiBulkSMS is wired (`lib/sms/gateway.ts`). Pricing typically ฿0.20-0.50 per SMS for Thai numbers (varies by sender ID and volume). Pacred currently uses SMS for **OTP only** (~3/customer at signup + occasional resends).

Cost projection for dunning at ~100 active overdue per month:
- 100 customers × 3 dunning steps × 1 SMS step (the final notice only) = 100 SMS/month = ~฿20-50/month. Negligible.
- If all 3 steps used SMS = 300/mo = ~฿60-150/mo. Still small but unnecessary.

**Rule of thumb (encode in XC-3):** SMS only at "final notice" (step 3 of dunning ladder) or at customer-life-cycle moments where reach > cost (OTP, password reset, money-loss alerts). Never for marketing.

Alternative TH SMS providers — note for posterity:
- **Twilio** — global brand, higher per-message cost (~฿1-2/SMS), worth it if Pacred goes international
- **AIS / DTAC / True direct** — enterprise contracts; lowest per-message but onerous KYC + monthly minimum
- **Infobip / MessageBird** — global aggregator; comparable to Twilio

**Recommendation: stay on ThaiBulkSMS. Reliable + cheap for TH numbers. Monitor balance via the existing `sms-balance-check` cron + the new SmsBalanceResult shape.**

### 4.4 Invoicing — build vs Stripe Invoicing vs Xero/Odoo/PEAK

**Build (current path) — Pacred already has it:**
- ✅ tax_invoices + credit_notes (RD Code 86 compliant — serial INV-YYYYMM-NNNN)
- ✅ freight_invoices + value model
- ✅ PDF render via @react-pdf/renderer + Sarabun font
- ✅ Storage buckets per type
- ✅ WHT integration via withholding_tax_entries

**Stripe Invoicing — global SaaS:**
- ❌ Not RD-compliant for Thai tax invoices (no monthly serial counter; can't put Pacred branch fields properly)
- ❌ Doesn't handle WHT certificate flow
- ❌ Requires Stripe account; ADR-0004 already deferred Stripe
- 🟡 Excellent for *future* customer-facing recurring billing (SB-1d): subscription invoices + saved cards + dunning built-in
- **Verdict:** No fit for Pacred today. Revisit at SB-1d (customer subscriptions) — and even then, Xendit Subscription API may be the local-fit choice.

**Xero — Thai-friendly SaaS accounting:**
- ✅ Good fit for general ledger / statutory books / Thai accounting compliance
- ✅ Tax-invoice support (multiple jurisdictions; Thailand is supported)
- 🟡 No native withholding-tax workflow (an addon is possible)
- 💰 ฿1,000-3,000/month per company; would replace some of the in-house tax_invoices admin
- **Verdict:** Skip. Pacred already built it; rip-and-replace = throwing away work. **PEAK** (a Thai-native accounting product) is the better integration target.

**PEAK — Thai-native accounting:**
- The PORT_PLAN Part V references PEAK API integration (V-F2) as a future "export Pacred's tax invoices + receipts to PEAK statutory books" path
- Pacred owns the data; PEAK is the statutory books destination
- **Verdict:** Build the PEAK export when statutory-books requirement bites. Today's in-house tax_invoices is correct.

**Odoo — open-source ERP:**
- All-in-one (CRM + accounting + invoicing + warehousing + HR)
- Big migration; would replace Pacred's whole admin stack
- **Verdict:** Out of scope. Pacred's V2 strategy (ADR-0010) is "owner-pleaser" — building bespoke modules > monolithic ERP swap.

**Recommendation: keep building in-house.** The flexibility is worth more than the SaaS rent for Pacred's specific Thai-customs-cargo flow. PEAK export is the only outside integration that earns its keep.

### 4.5 Subscriptions — Postgres + cron vs Lago/Orb

For SB-1 (internal SaaS tracking), Postgres + cron is trivially correct (the design above). The harder question: for **customer-facing** subscription billing (SB-1d, when it comes):

#### 4.5.1 Postgres + cron + Xendit (build)
- Tables: `subscription_programs` + `subscription_billing_cycles` + `subscription_invoices`
- Cron: monthly run that auto-generates `subscription_invoices` from active subscriptions; triggers a charge via Xendit Token API (saved-card flow)
- Dunning: reuses DN-1 directly
- Effort: ~25-40h after SB-1 V1
- **Pros:** all Pacred data; clean integration; reuses every billing primitive
- **Cons:** can take time to build invoice-cycle edge cases (proration, mid-cycle plan change, plan upgrade/downgrade, trial-to-paid conversion, dunning resumption)

#### 4.5.2 Lago (open-source billing engine, self-hostable)
- https://getlago.com — open-source MIT-licenced billing/metering
- Handles: subscription cycles · usage-based billing · proration · coupons · taxes · webhooks
- Self-hostable (Pacred can run it inside its infra; data stays in Pacred's ecosystem)
- API-first; integrates with any payment gateway (Stripe/Xendit/manual)
- **Pros:** complex billing logic solved; saves ~50-80% build time on edge cases
- **Cons:** another service to operate; learning curve; opinionated data model

#### 4.5.3 Orb (commercial — Lago competitor)
- https://withorb.com — SaaS billing platform
- Stripe-like DX; good Thai support uncertain
- **Cons:** monthly fee; data leaves Pacred ecosystem (violates "keep everything inside" principle)

#### 4.5.4 Stripe Billing
- The standard for SaaS recurring billing globally
- Doesn't have native Thai-friendly tax handling; would need Stripe + manual tax-invoice generation
- Excellent saved-card / dunning / failed-charge retry logic
- **Cons:** ADR-0004 deferred Stripe; data leaves Pacred ecosystem

**Recommendation when SB-1d arrives:** **Build with Postgres + cron + Xendit Token API.** Lago is the fallback if subscription complexity explodes (multiple plans, prorations, usage metering — none of which Pacred needs in foreseeable scope). Stay inside the Pacred ecosystem per the master tool-strategy verdict (capability-tools-strategy-2026-05-18.md).

### 4.6 Dunning automation — work_items+crons vs Inngest

#### 4.6.1 Current Pacred substrate
- `vercel.json` crons (serverless schedules)
- `work_items` table (the cross-department spine, migration 0080)
- `lib/cron/registry.ts` + `lib/cron/instrument.ts` (audit + observability)

For DN-1, this substrate is **sufficient and correct**:
- Cron `/api/cron/dunning-sweep` every 30 min walks the schedule table
- Each fired step creates `notifications` (existing) + optionally a `work_item` for escalation (existing)
- `dunning_events` log = the audit trail; mirrors `cron_runs` pattern

#### 4.6.2 Inngest (background-job platform)
- https://inngest.com — durable functions; retries; step-by-step state; event-driven
- Pros: complex multi-step workflows with state (perfect for "if customer pays in middle of dunning, skip remaining steps")
- Cons: external service; data flows through Inngest; extra dependency
- **When it earns its keep:** workflows with 10+ steps, complex retry/backoff, fan-out to many systems
- **Verdict for Pacred DN-1: overkill.** A cron + a small state machine in Postgres handles all of Pacred's dunning needs. Re-evaluate at Lago / customer-subscription scale.

#### 4.6.3 Temporal / Trigger.dev — same category as Inngest
Same verdict: overkill for Pacred today. The Postgres + cron + work_items pattern is the right hammer.

**Recommendation: build dunning on the existing Pacred cron substrate. Do not pull in Inngest/Temporal unless Pacred's workflow complexity grows 10×.**

---

## 5. References

### Code (live on `dave` branch)

- `actions/wallet.ts` — customer wallet self-serve flow
- `actions/admin/wallet.ts` — admin wallet approval flow
- `actions/admin/tax-invoices.tsx` — tax invoice issue / cancel / credit note
- `actions/admin/freight-invoices.ts` — freight invoice CRUD + issue + cancel
- `actions/admin/freight-invoice-payments.ts` — payment ledger + WHT gate
- `actions/admin/disbursements.ts` — container AP ledger
- `actions/admin/pcs-container-payments.ts` — legacy tb_cnt ledger (new 2026-05-18)
- `actions/admin/refunds.ts` — U1-6 refund money path
- `actions/admin/broadcasts.ts` — admin broadcast/push popup
- `lib/notifications/index.ts` — central notification dispatcher (LINE + email + in-app)
- `lib/notifications/templates.ts` — 379 lines of typed template builders
- `lib/sms/gateway.ts` — ThaiBulkSMS + balance check
- `lib/wallet/balance.ts` — pending-aware available-balance helper
- `lib/cron/registry.ts` — 7 cron jobs + labels
- `supabase/migrations/0007_wallet.sql` — wallet schema + RLS + overdraw constraints
- `supabase/migrations/0034_tax_invoices.sql` — tax invoice schema
- `supabase/migrations/0044_withholding_tax.sql` — inbound WHT
- `supabase/migrations/0049_*` — service-order pay idempotency partial-unique
- `supabase/migrations/0051_freight_invoices.sql` — freight invoice schema
- `supabase/migrations/0052_freight_invoice_payments.sql` — freight payment ledger
- `supabase/migrations/0054_commissions.sql` — commission ledger (the gold-standard money state machine)
- `supabase/migrations/0055_broadcasts.sql` — broadcast schema + notifications.broadcast_id
- `supabase/migrations/0063_*` — wallet bridge for freight invoice
- `supabase/migrations/0064_*` — wallet overdraw trigger
- `supabase/migrations/0069_container_costs_disbursements.sql` — AP + rate-card foundation
- `supabase/migrations/0080_work_items.sql` — cross-department work-item spine
- `supabase/migrations/0081_pcs_legacy_schema.sql` — tb_cnt container payments
- `supabase/migrations/0085_tax_invoices_credit_note_for.sql` — R3 credit-note backref

### Decisions (ADRs)

- `docs/decisions/0004-payment-gateway.md` — PromptPay-only pre-beta; gateway deferred
- `docs/decisions/d7-payment-gateway-decision-matrix.md` — Xendit + K-Biz + K-Shop (T+30d wire-up)
- `docs/decisions/0005-launch-operational-decisions.md` — K-6 (INV-YYYYMM-NNNN) + K-7 (super/accounting approver)
- `docs/decisions/0006-tax-invoice-flow.md` — tax invoice design contract
- `docs/decisions/0014-customer-self-service-state-transitions.md` — admin-verify-then-allow pattern
- `docs/decisions/0015-withholding-tax-model.md` — inbound WHT (the customer-withholds-from-Pacred direction)
- `docs/decisions/0016-freight-value-model.md` — freight value block (commercial vs declared customs vs VAT plan)

### Research / audits

- `docs/research/disbursement-system-2026-05-18.md` — the unbuilt "request → categorise → approve → pay → recover → WHT-cert" system
- `docs/research/capability-tools-strategy-2026-05-18.md` — the Tier 0/1/2/3 roadmap; this doc lives in its Tier 3 (owner-asked systems)
- `docs/research/audit-money-billing-2026-05-17.md` — pre-launch money audit (P0/P1 idempotency findings)
- `docs/research/legacy-accounting-billing-workflow.md` — PHP legacy billing flow
- `docs/audit/cargo-ops-forensics-2026-05-16.md` §4 A6/A8 — WHT + VAT-reconciliation gaps that ADR-0015 + R3 closed
- `docs/UPGRADE_PLAN.md` — the canonical post-launch phase/stage plan
- `docs/PORT_PLAN.md` Part V — cargo-forensics backlog
- `docs/PORT_PLAN.md` Part W — gap-hunt backlog

### Vendor docs (external)

- Resend — https://resend.com/docs (Node SDK + React Email)
- LINE Messaging API — https://developers.line.biz/en/reference/messaging-api/
- LINE Flex Message Simulator — https://developers.line.biz/flex-simulator/
- LIFF — https://developers.line.biz/en/docs/liff/
- ThaiBulkSMS v2 — https://api-v2.thaibulksms.com (private docs)
- Xendit Thailand — https://docs.xendit.co/th/ (post-launch wire-up)
- K-Biz API — Kasikorn corporate banking dev portal (confirm endpoint surface in sandbox phase)
- Lago — https://docs.getlago.com (if customer-subs scale ever justifies)
- PEAK (Thai accounting) — https://peakaccount.com (V-F2 future export target)
- Thai Revenue Department Code 86 — tax invoice required fields
- Thai Revenue Department Section 50 — withholding tax obligation

---

**Document end.** ~1100 lines, single-read consolidation of Pacred's billing/payments/subscriptions state + the 5 owner-asked features each given a Gap + Recommendation subsection.
