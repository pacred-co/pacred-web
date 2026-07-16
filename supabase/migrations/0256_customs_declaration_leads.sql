-- 0256 — Customs declaration (ใบขน) intelligence + importer sales-lead queue.
-- owner 2026-07-16: ดึงใบขนจาก NetBay (รถ/เรือ/แอร์) → data ลูกค้าที่ใช้ใบขน
-- (ชื่อ/นิติ/ที่อยู่/HS/อากร/ท่า/คลัง/supplier/แพทเทินฟอร์ม) + คิวให้เซลโทรตาม
-- มาเปิดใบขนกับเรา. เจ้าที่มีในระบบแล้ว = ชนด้วยเลขนิติ ได้เบอร์+เซลเลย.
--
-- Two tables:
--   customs_declaration  — one row per ใบขน (the raw NetBay export · HS/duty per line)
--   customs_importer_lead — one row per importer (the distinct customer · sales queue)

-- ── 1. per-declaration (the ใบขน itself) ──────────────────────────────────
create table if not exists customs_declaration (
  ref_no            text primary key,          -- e.g. QEUT010000146 (NetBay ref)
  transport         text not null,             -- 'road' | 'sea' | 'air'
  -- importer (the customer)
  importer_tax_id   text,
  importer_name_th  text,
  importer_name_en  text,
  importer_code     text,
  addr_street       text,
  addr_district     text,
  addr_subprovince  text,
  addr_province     text,
  addr_postcode     text,
  -- clearance / agent
  clearance_name    text,                        -- ตัวแทนออกของ (person)
  clearance_card    text,
  agent_code        text,                        -- INother Party (e.g. AXELRA)
  agent_tax         text,
  agent_name_th     text,
  job_no            text,
  ctrl_decl_no      text,
  -- transport / ports
  transport_mode    text,                        -- 1 sea · 3 road · air
  vessel_name       text,                        -- 'BY TRUCK' etc.
  voyage            text,
  release_port      text,                        -- ท่า/ด่าน
  discharge_port    text,
  arrival_date      text,
  -- dates / status
  payment_date      text,
  reference_date    text,
  recv_date         text,
  send_date         text,
  decl_type         text,
  decl_status       text,
  -- money
  currency          text,
  exchange_rate     numeric(14,5),
  cif_total_baht    numeric(16,2),
  total_tax         numeric(16,2),
  -- supplier (Chinese consignor)
  supplier_code     text,
  supplier_name     text,
  supplier_street   text,
  supplier_city     text,
  supplier_area     text,
  supplier_country  text,
  supplier_email    text,
  incoterm          text,
  -- line items: [{ tariff_hs, desc_en, desc_th, brand, duty_rate, duty_amt, vat_amt, cif_thb_line, qty, qty_unit, netweight, origin_country, priv }]
  lines             jsonb not null default '[]'::jsonb,
  source_file       text,
  imported_at       timestamptz not null default now(),
  constraint customs_declaration_transport_chk check (transport in ('road','sea','air'))
);
create index if not exists customs_declaration_importer_idx on customs_declaration (importer_tax_id);
create index if not exists customs_declaration_transport_idx on customs_declaration (transport);
create index if not exists customs_declaration_recv_idx on customs_declaration (recv_date);

-- ── 2. per-importer aggregate (the sales call queue) ──────────────────────
create table if not exists customs_importer_lead (
  tax_id            text primary key,          -- นิติบุคคล tax id (digits)
  name_th           text,
  name_en           text,
  address           text,
  province          text,
  postcode          text,
  transports        text[] not null default '{}'::text[],   -- {'road'} etc.
  decl_count        int not null default 0,
  total_cif         numeric(16,2) not null default 0,
  total_tax         numeric(16,2) not null default 0,
  first_decl_date   text,
  last_decl_date    text,
  hs_codes          jsonb not null default '[]'::jsonb,      -- distinct HS used
  suppliers         jsonb not null default '[]'::jsonb,      -- distinct Chinese suppliers
  -- cross-ref to an EXISTING Pacred customer (matched by tax id)
  matched_userid    text,
  matched_phone     text,
  matched_name      text,
  matched_sale      text,
  is_existing       boolean not null default false,
  -- sales workflow
  lead_status       text not null default 'new',   -- new|called|interested|converted|not_interested|our_own
  assigned_sale     text,
  call_note         text,
  called_at         timestamptz,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint customs_importer_lead_status_chk
    check (lead_status in ('new','called','interested','converted','not_interested','our_own'))
);
create index if not exists customs_importer_lead_existing_idx on customs_importer_lead (is_existing);
create index if not exists customs_importer_lead_status_idx on customs_importer_lead (lead_status);
create index if not exists customs_importer_lead_sale_idx on customs_importer_lead (assigned_sale);

-- ── RLS: service-role only (all reads/writes via server actions with withAdmin) ──
alter table customs_declaration enable row level security;
alter table customs_importer_lead enable row level security;
-- no policies → only the service-role key (server actions) can touch them.

comment on table customs_declaration  is 'ใบขนสินค้า (NetBay export) — per-declaration · HS/อากร/ท่า/supplier/แพทเทิน (owner 2026-07-16)';
comment on table customs_importer_lead is 'ลูกค้าที่ใช้ใบขน (aggregate per importer) — คิวให้เซลโทรตามมาเปิดใบขนกับเรา · ชนลูกค้าเดิมด้วยเลขนิติ';
