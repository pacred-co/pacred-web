-- ════════════════════════════════════════════════════════════
-- 0169 · warehouse_intake_log — China-warehouse worker-app audit trail
-- ════════════════════════════════════════════════════════════
-- W10 — MOMO/CargoThai warehouse worker-app (Theme 7 Phase 1). Reference:
-- docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md +
-- docs/learnings/freight-erp-model.md.
--
-- THE LAYER, NOT A REBUILD: the cargo spine already exists —
-- tb_forwarder (SHIPMENT · 114 cols) / tb_forwarder_item (ITEM) / tb_cnt
-- (container-cost ledger). The worker app WRITES those existing tables for
-- the real intake/measure/depart/arrive operations. This table is a
-- SEPARATE, ISOLATED audit trail recording every worker action (who scanned
-- what, when, the before/after fstatus, the measure values) so the
-- warehouse-ops timeline + the "no phone call" tracking USP have a per-event
-- history independent of the spine's last-write-wins columns.
--
-- ⚠️ ISOLATION RULES (per project safety constraints · same as 0163):
--   ✅ ONE new isolated table. NO FK to legacy tb_forwarder (it has an
--      integer PK, no profiles loop) — fid is stored as a plain bigint
--      reference + cross-checked in the action. admin_id is the legacy
--      tb_admin.adminID string (matches tb_forwarder.adminid* convention).
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE table เดิม (tb_forwarder etc.).
--   ❌ ห้ามแตะ money path — this table records events only; the worker
--      actions never write fcosttotalprice (cost-sheet authoritative) nor
--      any wallet/payment/billing column.
--
-- RLS: is_admin([super + warehouse + ops + manager]) — the warehouse
-- worker role-set. service-role (admin client) bypasses RLS for the
-- server actions.
--
-- Idempotent (safe to re-run): create … if not exists + drop policy if exists.
-- ════════════════════════════════════════════════════════════

create table if not exists public.warehouse_intake_log (
  id              uuid primary key default gen_random_uuid(),

  -- The tb_forwarder row this event acted on (plain bigint, no FK — legacy
  -- spine has no cascade/profiles loop; the action verifies the row exists).
  fid             bigint not null,

  -- The action the worker performed. Free text + CHECK so the timeline is
  -- predictable and the action surface can't drift the vocabulary.
  step            text not null
                    check (step in (
                      'intake',          -- scan tracking → received at CN warehouse (fstatus 1→2)
                      'measure',         -- record weight/dims → CBM
                      'sack',            -- pack item(s) into a sack (productbagid / warehouse_sack)
                      'unsack',          -- remove item(s) from a sack
                      'assign_container',-- attach to a container (fcabinetnumber)
                      'depart',          -- container leaves CN warehouse (fstatus 2→3)
                      'arrive',          -- shipment reaches TH warehouse (fstatus 3→4)
                      'status_override', -- supervisor manual status flip (gated)
                      'print_label'      -- printed a barcode/sack label
                    )),

  -- before/after fstatus snapshot (null when the step doesn't move status).
  fstatus_from    text,
  fstatus_to      text,

  -- the warehouse the event happened at (tb_forwarder.fwarehousename code · '' if n/a).
  warehouse_code  text,

  -- the legacy admin id of the worker (tb_admin.adminID · matches adminid* cols).
  admin_id        text not null,

  -- free-form snapshot of the values written (weights/dims/tracking/sack_no/…).
  payload         jsonb,

  note            text,

  created_at      timestamptz not null default now()
);

-- Timeline reads: per-shipment history, recent activity, per-step counts.
create index if not exists warehouse_intake_log_fid_idx     on public.warehouse_intake_log (fid, created_at desc);
create index if not exists warehouse_intake_log_step_idx    on public.warehouse_intake_log (step);
create index if not exists warehouse_intake_log_created_idx on public.warehouse_intake_log (created_at desc);
create index if not exists warehouse_intake_log_admin_idx   on public.warehouse_intake_log (admin_id);

-- ── RLS ───────────────────────────────────────────────────────
alter table public.warehouse_intake_log enable row level security;

drop policy if exists warehouse_intake_log_admin_all on public.warehouse_intake_log;
create policy warehouse_intake_log_admin_all
  on public.warehouse_intake_log for all
  using (public.is_admin(array['super','warehouse','ops','manager']))
  with check (public.is_admin(array['super','warehouse','ops','manager']));

comment on table public.warehouse_intake_log is
  'W10 China-warehouse worker-app audit trail. One row per worker action (intake/measure/sack/depart/arrive/…) over the tb_forwarder spine. Records who/what/when + before/after fstatus + a payload snapshot. ISOLATED — no FK to legacy, no money write. service-role bypasses RLS for the server actions.';

-- ════════════════════════════════════════════════════════════
-- DONE 0169.
-- Verification:
--   SELECT count(*) FROM warehouse_intake_log;   -- 0
--   SELECT count(*) FROM tb_forwarder;           -- unchanged (untouched)
-- next reserved (this wave) = 0170
-- ════════════════════════════════════════════════════════════
