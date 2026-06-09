-- ════════════════════════════════════════════════════════════
-- 0170 · warehouse_sack — own-warehouse sack grouping (worker app)
-- ════════════════════════════════════════════════════════════
-- W10 — MOMO/CargoThai warehouse worker-app (Theme 7 Phase 1).
--
-- WHY A NEW TABLE (not tb_cnt, not momo_sack_infos):
--   - tb_cnt is the container-COST-PAYMENT ledger (ตารางจ่ายเงินค่าตู้ ·
--     cntname = เลขตู้) — a money table, NOT a worker sack model.
--   - momo_sack_infos is the MOMO partner-API SYNC MIRROR (read-only
--     consumer side; we PULL sacks FROM MOMO). The W10 spec is the INVERSE:
--     OUR own China warehouse creates sacks. A separate own-warehouse sack
--     model keeps the two ownership directions cleanly separated.
--   - The blueprint maps SACK + SackItem onto sack tables; tb_forwarder_item
--     already carries `productbagid` (the parcel→bag link). This table is the
--     parent "sack" record (sack number, weight, CBM, parcel count, sealed
--     flag, optional container link) that `productbagid` points at.
--
-- The MEMBER LINK between a parcel and a sack stays on the existing
-- tb_forwarder_item.productbagid column (set by the sack action). This table
-- holds the sack header only — no schema change to the legacy item table.
--
-- ⚠️ ISOLATION RULES (same as 0163 / 0169):
--   ✅ ONE new isolated table. No FK to legacy tb_* (integer PKs, no loop).
--   ❌ ห้าม ALTER / DROP / RENAME legacy tables.
--   ❌ ห้ามแตะ money path — sacks carry weight/CBM/count, never price/cost.
--
-- RLS: is_admin([super + warehouse + ops + manager]).
-- Idempotent (create … if not exists + drop policy if exists).
-- ════════════════════════════════════════════════════════════

create table if not exists public.warehouse_sack (
  id              bigserial primary key,

  -- Human/printable sack number — SK{yyMMdd}-{seq}. UNIQUE so a label scan
  -- resolves one sack.
  sack_no         text not null,

  -- the CN warehouse this sack belongs to (tb_forwarder.fwarehousename code).
  warehouse_code  text not null default '',

  -- optional container the sack is loaded into (tb_forwarder.fcabinetnumber).
  -- '' = not yet loaded.
  container_no    text not null default '',

  -- aggregate measure (recomputed by the action from the linked items, or
  -- worker-entered for a quick manual sack). weight kg · CBM m³.
  weight_kg       numeric(10,2) not null default 0
                    check (weight_kg >= 0 and weight_kg <= 99999999.99),
  cbm             numeric(10,5) not null default 0
                    check (cbm >= 0 and cbm <= 99999.99999),
  parcel_count    integer not null default 0
                    check (parcel_count >= 0),

  -- sealed = closed / tagged · once sealed the worker app treats it read-only
  -- (re-open is a supervisor action).
  sealed          boolean not null default false,
  sealed_at       timestamptz,
  sealed_by       text,

  -- the legacy admin id that created the sack (tb_admin.adminID).
  admin_id        text not null default '',

  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint warehouse_sack_no_unique unique (sack_no)
);

create index if not exists warehouse_sack_warehouse_idx on public.warehouse_sack (warehouse_code);
create index if not exists warehouse_sack_container_idx  on public.warehouse_sack (container_no);
create index if not exists warehouse_sack_sealed_idx     on public.warehouse_sack (sealed);
create index if not exists warehouse_sack_created_idx    on public.warehouse_sack (created_at desc);

drop trigger if exists warehouse_sack_updated_at_trigger on public.warehouse_sack;
create trigger warehouse_sack_updated_at_trigger
  before update on public.warehouse_sack
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
alter table public.warehouse_sack enable row level security;

drop policy if exists warehouse_sack_admin_all on public.warehouse_sack;
create policy warehouse_sack_admin_all
  on public.warehouse_sack for all
  using (public.is_admin(array['super','warehouse','ops','manager']))
  with check (public.is_admin(array['super','warehouse','ops','manager']));

comment on table public.warehouse_sack is
  'W10 own-warehouse sack header (worker app). The INVERSE of momo_sack_infos (MOMO sync mirror = consumer side) — this is OUR China warehouse creating sacks. Parcel→sack link lives on the existing tb_forwarder_item.productbagid; this is the sack record it points at (sack_no, weight, CBM, count, sealed). ISOLATED — no FK to legacy, no money.';

-- ════════════════════════════════════════════════════════════
-- DONE 0170.
-- Verification:
--   SELECT count(*) FROM warehouse_sack;   -- 0
-- next reserved (this wave) = 0171
-- ════════════════════════════════════════════════════════════
