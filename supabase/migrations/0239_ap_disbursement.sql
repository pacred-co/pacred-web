-- ════════════════════════════════════════════════════════════
-- 0239 · AP / เบิกจ่าย ledger — the first-class disbursement ledger
-- ════════════════════════════════════════════════════════════
-- Spec: docs/research/accounting-ap-2026-07-01/spec.md
--
-- Brings the money-OUT (AP / เบิกจ่าย / disbursement) workflow — today run
-- on 2 ACC spreadsheets (`ACC เบิกเงิน.xlsx` + `เบิกจ่ายกองกลาง.xlsx`) — into a
-- first-class DB ledger. The GAP (accounting.md gap #1) = the *general
-- per-shipment* service disbursement (เบิกเงิน) row + the กองกลางโกดังจีน CNY
-- float. None of it had a DB home; the 3 existing registers (shop-pay /
-- ค่าตู้ / commission) are narrow per-parent silos.
--
--   3 tables (additive, idempotent, finance-only RLS):
--     1) ap_disbursement       — the canonical เบิกเงิน row (covers lanes
--        D/E/F/G/H: SEA/AIR/TRUCK/6699/โชห่วย/ตั๋วชน/Export/คืนภาษี/ทั่วไป/
--        Cargo/ปิดตรวจ/NNB) — generalizes the tb_shop_pay_h shape.
--     2) ap_disbursement_batch — optional wrapper (mirrors tb_shop_pay_h):
--        one "ทำรายการเบิกเงิน" event grouping N rows.
--     3) ap_central_fund       — the กองกลางโกดังจีน CNY imprest float (I),
--        a different shape (¥ + เรท + ฿ + หาร2 + running ¥ balance).
--
-- ── MONEY-SAFETY (spec §5) ──────────────────────────────────
-- Slice 1 (this migration + the read/request/approve surface) writes ONLY
-- these NEW tables. It NEVER touches any existing money table (tb_wallet*/
-- tb_payment/tb_cnt_pay*/tb_user_sales_pay/tb_forwarder_invoice). The
-- pay-flip (approved → transferred = a register of an out-of-band bank
-- transfer) is DEFERRED to Slice 2 with the atomic-claim guard from
-- markShopDisbursementPaid + ก๊อต co-sign.
--
-- ── RLS ─────────────────────────────────────────────────────
-- Mirror container_disbursements (mig 0069): super + accounting WRITE +
-- READ; explicitly + 'ultra' (mig 0193 god role — is_admin auto-grants
-- 'super' but NOT 'ultra', so it must be named). No ops/warehouse/sales.
-- AP ledger is finance-only, never customer-facing.
--
-- ── Storage ─────────────────────────────────────────────────
-- Slip images reuse the existing private bucket 'disbursement-receipts'
-- (mig 0069) with its super+accounting storage policies. No new bucket.
--
-- Idempotent + additive. Zero data migration. NOT the tombstoned
-- container_disbursements (0069/0089) — that FK'd a retired spine + its
-- `kind` enum was far too narrow; do not resurrect it (spec §6).
-- ════════════════════════════════════════════════════════════

-- ── 1) ap_disbursement_batch — optional wrapper (mirrors tb_shop_pay_h) ──
-- Created FIRST so ap_disbursement can FK to it.

create table if not exists public.ap_disbursement_batch (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,                 -- "เบิกงาน SHIPMENT PRA260050001" / "รอบ 25/06"
  lane                text,
  entity              text not null default 'pacred'
                        check (entity in ('pacred','axelra','nnb','pcs','ttp')),
  status              text not null default 'draft'  -- draft → approved → paid (mirrors tb_shop_pay_h '1'→'2')
                        check (status in ('draft','approved','paid','rejected')),
  -- Σ(amount_withdraw − amount_refund), server-recomputed — never trusted from client.
  amount_total        numeric(14,2) not null default 0,
  source_account_key  text check (source_account_key in ('service','logistics','trading')),
  slip_path           text,
  created_by          uuid references public.profiles(id),
  approved_by         uuid references public.profiles(id),
  paid_by             uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table public.ap_disbursement_batch is
  '0239 AP ledger — optional wrapper (mirrors tb_shop_pay_h): one "ทำรายการเบิกเงิน" event grouping N ap_disbursement rows. Bare one-off OPEX เบิก can skip the batch (ap_disbursement.batch_id null).';

-- ── 2) ap_disbursement — the canonical เบิกเงิน row (covers D/E/F/G/H) ──

create table if not exists public.ap_disbursement (
  id                 uuid primary key default gen_random_uuid(),

  -- ── grouping / linkage (the xlsx sheet + shipment spine) ──
  batch_id           uuid references public.ap_disbursement_batch(id) on delete set null,
  lane               text not null check (lane in (               -- which sheet/mode = maps 1:1 to the xlsx tabs
                        'sea','air','truck','tr_6699','sea_choho',   -- เบิกเงินทำงาน SEA/AIR/TRUCK/6699-TR/โชห่วย
                        'tua_chon','export','cn_vat_refund',         -- ตั๋วชน / Export / คืนภาษีโกดังจีน
                        'general','cargo','close_inspect','nnb')),   -- ทั่วไป / Cargo / ปิดตรวจ / NNB
  entity             text not null default 'pacred'                 -- PACRED/AXELRA/NNB/PCS/TTP
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
                        'service_cost',         -- ต้นทุนบริการ
                        'advance_passthrough',  -- เงินทดรองจ่าย (มีใบเสร็จชื่อลูกค้า → NOT revenue)
                        'refund_correction')),  -- เบิก/คืนเงิน และอื่นๆ
  item_label         text not null,           -- รายการเบิกเงิน (the line, e.g. "ค่า D/O", "ค่าบริการ FORM E")
  expense_category   text,                    -- หมวดบัญชี (OPEX only: ทั่วไป/บุคลากร/ซ่อมแซม/เงินสดย่อย/ต้นทุนขนส่ง…)
  note               text,                    -- หมายเหตุ + REMARK
  -- "มีใบเสร็จรับเงินชื่อลูกค้า" (pass-through flag · gap #10 — MUST NOT be booked as revenue/margin)
  is_customer_named_receipt boolean not null default false,

  -- ── money (two columns per the sheet + WHT) ──
  amount_withdraw    numeric(14,2) not null default 0 check (amount_withdraw >= 0),  -- ยอดเบิก
  amount_refund      numeric(14,2) not null default 0 check (amount_refund   >= 0),  -- ยอดคืน
  amount_gross       numeric(14,2),           -- pre-WHT gross basis (e.g. 4500 → pay 4455)
  wht_pct            numeric(5,2),            -- หัก 3% / 1% (vendor WHT, ภงด.53 side)
  wht_cert_no        text,                    -- ใบหัก WT/WT3/WT53-…

  -- ── source Pacred account (the OUTFLOW leg from) — 3-account SOT ──
  -- lib/payment/bank-accounts.ts (service|logistics|trading)
  source_account_key text check (source_account_key in ('service','logistics','trading')),
  -- ── payee bank (who Pacred pays TO — the outflow leg, NOT a Pacred account) ──
  payee_name         text,                    -- ชื่อบัญชี
  payee_account_no   text,                    -- เลขบัญชี
  payee_bank         text,                    -- ธนาคาร
  pay_channel        text,                    -- พร้อมเพย์ / โอน / สแกนจ่าย Alipay …

  -- ── STATUS axis 1: transfer (สถานะโอนเงิน) — the register flip ──
  transfer_status    text not null default 'requested' check (transfer_status in (
                        'requested',     -- ต้องการเบิก / ยังไม่ได้โอน (recorded, not yet paid)
                        'approved',      -- อนุมัติแล้ว รอโอน (the approve gate before pay)
                        'transferred',   -- โอนแล้ว (money moved out-of-band; slip attached · Slice 2)
                        'customer_paid', -- ลค.ชำระเอง (customer scanned directly — no Pacred outflow)
                        'rejected')),    -- ยกเลิก
  transferred_at     timestamptz,             -- วันที่โอน + เวลา (combined) · set in Slice 2
  transfer_slip_path text,                    -- slip image (bucket 'disbursement-receipts') · set in Slice 2

  -- ── STATUS axis 2: receipt-chase (สถานะการตามใบเสร็จ) — independent ──
  receipt_status     text not null default 'pending' check (receipt_status in (
                        'pending','received','customer_named','na')),

  -- ── request/approve audit (the workflow) ──
  requested_by       uuid references public.profiles(id),   -- who created the เบิก request
  requested_at       timestamptz not null default now(),
  approved_by        uuid references public.profiles(id),   -- ACC AP approver
  approved_at        timestamptz,
  paid_by            uuid references public.profiles(id),   -- who flipped → transferred (Slice 2)
  legacy_admin_id    text,                                   -- tb_admin.adminID (parity w/ shop-disbursement)

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- a refund/correction row uses amount_refund; a normal spend uses amount_withdraw (not both 0)
  constraint ap_disbursement_has_amount check (amount_withdraw > 0 or amount_refund > 0)
);

create index if not exists ap_disbursement_shipment_idx
  on public.ap_disbursement(shipment_no);
create index if not exists ap_disbursement_lane_status_idx
  on public.ap_disbursement(lane, transfer_status);
create index if not exists ap_disbursement_requested_idx
  on public.ap_disbursement(requested_at desc);
create index if not exists ap_disbursement_batch_idx
  on public.ap_disbursement(batch_id);

comment on table public.ap_disbursement is
  '0239 AP ledger — the canonical เบิกเงิน (disbursement) row. Generalizes tb_shop_pay_h across lanes D/E/F/G/H (SEA/AIR/TRUCK/6699/โชห่วย/ตั๋วชน/Export/คืนภาษี/ทั่วไป/Cargo/ปิดตรวจ/NNB). Two money columns (amount_withdraw ยอดเบิก / amount_refund ยอดคืน) + vendor WHT + two independent status axes (transfer / receipt-chase). Slice 1 = read + request/approve only; the transferred pay-flip is Slice 2.';
comment on column public.ap_disbursement.category is
  'หมวดหมู่รายการ — service_cost (ต้นทุนบริการ · carries vendor WHT) | advance_passthrough (เงินทดรองจ่าย · often มีใบเสร็จชื่อลูกค้า → NOT revenue) | refund_correction (เบิก/คืนเงิน · uses amount_refund).';
comment on column public.ap_disbursement.is_customer_named_receipt is
  'gap #10 — "มีใบเสร็จรับเงินชื่อลูกค้า": the receipt is in the CUSTOMER name → pure reimbursable pass-through, MUST NOT be booked as Pacred revenue/margin.';
comment on column public.ap_disbursement.source_account_key is
  '3-account SOT (lib/payment/bank-accounts.ts) — the Pacred OUTFLOW account. payee_* is who Pacred pays TO (never a Pacred account).';

-- ── 3) ap_central_fund — the กองกลางโกดังจีน CNY imprest float (I) ──

create table if not exists public.ap_central_fund (
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

create index if not exists ap_central_fund_date_idx
  on public.ap_central_fund(fund_key, txn_date desc);

comment on table public.ap_central_fund is
  '0239 AP ledger — the กองกลางโกดังจีน CNY imprest float (I). Different shape from ap_disbursement (¥ + เรท + ฿ + หาร2 + running ¥ balance, fixed destination). Top-up vs spend distinguished by sign of amount_cny at the app layer.';

-- ── updated_at triggers (reuse the shared set_updated_at) ──
drop trigger if exists ap_disbursement_batch_updated_at_trigger on public.ap_disbursement_batch;
create trigger ap_disbursement_batch_updated_at_trigger
  before update on public.ap_disbursement_batch
  for each row execute function public.set_updated_at();

drop trigger if exists ap_disbursement_updated_at_trigger on public.ap_disbursement;
create trigger ap_disbursement_updated_at_trigger
  before update on public.ap_disbursement
  for each row execute function public.set_updated_at();

-- ── RLS — finance-only (super + accounting + ultra), mirror container_disbursements ──
alter table public.ap_disbursement_batch enable row level security;
alter table public.ap_disbursement       enable row level security;
alter table public.ap_central_fund       enable row level security;

drop policy if exists ap_disbursement_batch_admin_all on public.ap_disbursement_batch;
create policy ap_disbursement_batch_admin_all
  on public.ap_disbursement_batch for all
  using      (public.is_admin(array['ultra','super','accounting']))
  with check (public.is_admin(array['ultra','super','accounting']));

drop policy if exists ap_disbursement_admin_all on public.ap_disbursement;
create policy ap_disbursement_admin_all
  on public.ap_disbursement for all
  using      (public.is_admin(array['ultra','super','accounting']))
  with check (public.is_admin(array['ultra','super','accounting']));

drop policy if exists ap_central_fund_admin_all on public.ap_central_fund;
create policy ap_central_fund_admin_all
  on public.ap_central_fund for all
  using      (public.is_admin(array['ultra','super','accounting']))
  with check (public.is_admin(array['ultra','super','accounting']));

-- ── verification notice ──
do $$
declare
  n_disb int;
  n_batch int;
  n_fund int;
begin
  select count(*) into n_disb  from pg_policies where schemaname='public' and tablename='ap_disbursement';
  select count(*) into n_batch from pg_policies where schemaname='public' and tablename='ap_disbursement_batch';
  select count(*) into n_fund  from pg_policies where schemaname='public' and tablename='ap_central_fund';
  if n_disb < 1 or n_batch < 1 or n_fund < 1 then
    raise warning '0239 RLS incomplete — ap_disbursement %, batch %, central_fund %', n_disb, n_batch, n_fund;
  end if;
  raise notice '0239 AP ledger ready — ap_disbursement % policy, batch % policy, central_fund % policy', n_disb, n_batch, n_fund;
end $$;
