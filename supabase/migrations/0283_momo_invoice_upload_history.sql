-- ════════════════════════════════════════════════════════════
-- 0283 · MOMO ใบวางบิล (invoice) upload HISTORY (เดฟ 2026-07-29)
-- ════════════════════════════════════════════════════════════
-- owner (verbatim): "ที่จริงใบวางบิล momo ที่อัพเข้าไป ทำประวัติเก็บไว้ บันทึกให้เองเลย
--   เหมือนฝั่งอัพ แพคกิ้งลิสตู้ไปเลยด้วยก็ดีครับ ทำให้ใช้ได้จริงและเสถียรนะครับ"
--
-- ความไม่สมมาตรที่ owner จับได้:
--   • ฝั่ง **แพคกิ้งลิส** เก็บทุกไฟล์ที่อัพ (0254 `momo_packing_upload`) → ย้อนดู/ดาวน์โหลดได้
--   • ฝั่ง **ใบวางบิล MOMO** (invoice-cost) แกะ PDF เสร็จแล้ว **ทิ้งไฟล์ทิ้งผลไปเลย** —
--     ไม่มีประวัติ ไม่รู้ว่าใครอัพใบไหนเมื่อไร ใบนั้นบันทึกต้นทุนไปแล้วหรือยัง
--     (บัญชีต้องเปิดเมลหาไฟล์เดิมมาอัพซ้ำถึงจะรู้)
--
-- ตารางนี้ = บ้านของประวัติฝั่งใบวางบิล (แพทเทินเดียวกับ 0254 เป๊ะ):
--   • ไฟล์ต้นฉบับ (เก็บใน bucket `csv-imports` prefix `momo-invoice/`) → ดาวน์โหลดย้อนหลัง
--   • parsed_snapshot (jsonb) = ผลตรวจ "ตอนที่อัพ" → กด "ดูอีกครั้ง" ได้ทันที ไม่ต้องแกะ PDF ใหม่
--   • ยอดของใบ (Sub-total / Σ บรรทัด / ตรงกันไหม / วิธีอ่านคิว) + จับคู่ได้กี่บรรทัด/ตู้ไม่ตรงกี่บรรทัด
--   • applied_at + status = ใบนี้กด "บันทึกต้นทุน" ไปแล้วหรือยัง (ไม่ต้องเดาจากความจำ)
--
-- 🔒 ISOLATION (§0e): ตาราง REFERENCE/audit เพิ่มใหม่ล้วน — ไม่แตะ tb_forwarder ·
--    fcosttotalprice · momo_invoice_line · momo_invoice_settlement · เงินใดๆ ทั้งสิ้น.
--    เขียนโดย action แยกไฟล์ (actions/admin/momo-invoice-history.ts) · service-role only (RLS) ·
--    idempotent (รันซ้ำได้).
-- ════════════════════════════════════════════════════════════

create table if not exists public.momo_invoice_upload (
  id                bigint generated always as identity primary key,
  -- ไฟล์ต้นฉบับที่เก็บไว้
  file_path         text,                    -- storage path ใน `csv-imports` (null = เก็บไฟล์ไม่สำเร็จ / มาจากการวางข้อความ)
  file_name         text,                    -- ชื่อไฟล์ตามที่อัพมา
  file_size         integer,                 -- ไบต์
  -- ตัวตนของใบ (แกะจากตัวใบเอง)
  invoice_no        text,                    -- NO: INV-YYYYMMDD-NNNN
  invoice_date      date,                    -- วันที่ในเลขที่ใบ (INV-20260708-… → 2026-07-08)
  supplier          text,                    -- ผู้วางบิล (ฮุย ไท่ต๋า / HUI TAI DA) · null = อ่านไม่เจอ
  source            text,                    -- 'pdf_upload' | 'paste' — ใบนี้เข้ามาทางไหน (แถวที่ไม่มีไฟล์ต้องบอกได้ว่าทำไม)
  -- ยอดของใบ (สรุปแถวประวัติ — ไม่ต้องแกะ PDF ใหม่)
  line_count        integer   default 0,     -- จำนวนบรรทัดที่แกะได้
  sub_total         numeric(14,2),           -- "ค่าขนส่งทั้งหมด (Sub-total)" ที่พิมพ์บนใบ
  lines_total       numeric(14,2),           -- Σ ต้นทุนทุกบรรทัดที่แกะได้
  reconciles        boolean,                 -- Σ ตรง Sub-total (ประตูเงินที่ 1)
  cbm_basis         text,                    -- 'line_total' | 'per_box' | null
  -- ผลตรวจกับระบบ ณ เวลาที่อัพ
  matched_count     integer   default 0,     -- จับคู่กับ tb_forwarder ได้
  unmatched_count   integer   default 0,     -- ไม่พบในระบบ
  conflict_count    integer   default 0,     -- ตู้ไม่ตรง (ถูกบล็อก)
  -- ผลตรวจเต็ม (แถว + ยอดสรุป) → "ดูอีกครั้ง" ทันที
  parsed_snapshot   jsonb     not null default '{}'::jsonb,
  -- audit
  uploaded_by       text,                    -- adminId (รูปแบบ string ≤20)
  uploaded_at       timestamptz not null default now(),
  applied_at        timestamptz,             -- ประทับเมื่อใบนี้ถูกกด "บันทึกต้นทุน" สำเร็จ
  status            text      not null default 'uploaded'  -- 'uploaded' | 'applied'
);

comment on table public.momo_invoice_upload is
  'History of MOMO supplier-invoice (ใบวางบิล) uploads on /admin/api-forwarder-momo/invoice-cost: original PDF + parsed snapshot + per-file totals + applied stamp. Reference/audit only — no money, no tb_forwarder write. Mirrors momo_packing_upload (0254).';

-- ประวัติ: ใหม่→เก่า และค้นตามเลขที่ใบ
create index if not exists momo_invoice_upload_uploaded_idx
  on public.momo_invoice_upload (uploaded_at desc);
create index if not exists momo_invoice_upload_invoice_idx
  on public.momo_invoice_upload (invoice_no, uploaded_at desc)
  where invoice_no is not null;

-- Service-role only (แพทเทินเดียวกับ momo_packing_upload · 0254 / momo_import_tracks · 0116).
-- ไม่มี policy = anon/authenticated เข้าไม่ได้ · admin service-role client bypass RLS.
alter table public.momo_invoice_upload enable row level security;

-- ════════════════════════════════════════════════════════════
-- Verify (SQL editor หลัง apply):
--   SELECT id, invoice_no, invoice_date, line_count, sub_total, reconciles,
--          matched_count, unmatched_count, conflict_count, status, uploaded_at
--     FROM momo_invoice_upload ORDER BY uploaded_at DESC LIMIT 20;
-- ════════════════════════════════════════════════════════════
