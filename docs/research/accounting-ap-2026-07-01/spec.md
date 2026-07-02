# AP / เบิกจ่าย ledger — bring the ACC disbursement spreadsheets into the system

> **Date:** 2026-07-01 · **Author:** เดฟ (design pass · READ-ONLY audit) · **Status:** design spec, no code
> **Goal:** make the money-OUT (AP / เบิกจ่าย / disbursement) workflow a first-class DB ledger with a report-cnt-style read surface + a shop-order-style detail, so the ACC team stops running it on 2 spreadsheets.
> **Owner design rule (CLAUDE.md · load-bearing):** ยึดหน้าตา+การทำงานจาก **ฝากสั่งซื้อ (shop-order)** + **รายงานตู้ (report-cnt)**. This spec designs the AP surface as *report-cnt list → shop-order detail*, and the pay-flip as a **register of an out-of-band bank transfer** (the proven `markShopDisbursementPaid` pattern — no in-app money movement).
>
> **Sources read:** `docs/research/platform-analysis-2026-06-30/accounting.md` (§1 = the AP heart, gap #1) · the 2 AP xlsx `ACC - PACRED&PCS เบิกเงิน.xlsx` (16 sheets) + `ข้อมูลการเบิก-จ่ายกองกลาง.xlsx` (4 sheets) · `actions/admin/shop-disbursement.ts` (the register pattern to mirror) · `actions/admin/cnt-payment.ts` (ค่าตู้ register) · `supabase/migrations/0069_container_costs_disbursements.sql` + `0089` (the tombstoned per-container AP table) · `lib/payment/bank-accounts.ts` (3-account SOT).

---

## 0. TL;DR (the confirm)

- **What exists in DB today = 3 *narrow, per-parent* registers, NOT a general AP ledger:**
  1. **ค่าสินค้าฝากสั่ง (China-cost pay-out)** — `tb_shop_pay_h` + `_sub` · live · surface `/admin/shop-disbursement` (+history) · the *exact* register pattern to copy.
  2. **ค่าตู้ (container cost)** — `tb_cnt` + `tb_cnt_item`/`tb_cnt_pay_*` · live · surface `/admin/report-cnt` → `/admin/cnt-hs`.
  3. **commission batch pay-out** (Sales 1% / interpreter) — `tb_withdraw_comm_*_h/_item` · READ-ONLY surface `/admin/accounting/withdraw/comm-{sale,interpreter}` (25+46 historical batches; no create/pay yet).
  - Plus `container_disbursements` (mig 0069/0089) = **TOMBSTONED** — FK'd to a retired spine table, page is an amber tombstone, `kind` enum is far too narrow (freight/duty/handling/fuel/storage/trucking/container_lease/other). **Do not resurrect it** — it can't model a shipment-scoped, QO-linked, WHT-bearing, category-taxonomy disbursement row.
- **The GAP = the *general per-shipment* AP disbursement (เบิกเงิน) row + the กองกลางโกดังจีน float** — the operational heart of `ACC เบิกเงิน.xlsx` (SEA/AIR/TRUCK/6699-TR/โชห่วย/ตั๋วชน/Export/คืนภาษีโกดังจีน/ทั่วไป/Cargo/ปิดตรวจ/NNB) and the CNY imprest of `เบิกจ่ายกองกลาง.xlsx`. **None of it has a DB home.** This is accounting.md gap #1 = "single biggest gap".
- **Proposed DB = one first-class `ap_disbursement` table** (the canonical เบิกเงิน row) + a **`ap_disbursement_batch`** wrapper (optional, mirrors `tb_shop_pay_h`) — mirroring the xlsx columns 1:1 + the `markShopDisbursementPaid` register semantics. Central-fund is a **separate small table** (`ap_central_fund` · CNY float · หาร2) because its shape is different (no shipment, no category, running ¥ balance).
- **Money-safety = phased.** **Slice 1 = READ (import the sheet history, list + detail) + request/approve RECORD.** The **pay-flip (สถานะโอนเงิน → โอนแล้ว)** is a *register* only (the money moved out-of-band by bank scan/transfer; the slip is the audit artifact) and lands in the **careful Slice 2** with the proven atomic-claim + slip-upload guard from `markShopDisbursementPaid`.

---

## 1. CURRENT-STATE MAP — AP category × already-in-DB? × surface

The AP world splits into **per-shipment service disbursements** (the เบิกเงิน sheets), **cost-of-goods reimbursement** (NNB), **container cost** (ค่าตู้), **commission pay-out**, **general OPEX / central-fund**, and **fixed recurring AP**. Coverage today:

| # | AP category (from the sheets) | DB table today | Surface today | Status |
|---|---|---|---|---|
| A | **ค่าสินค้าฝากสั่ง** (China purchase cost → NNB/Haoze) — batch of paid shop orders | `tb_shop_pay_h` + `tb_shop_pay_sub` | `/admin/shop-disbursement` + `/history` + `/history/[id]` | ✅ **live register** (create batch + pay-flip w/ slip) — the pattern to copy |
| B | **ค่าตู้** (container cost pay-out) — pay a container's cost, one-time | `tb_cnt` + `tb_cnt_item` + `tb_cnt_pay_idorco`/`_trackingchn` | `/admin/report-cnt` → `/admin/cnt-hs` | ✅ **live register** (create + slip + "จ่ายแล้ว" badge) |
| C | **ค่าคอม Sales / ล่าม** (commission pay-out batch) | `tb_withdraw_comm_sale_h/_item` · `tb_withdraw_comm_interpreter_h/_item` | `/admin/accounting/withdraw/comm-{sale,interpreter}` | 🟡 **READ-ONLY** (25+46 historical batches shown; create/pay-slip DEFERRED per `withdraw-comm-batch.ts` header) |
| D | **per-shipment service disbursement** (เบิกเงินทำงาน SEA/AIR/TRUCK/6699-TR/โชห่วย) — ค่าลงทะเบียน+YY · พิธีการ(1)(2) · หัวลาก 20'/40' · ผ่านท่า · D/O · FORM-E · แรงงาน · รถ4ล้อ · ค่าธรรมเนียมกรม(200)+VAT · RENT · ล่วงเวลา · เบิกคืนลูกค้า | **❌ NONE** | ❌ tombstone `/admin/accounting/disbursements` (retired spine) | 🔴 **GAP — the heart** |
| E | **ตั๋วชน / Export / คืนภาษีโกดังจีน** disbursements (same row shape, different sheet key: ใบเสร็จ RT-… / QO / SHIPMENT) | **❌ NONE** | ❌ | 🔴 **GAP** (same `ap_disbursement` shape) |
| F | **ปิดตรวจ วิสิฐ** (owner cash-advance / related-party settlement) | **❌ NONE** | ❌ | 🔴 GAP (variant of `ap_disbursement` — payee = related party; extra `รับเงิน` status) |
| G | **NNB เบิกเงินสั่งซื้อสินค้า** (cost-of-goods reimbursement to Haoze Song / huguanghai + over-transfer refunds) | partial (`tb_shop_pay_*` covers the shop-order-cost slice A; the **freeform NNB reimbursements + inter-account corrections are NOT modeled**) | ❌ | 🔴 GAP (freeform `ap_disbursement`, no shipment link) |
| H | **เบิกเงินทั่วไป / Cargo** (OPEX: ค่าใช้จ่ายทั่วไป/บุคลากร/ซ่อมแซม/เงินสดย่อย + ต้นทุนขนส่งจีน-ไทย MOMO/กวางโจว/New) | **❌ NONE** | ❌ | 🔴 GAP (`ap_disbursement` w/ `expense_category`, no shipment) |
| I | **กองกลางโกดังจีน** (CNY imprest float · ฿10k top-ups · warehouse labor/rent/loading · TTP↔PCS หาร2 · running ¥ balance) | **❌ NONE** | ❌ | 🔴 GAP (separate shape → `ap_central_fund`) |
| J | **fixed recurring AP** (ค่าเช่า 5% WHT · รปภ. 3%+VAT credit-30 · บัตรเครดิต · แม่บ้าน · วันพระ) + fixed-OPEX budget ~฿400k/mo | **❌ NONE** | ❌ | 🟠 GAP (out of scope this pass — standing-order calendar; note only) |

**Key insight:** categories **A, B, C** already prove the register pattern in 3 narrow silos. **D–I are the same money-OUT event with no DB home.** The design = generalize A's shape (`tb_shop_pay_h`+`markShopDisbursementPaid`) into one `ap_disbursement` that covers D/E/F/G/H, and add a small dedicated `ap_central_fund` for I.

---

## 2. THE GAP — the general AP/เบิกจ่าย row (what NO DB table holds)

The canonical disbursement row (from the SEA/AIR/TRUCK/6699/โชห่วย/ตั๋วชน/Export/คืนภาษี sheets — they share **one** header shape) is:

```
ลำดับ · วันที่ · ชื่อในไลน์/ชื่อใบวางแจ้งหนี้ · SHIPMENT · QUOTATION(QO-…) ·
หมวดหมู่รายการ (ต้นทุนบริการ | เงินทดรองจ่าย | เบิก/คืนเงินและอื่นๆ) ·
รายการเบิกเงิน (the line item) · หมายเหตุ ·
ยอดเบิก · ยอดคืน · REMARK ·
ชื่อบัญชี(payee) · เลขบัญชี(payee) · ธนาคาร(payee) ·
สถานะโอนเงิน (ยังไม่ได้โอน | ต้องการเบิก | โอนแล้ว | ลค.ชำระเอง) · วันที่โอน · เวลา ·
สถานะการตามใบเสร็จ (รอรับใบเสร็จ | ได้รับใบเสร็จแล้ว | มีใบเสร็จชื่อลูกค้า) ·
ใบหัก (WT…/WT3-…/WT53-…)
```

The three **หมวดหมู่รายการ** (the disbursement taxonomy — MUST be a first-class enum, drives accounting treatment):
1. **ต้นทุนบริการ** (service cost = Pacred's real cost) — ค่าลงทะเบียน+YY · พิธีการ(1)(2) · หัวลาก · ผ่านท่า · D/O · FORM-E · แรงงาน · รถ. Carries vendor WHT (`หัก 3%/1%`).
2. **เงินทดรองจ่าย** (advance / pass-through) — ค่าธรรมเนียมกรม(200)+VAT · RENT · ล่วงเวลา. Flagged **"มีใบเสร็จรับเงินชื่อลูกค้า"** = the receipt is in the CUSTOMER's name → **pure reimbursable, MUST NOT be booked as Pacred revenue/margin** (accounting.md gap #10).
3. **เบิก/คืนเงิน และอื่นๆ** — เบิกเงินคืนลูกค้า (over-transfer refund → uses the `ยอดคืน` column), inter-account corrections ("บัญชี 6699 โอนคืน เนื่องจากใช้บัญชีผิด").

**Additional gap facts surfaced from the sheets** (must be modeled or explicitly deferred):
- **ยอดเบิก vs ยอดคืน are two separate money columns** on one row (a refund row fills `ยอดคืน`, a normal spend fills `ยอดเบิก`). Net effect matters for totals.
- **payee bank fields are the OUTFLOW leg** (`ชื่อบัญชี/เลขบัญชี/ธนาคาร` = who Pacred pays), NOT a Pacred account. The **source** Pacred account is implied by the sheet (`6699` = TRADING `…07669-9`; and there's a literal error row "โอนคืนเพราะใช้บัญชีผิด" → the 3-account routing is enforced manually + mistakes reversed). → capture BOTH: `payee_*` + `source_account_key` (service|logistics|trading, via `lib/payment/bank-accounts.ts`).
- **vendor-side WHT** (`หัก 3% / บัตร ปชช` on service-to-person; `หัก 1%` on transport/หัวลาก) with the gross basis in the note (e.g. "58,000 หัก 1%") and a `ใบหัก` certificate number (WT/WT3/WT53). → `wht_pct` + `wht_cert_no` + `amount_gross` fields (the ภงด.53 side — accounting.md gap #8).
- **สถานะการตามใบเสร็จ** (receipt-chase status) is a SECOND status axis, independent of สถานะโอนเงิน → `receipt_status` column.
- **multi-QO / multi-line SHIPMENT** — one shipment (e.g. `PRA260050001`) has ~10 disbursement rows (the sub-fan-out), often 2 QOs on one row → `shipment_no` groups the rows; `quotation_no` is per-row text.
- **`หมวดบัญชี` / expense category** on the ทั่วไป/Cargo sheets (ค่าใช้จ่ายทั่วไป/บุคลากร/ซ่อมแซม/เงินสดย่อย/ต้นทุนขนส่งจีน-ไทย MOMO) → `expense_category` (nullable; only OPEX rows carry it, service rows use `หมวดหมู่รายการ` instead).
- **entity** — rows span PACRED / AXELRA / NNB / PCS / TTP; "มีใบเสร็จชื่อเอเซลร่า" recurs → `entity` field (accounting.md gap #4).

**Central-fund (I) is a different shape** — no shipment, no หมวดหมู่, but a **¥ amount + เรท + ฿ total + ยอดหาร(บาท หาร2) + running ¥ balance** and a fixed destination ("โอนเข้า กสิกร 064-174-3836 บจก. พีซีเอส คาร์โก้"). → its own `ap_central_fund` table.

---

## 3. DB DESIGN — a first-class AP ledger

**Two new tables + one small central-fund table.** Additive, idempotent, RLS super+accounting-only (mirror `container_disbursements` gating). Next-free migration per the CLAUDE.md ledger = **`0239`** (always `ls supabase/migrations | tail` to confirm — highest on disk is `0238_marketing_planner`).

### 3.1 `ap_disbursement` — the canonical เบิกเงิน row (covers D/E/F/G/H)

```sql
create table public.ap_disbursement (
  id                 uuid primary key default gen_random_uuid(),

  -- ── grouping / linkage (the xlsx sheet + shipment spine) ──
  batch_id           uuid references public.ap_disbursement_batch(id) on delete set null,  -- optional wrapper (§3.2)
  lane               text not null check (lane in (               -- which sheet/mode = maps 1:1 to the xlsx tabs
                        'sea','air','truck','tr_6699','sea_choho',   -- เบิกเงินทำงาน SEA/AIR/TRUCK/6699-TR/โชห่วย
                        'tua_chon','export','cn_vat_refund',         -- ตั๋วชน / Export / คืนภาษีโกดังจีน
                        'general','cargo','close_inspect','nnb')),   -- ทั่วไป / Cargo / ปิดตรวจ / NNB
  entity             text not null default 'pacred'                 -- PACRED/AXELRA/NNB/PCS/TTP (accounting.md gap #4)
                       check (entity in ('pacred','axelra','nnb','pcs','ttp')),

  shipment_no        text,                    -- SHIPMENT / เลขงาน (nullable — OPEX rows have none)
  quotation_no       text,                    -- QUOTATION QO-… (free text, may hold 2 QOs)
  invoice_no         text,                    -- INVOICE IV-… (export lane)
  receipt_no         text,                    -- ใบเสร็จ RT-… (ตั๋วชน/export lane)
  container_no       text,                    -- เลขคอนเทนเนอร์ (โชห่วย lane)
  customer_id        text,                    -- PR… / A… (tb_users.userID — link to customer when resolvable)
  line_name          text,                    -- ชื่อในไลน์ / ชื่อใบวางแจ้งหนี้ (payer/customer display)

  -- ── the disbursement taxonomy (load-bearing — drives accounting) ──
  category           text not null check (category in (
                        'service_cost',        -- ต้นทุนบริการ
                        'advance_passthrough',  -- เงินทดรองจ่าย (มีใบเสร็จชื่อลูกค้า → NOT revenue)
                        'refund_correction')),  -- เบิก/คืนเงิน และอื่นๆ
  item_label         text not null,           -- รายการเบิกเงิน (the line, e.g. "ค่า D/O", "ค่าบริการ FORM E")
  expense_category   text,                    -- หมวดบัญชี (OPEX only: ทั่วไป/บุคลากร/ซ่อมแซม/เงินสดย่อย/ต้นทุนขนส่ง…)
  note               text,                    -- หมายเหตุ + REMARK
  is_customer_named_receipt boolean not null default false,  -- "มีใบเสร็จรับเงินชื่อลูกค้า" (pass-through flag · gap #10)

  -- ── money (two columns per the sheet + WHT) ──
  amount_withdraw    numeric(14,2) not null default 0 check (amount_withdraw >= 0),  -- ยอดเบิก
  amount_refund      numeric(14,2) not null default 0 check (amount_refund   >= 0),  -- ยอดคืน
  amount_gross       numeric(14,2),           -- pre-WHT gross basis (e.g. 4500 → pay 4455)
  wht_pct            numeric(5,2),            -- หัก 3% / 1% (vendor WHT, ภงด.53 side · gap #8)
  wht_cert_no        text,                    -- ใบหัก WT/WT3/WT53-…

  -- ── source Pacred account (the OUTFLOW leg from) — 3-account SOT ──
  source_account_key text check (source_account_key in ('service','logistics','trading')),  -- lib/payment/bank-accounts.ts
  -- ── payee bank (who Pacred pays TO) ──
  payee_name         text,                    -- ชื่อบัญชี
  payee_account_no   text,                    -- เลขบัญชี
  payee_bank         text,                    -- ธนาคาร
  pay_channel        text,                    -- พร้อมเพย์ / โอน / สแกนจ่าย Alipay …

  -- ── STATUS axis 1: transfer (สถานะโอนเงิน) — the register flip ──
  transfer_status    text not null default 'requested' check (transfer_status in (
                        'requested',    -- ต้องการเบิก / ยังไม่ได้โอน (recorded, not yet paid)
                        'approved',      -- อนุมัติแล้ว รอโอน (NEW — the approve gate before pay)
                        'transferred',   -- โอนแล้ว (money moved out-of-band; slip attached)
                        'customer_paid', -- ลค.ชำระเอง (customer scanned directly — no Pacred outflow)
                        'rejected')),    -- ยกเลิก
  transferred_at     timestamptz,             -- วันที่โอน + เวลา (combined)
  transfer_slip_path text,                    -- slip image (bucket 'disbursement-receipts' or 'slips')

  -- ── STATUS axis 2: receipt-chase (สถานะการตามใบเสร็จ) — independent ──
  receipt_status     text not null default 'pending' check (receipt_status in (
                        'pending','received','customer_named','na')),

  -- ── request/approve audit (the workflow) ──
  requested_by       uuid references public.profiles(id),   -- who created the เบิก request
  requested_at       timestamptz not null default now(),
  approved_by        uuid references public.profiles(id),   -- ACC AP approver
  approved_at        timestamptz,
  paid_by            uuid references public.profiles(id),   -- who flipped → transferred
  legacy_admin_id    text,                                   -- tb_admin.adminID (parity w/ shop-disbursement)

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- a refund/correction row uses amount_refund; a normal spend uses amount_withdraw (not both 0)
  constraint ap_disbursement_has_amount check (amount_withdraw > 0 or amount_refund > 0)
);

create index ap_disbursement_shipment_idx on public.ap_disbursement(shipment_no);
create index ap_disbursement_lane_status_idx on public.ap_disbursement(lane, transfer_status);
create index ap_disbursement_requested_idx on public.ap_disbursement(requested_at desc);
```

> **Field↔xlsx column map (fidelity check):** `lane`←sheet tab · `line_name`←ชื่อในไลน์ · `shipment_no`←SHIPMENT · `quotation_no`←QUOTATION · `category`←หมวดหมู่รายการ · `item_label`←รายการเบิกเงิน · `note`←หมายเหตุ/REMARK · `amount_withdraw`←ยอดเบิก · `amount_refund`←ยอดคืน · `amount_gross`+`wht_pct`←REMARK "58,000 หัก 1%" · `wht_cert_no`←ใบหัก · `payee_*`←ชื่อบัญชี/เลขบัญชี/ธนาคาร · `transfer_status`←สถานะโอนเงิน · `transferred_at`←วันที่โอน+เวลา · `receipt_status`←สถานะการตามใบเสร็จ. **Every visible column has a home.**

### 3.2 `ap_disbursement_batch` — optional wrapper (mirrors `tb_shop_pay_h`)

The sheet groups rows under a SHIPMENT with a `รวม` subtotal; a pay-run pays many rows at once. Mirror `tb_shop_pay_h` so a batch = one "ทำรายการเบิกเงิน" event with a title + a status + a slip.

```sql
create table public.ap_disbursement_batch (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,                 -- "เบิกงาน SHIPMENT PRA260050001" / "รอบ 25/06"
  lane            text,
  entity          text not null default 'pacred',
  status          text not null default 'draft'  -- draft → approved → paid (mirrors tb_shop_pay_h '1'→'2')
                    check (status in ('draft','approved','paid','rejected')),
  amount_total    numeric(14,2) not null default 0,  -- Σ(amount_withdraw − amount_refund), server-recomputed
  source_account_key text check (source_account_key in ('service','logistics','trading')),
  slip_path       text,
  created_by      uuid references public.profiles(id),
  approved_by     uuid references public.profiles(id),
  paid_by         uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  updated_at      timestamptz not null default now()
);
```

*(Batch is optional per row — a one-off OPEX เบิก can be a bare `ap_disbursement` with `batch_id=null`; a shipment pay-run wraps N rows in a batch. This matches the sheet: some tabs are per-shipment fan-outs, some are flat lists.)*

### 3.3 `ap_central_fund` — the กองกลางโกดังจีน CNY imprest float (I)

Different shape (¥ + เรท + ฿ + หาร2 + running balance) → its own table.

```sql
create table public.ap_central_fund (
  id            uuid primary key default gen_random_uuid(),
  fund_key      text not null default 'china_warehouse',  -- future-proof for other floats
  txn_date      date not null,
  item_label    text not null,             -- รายการ (สำรองครั้งที่ N / ค่าเช่า / เงินเดือน / กล้อง / OT)
  amount_cny    numeric(14,2) not null,    -- ยอดรวม(หยวน)
  fx_rate       numeric(8,4) not null,     -- เรท(หยวน)
  amount_thb    numeric(14,2) not null,    -- ยอดรวม(บาท) = amount_cny × fx_rate (server-computed)
  split_thb     numeric(14,2),             -- ยอดหาร(บาท) = amount_thb / 2 (TTP↔PCS หาร2)
  balance_cny   numeric(14,2),             -- running ¥ balance ("ยอดคงเหลือ 2853.17")
  slip_th_path  text,                      -- สลิปไทย
  slip_cn_path  text,                      -- สลิปหยวนจีน
  note          text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
```

*(Fixed-recurring AP calendar J and bank-statement reconciliation = explicitly OUT of scope this pass — note only. They're accounting.md gaps #3/#7/#9 and are separate builds.)*

### RLS (all three)
Mirror `container_disbursements` exactly: **super + accounting WRITE + READ; no ops/warehouse/sales** (AP ledger is finance-only, never customer-facing). Slip images → private bucket `disbursement-receipts` (already exists from mig 0069) with the same super+accounting storage policies.

---

## 4. READ-FIRST SURFACE DESIGN (owner design rule)

**Pattern = report-cnt list → shop-order detail** (the two owner-mandated bases).

### 4.1 List — `/admin/accounting/ap` (report-cnt-style)
- **Header:** `<PageHeader>` "เบิกจ่าย / AP Ledger" + range picker (default = this month, like `shop-disbursement`) + lane tabs (ทั้งหมด / SEA / AIR / TRUCK / 6699 / โชห่วย / ตั๋วชน / Export / คืนภาษี / ทั่วไป / Cargo / ปิดตรวจ / NNB) + entity filter + search (SHIPMENT / QO / payee / ผู้เบิก).
- **Rows grouped by SHIPMENT** (like report-cnt groups by container) with an expandable fan-out — §0g self-explaining: one glance shows **คืออะไร** (`category` pill + `item_label`) · **ของใคร** (`line_name` + `customer_id` + SHIPMENT) · **ทำอะไร** (lane badge) · **สถานะ** (dual pills: `transfer_status` + `receipt_status`, readable Thai from a status SOT) · **รายละเอียด** (QO/IV/RT/container + `amount_withdraw`/`amount_refund`) · **รูป** (slip thumbnail via `components/admin/slip-image.tsx`) · **ให้พนักงานทำอะไร** (next-action: request→"อนุมัติ", approved→"บันทึกการโอน+แนบสลิป") · **เปิดวันไหน** (`formatThaiDateTime(requested_at)`).
- **Footer Σ** per group + page (Σ ยอดเบิก − Σ ยอดคืน = net), with the ต้นทุนบริการ vs เงินทดรองจ่าย split shown (advance = not-margin).
- **Money-safe emphasis (§0h):** amount bold; a `advance_passthrough` row visibly tagged "ทดรองจ่าย · ใบเสร็จชื่อลูกค้า" so no one books it as cost.

### 4.2 Detail — `/admin/accounting/ap/[id]` or `/batch/[id]` (shop-order-style)
- Order-context header (SHIPMENT · customer · QO · lane · entity) exactly like the ฝากสั่งซื้อ detail; the disbursement lines table below; the source Pacred account (resolved via `resolvePaymentAccount`) + the payee account; the two slips + WHT cert; the request→approve→transfer→receipt-chase timeline.
- Reuse the confirm-before-mutate dialog (`components/ui/pacred-dialog.tsx`) on every state flip (§0f).

### 4.3 Central-fund — `/admin/accounting/ap/central-fund`
- Monthly sheets (ธ.ค.68…) as tabs; the ¥/เรท/฿/หาร2 table + running ¥ balance; top-up vs spend rows visually split; the fixed destination note.

### 4.4 3-account SOT wiring
Every disbursement's **source** account resolves through `lib/payment/bank-accounts.ts::resolvePaymentAccount` (or the stored `source_account_key`); the surface shows the SERVICE/LOGISTICS/TRADING lane so the "6699 โอนผิดบัญชี" class of error is visible before pay, not after.

---

## 5. MONEY-SAFETY NOTE — phase the build (the load-bearing rule)

**The first slice is READ + a request/approve RECORD. The pay-flip is the careful next slice.**

- **Slice 1 (safe · this build):**
  1. Ship the 3 tables (mig 0239) + RLS. **No money moves.**
  2. Build the **READ** surface (list + detail + central-fund) — immediate trust/reconciliation win (the sheet history becomes queryable).
  3. Build the **request + approve** write path only: create an `ap_disbursement` (transfer_status='requested') and an `approve` action (→'approved'). These write a *record of intent*; **no bank transfer, no slip-settle, no ledger side-effect.** Server-recompute `amount_total`; audit via `logAdminAction`; confirm-before-mutate.
  4. (Optional) a one-time **import script** to backfill the sheet history into `ap_disbursement` (dry-run + backup first, per AGENTS §11) — read-only value, no live money.
- **Slice 2 (careful · next sitting, ก๊อต co-sign):** the **pay-flip** `approved → transferred` — **a register of an out-of-band transfer** (money already moved by bank scan/K-Shop; the slip is the audit artifact), copying `markShopDisbursementPaid` *exactly*: pre-read guard (`status='approved'`), atomic conditional UPDATE with the guard folded into WHERE (`.eq('transfer_status','approved')`), slip upload to `disbursement-receipts`, orphan-slip cleanup on race, `logAdminAction`. **No wallet/commission/receipt side-effect** — same discipline as shop-disbursement + cnt-payment. The receipt-chase axis (`receipt_status`) is a plain field edit, non-money.
- **Never** auto-derive a disbursement from any customer-facing flow, and **never** let a Slice-1 record move money. The vendor-WHT (ภงด.53) remittance + VAT rollup (ภพ.30) + bank reconciliation are separate downstream builds (accounting.md gaps #7/#8/#9) — not this table's job.

---

## 6. What NOT to do (traps)
- ❌ **Do not resurrect `container_disbursements`** (mig 0069/0089) — FK'd to a retired spine, `kind` enum too narrow, no shipment/QO/WHT/category/payee/two-status-axis. It's tombstoned for good reason.
- ❌ Do not fold **เงินทดรองจ่าย** (customer-named-receipt pass-throughs) into cost/margin — the `is_customer_named_receipt` flag exists precisely to keep them out of revenue (gap #10).
- ❌ Do not treat the **payee** bank fields as a Pacred account — they're the outflow leg; the Pacred source is `source_account_key`.
- ❌ Do not ship the pay-flip in Slice 1 — it's a money register and needs the atomic-claim guard + ก๊อต co-sign.
- ❌ Do not model the fixed-recurring calendar (J) or bank-reconciliation here — out of scope, separate builds.
