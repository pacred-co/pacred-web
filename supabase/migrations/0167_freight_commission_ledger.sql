-- ════════════════════════════════════════════════════════════════
-- 0167 — FREIGHT staff commission ledger (accrual + withdrawal workflow)
-- WAVE 6 · เดฟ-agent · 2026-06-09 · 💰 MONEY-CRITICAL · ships DORMANT.
-- ════════════════════════════════════════════════════════════════
-- WHY A NEW, FREIGHT-PREFIXED LEDGER (vs reusing the 0054 commission_* tables):
--   The 0054 `commission_*` family (commission_tiers / _accruals / _withdrawals
--   / _withdrawal_items) was TOMBSTONED 2026-06-02 (ADR-0026): the canonical
--   CARGO commission SOT moved to `tb_user_sales*` (Path A), and the rebuilt
--   `commission_*` tables are 0-row dead twins. Re-animating them for FREIGHT
--   would risk re-opening the §0e dead-write trap on the cargo side. The FREIGHT
--   product line (the AXELRA B2B side) has NO tb_user_sales equivalent — so it
--   needs its OWN clean ledger. We give it freight-prefixed tables that no cargo
--   path reads, so the two systems never collide.
--
-- 🔒 NON-NEGOTIABLE SAFETY (the owner has NOT confirmed the rate VALUES yet):
--   1. DORMANT FLAG gates EVERYTHING — business_config `commission.freight_enabled`
--      seeded {"enabled": false}. While OFF: adminAccrueFreightCommission no-ops
--      (records nothing) + the admin UI shows a "รอ owner ยืนยัน rate + เปิดใช้"
--      banner. Mirrors the proven `tax_invoice.shop_yuan_enabled` (0152) pattern.
--   2. RATES live as EDITABLE DATA in freight_commission_tiers (seeded from the
--      documented AX-JOB values, flagged is_owner_confirmed=false) — NOT hardcoded
--      in the calc. The calc READS the active tier rows. "Confirm the rates in
--      writing" = the owner reviews/edits the seeded tiers + flips the flag.
--   3. NO AUTO-PAYOUT — withdrawals go pending → approved → paid; the `paid`
--      transition requires `super` + an explicit confirm-before-mutate action.
--      Never auto-pay. The accrual is a LEDGER (visibility) row, not a money move.
--   4. IDEMPOTENCY — freight_commission_accruals partial-UNIQUE
--      (source_kind, source_ref, earner_admin_id) so re-running the accrual
--      trigger never double-credits.
--
-- Thai-law WHT: WHT 3% on the freight commission line (off-book of the company);
--   WHT 15% on a withdrawal > 5,000฿ (Revenue Code §50(1)). The computation lives
--   in lib/freight-commission/calc-v2.ts; the WHT columns here STORE the snapshot.
--
-- Idempotent throughout (`if not exists`, `drop ... if exists` first).
-- RLS service-role-only via the admin client (actions gate withAdmin([...])) —
-- plus explicit is_admin([...]) policies for any future user-session read.
-- ════════════════════════════════════════════════════════════════

-- ── 1) freight_commission_tiers — editable rate catalogue (NOT hardcoded) ──
-- One row per (role_kind × service_kind × effective_from). The calc reads the
-- ACTIVE row; is_owner_confirmed gates whether a rate is owner-blessed for
-- production. Seeded rows below ship is_owner_confirmed=false.
create table if not exists public.freight_commission_tiers (
  id                 uuid primary key default gen_random_uuid(),
  -- which staff role earns at this rate (freight sales / interpreter / pricing / etc.)
  role_kind          text not null default 'freight_sales',
  -- which freight revenue bucket this rate applies to.
  service_kind       text not null
                       check (service_kind in (
                         'freight_quote',    -- the freight (ค่าเฟรท) revenue line
                         'freight_customs',  -- the customs-clearance (พิธีการ) revenue line
                         'freight_doc',      -- the doc-handling (เอกสาร) revenue line
                         'freight_flat'      -- a flat per-shipment fee (EK/AIR)
                       )),
  -- EXACTLY one of rate_pct / flat_thb is non-null (XOR constraint below).
  rate_pct           numeric(6,3),                                  -- e.g. 1.000 = 1%
  flat_thb           numeric(12,2),                                 -- OR a flat per-shipment amount
  -- the WHT % withheld on THIS commission line (3% on the freight comm per AX JOB).
  wht_pct            numeric(6,3) not null default 0,
  effective_from     date not null default current_date,
  active             boolean not null default true,
  -- 🔒 the owner-sign-off gate: false until the owner confirms the rate in writing.
  is_owner_confirmed boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint freight_commission_tiers_rate_xor_flat check (
    (rate_pct is not null and flat_thb is null)
    or (rate_pct is null and flat_thb is not null)
  )
);

create index if not exists freight_commission_tiers_lookup_idx
  on public.freight_commission_tiers (service_kind, active, effective_from desc);

-- ── 2) freight_commission_accruals — earned-but-unpaid ledger rows ──
-- One row per (earner × source). Idempotent via partial-UNIQUE on
-- (source_kind, source_ref, earner_admin_id). The accrual is a LEDGER (visibility)
-- row — it does NOT move money. status: accrued → withdrawn (when bundled).
create table if not exists public.freight_commission_accruals (
  id                        uuid primary key default gen_random_uuid(),
  earner_admin_id           uuid not null references public.profiles(id) on delete restrict,
  -- what minted this accrual. 'freight_invoice' (on issuance) is the V1 trigger.
  source_kind               text not null,                          -- e.g. 'freight_invoice'
  source_ref                text not null,                          -- e.g. the job_no / invoice_no
  -- the base revenue the rate(s) applied to (the freight+customs+doc bucket sum).
  base_thb                  numeric(12,2) not null default 0,
  -- the accrued commission AFTER the per-line WHT split (net the earner is owed).
  accrued_amount_thb        numeric(12,2) not null default 0,
  -- the WHT % snapshot (the blended/representative WHT on the freight comm line).
  wht_pct                   numeric(6,3) not null default 0,
  -- per-scope breakdown (freight/customs/doc/flat → base · pct · gross · wht · net).
  commission_scope_breakdown jsonb,
  -- 'accrued' (open) | 'withdrawn' (bundled into a withdrawal) | 'void' (reversed).
  status                    text not null default 'accrued'
                              check (status in ('accrued','withdrawn','void')),
  -- set when included in a withdrawal (FK added after the items table exists).
  withdrawal_id             uuid,
  notes                     text,
  created_at                timestamptz not null default now()
);

-- Fast "my open accruals" — partial index on open rows only.
create index if not exists freight_commission_accruals_earner_open_idx
  on public.freight_commission_accruals (earner_admin_id, created_at desc)
  where status = 'accrued';
create index if not exists freight_commission_accruals_earner_idx
  on public.freight_commission_accruals (earner_admin_id, created_at desc);
-- Idempotency anchor — one accrual per (source × earner).
create unique index if not exists freight_commission_accruals_source_uidx
  on public.freight_commission_accruals (source_kind, source_ref, earner_admin_id);

-- ── 3) freight_commission_withdrawals — withdrawal request header ──
-- status machine: pending → approved → paid (happy path) · pending → rejected.
-- The `paid` flip requires super + an explicit confirm action (NO auto-pay).
create table if not exists public.freight_commission_withdrawals (
  id                       uuid primary key default gen_random_uuid(),
  earner_admin_id          uuid not null references public.profiles(id) on delete restrict,

  -- Financial snapshot (frozen at request time).
  gross_thb                numeric(12,2) not null check (gross_thb > 0),
  wht_thb                  numeric(12,2) not null default 0,         -- WHT 15% on >5k per §50(1)
  net_thb                  numeric(12,2) not null,
  wht_rate_pct             numeric(6,3) not null default 15,         -- the rate applied (audited override)

  -- Payee bank account snapshot (frozen at request time).
  payee_bank_name          text,
  payee_account_name       text,
  payee_account_no         text,

  status                   text not null default 'pending'
                             check (status in ('pending','approved','paid','rejected')),

  requested_at             timestamptz not null default now(),
  approved_at              timestamptz,
  approved_by              uuid references public.profiles(id),
  paid_at                  timestamptz,
  paid_by                  uuid references public.profiles(id),
  slip_storage_path        text,                                     -- bucket: commission-slips
  rejected_at              timestamptz,
  rejected_by              uuid references public.profiles(id),
  rejected_reason          text,

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- ── Consistency constraints (mirror the 0054 discipline) ──
  constraint freight_commission_withdrawals_paid_consistency check (
    status <> 'paid'
    or (paid_at is not null and paid_by is not null)
  ),
  constraint freight_commission_withdrawals_approved_consistency check (
    status not in ('approved','paid')
    or (approved_at is not null and approved_by is not null)
  ),
  constraint freight_commission_withdrawals_rejected_consistency check (
    status <> 'rejected'
    or (rejected_at is not null and rejected_by is not null
        and rejected_reason is not null and char_length(rejected_reason) >= 3)
  )
);

create index if not exists freight_commission_withdrawals_earner_idx
  on public.freight_commission_withdrawals (earner_admin_id, requested_at desc);
create index if not exists freight_commission_withdrawals_status_idx
  on public.freight_commission_withdrawals (status, requested_at desc);

-- ── 4) freight_commission_withdrawal_items — accruals ← withdrawal join ──
create table if not exists public.freight_commission_withdrawal_items (
  id            uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.freight_commission_withdrawals(id) on delete cascade,
  accrual_id    uuid not null references public.freight_commission_accruals(id) on delete restrict,
  amount_thb    numeric(12,2) not null default 0,                   -- snapshot at request time
  created_at    timestamptz not null default now(),
  unique (accrual_id)                                               -- one accrual → at most one withdrawal
);

create index if not exists freight_commission_withdrawal_items_withdrawal_idx
  on public.freight_commission_withdrawal_items (withdrawal_id);

-- Backfill the deferred FK on freight_commission_accruals.withdrawal_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'freight_commission_accruals_withdrawal_fkey'
  ) then
    alter table public.freight_commission_accruals
      add constraint freight_commission_accruals_withdrawal_fkey
      foreign key (withdrawal_id)
      references public.freight_commission_withdrawals(id)
      on delete set null;
  end if;
end $$;

-- ── 5) updated_at auto-touch (reuse the shared trigger fn if present) ──
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists freight_commission_tiers_updated_at on public.freight_commission_tiers;
    create trigger freight_commission_tiers_updated_at
      before update on public.freight_commission_tiers
      for each row execute function public.set_updated_at();
    drop trigger if exists freight_commission_withdrawals_updated_at on public.freight_commission_withdrawals;
    create trigger freight_commission_withdrawals_updated_at
      before update on public.freight_commission_withdrawals
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── 6) RLS — explicit is_admin([...]) for the commission role set ──
-- Reads/writes in the actions go through the SERVICE-ROLE admin client (bypasses
-- RLS) gated by withAdmin([...]). These policies future-proof user-session access
-- + match the requested role set: super · accounting · sales_admin · pricing ·
-- interpreter · the freight roles. service_role always bypasses.
alter table public.freight_commission_tiers            enable row level security;
alter table public.freight_commission_accruals         enable row level security;
alter table public.freight_commission_withdrawals      enable row level security;
alter table public.freight_commission_withdrawal_items enable row level security;

-- The commission role set (used across all four tables).
-- super · accounting · sales_admin · pricing · interpreter + freight sales/import/export.
drop policy if exists freight_commission_tiers_admin_all on public.freight_commission_tiers;
create policy freight_commission_tiers_admin_all
  on public.freight_commission_tiers for all
  using      (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']))
  with check (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']));

drop policy if exists freight_commission_accruals_admin_all on public.freight_commission_accruals;
create policy freight_commission_accruals_admin_all
  on public.freight_commission_accruals for all
  using      (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']))
  with check (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']));

drop policy if exists freight_commission_withdrawals_admin_all on public.freight_commission_withdrawals;
create policy freight_commission_withdrawals_admin_all
  on public.freight_commission_withdrawals for all
  using      (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']))
  with check (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']));

drop policy if exists freight_commission_withdrawal_items_admin_all on public.freight_commission_withdrawal_items;
create policy freight_commission_withdrawal_items_admin_all
  on public.freight_commission_withdrawal_items for all
  using      (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']))
  with check (public.is_admin(array['super','accounting','sales_admin','pricing','interpreter','freight_sales_manager','freight_sales','freight_import_manager','freight_export_manager']));

-- ── 7) DORMANT FLAG — seed default-OFF (the master gate · mirror 0152). ──
-- DEFAULT {"enabled": false} → deploying this migration changes NOTHING in
-- production until the owner flips it (after confirming the seeded tier rates).
-- ON CONFLICT preserves any later admin edit (the flag is toggled live).
insert into public.business_config (key, value, value_type, category, description)
values (
  'commission.freight_enabled',
  '{"enabled": false}'::jsonb,
  'json',
  'commission',
  'DORMANT-GATE สำหรับระบบค่าคอมมิชชั่น FREIGHT (สะสม + เบิกจ่าย). default {"enabled": false} = ปิด (ปลอดภัย · deploy ได้ไม่กระทบ prod). เมื่อปิด: adminAccrueFreightCommission จะไม่บันทึกอะไร + หน้าแอดมินขึ้นแบนเนอร์ "DORMANT". เปิดเมื่อ owner ยืนยันเรท commission ในตาราง freight_commission_tiers (รีวิว/แก้ + ตั้ง is_owner_confirmed=true) แล้วเท่านั้น.'
)
on conflict (key) do nothing;

-- ── 8) SEED the documented AX-JOB tiers (is_owner_confirmed = false). ──
-- The AX JOB commission model (docs/learnings/freight-erp-model.md §4 +
-- lib/freight/rate-model.ts FREIGHT_COMMISSION): freight 1% · customs 5% ·
-- doc 5% · flat 20฿/shipment (EK/AIR) — all WITH WHT 3% on the freight comm.
-- Seeded is_owner_confirmed=false → the calc treats them as PENDING until the
-- owner reviews + flips them (+ the master flag). Idempotent (skip if a tier
-- for the same service_kind already exists).
do $$
begin
  if not exists (select 1 from public.freight_commission_tiers where service_kind = 'freight_quote') then
    insert into public.freight_commission_tiers (role_kind, service_kind, rate_pct, flat_thb, wht_pct, is_owner_confirmed, notes)
    values ('freight_sales', 'freight_quote', 1.000, null, 3.000, false,
            'AX JOB: 1% commission on the freight (ค่าเฟรท) revenue line, − 3% WHT. PENDING owner confirm.');
  end if;
  if not exists (select 1 from public.freight_commission_tiers where service_kind = 'freight_customs') then
    insert into public.freight_commission_tiers (role_kind, service_kind, rate_pct, flat_thb, wht_pct, is_owner_confirmed, notes)
    values ('freight_sales', 'freight_customs', 5.000, null, 3.000, false,
            'AX JOB: 5% commission on the customs-clearance (พิธีการ) revenue line, − 3% WHT. PENDING owner confirm.');
  end if;
  if not exists (select 1 from public.freight_commission_tiers where service_kind = 'freight_doc') then
    insert into public.freight_commission_tiers (role_kind, service_kind, rate_pct, flat_thb, wht_pct, is_owner_confirmed, notes)
    values ('freight_sales', 'freight_doc', 5.000, null, 3.000, false,
            'AX JOB: 5% commission on the doc-handling (เอกสาร) revenue line, − 3% WHT. PENDING owner confirm.');
  end if;
  if not exists (select 1 from public.freight_commission_tiers where service_kind = 'freight_flat') then
    insert into public.freight_commission_tiers (role_kind, service_kind, rate_pct, flat_thb, wht_pct, is_owner_confirmed, notes)
    values ('freight_sales', 'freight_flat', null, 20.00, 0, false,
            'AX JOB: flat 20฿ / shipment (EK/AIR doc handling). PENDING owner confirm.');
  end if;
end $$;

-- ── 9) Comments ──
comment on table public.freight_commission_tiers is
  'WAVE 6 — editable FREIGHT commission rate catalogue (NOT hardcoded). The calc (lib/freight-commission/calc-v2.ts) reads the active rows. is_owner_confirmed gates production use — seeded false until the owner confirms the AX-JOB rates in writing.';
comment on column public.freight_commission_tiers.is_owner_confirmed is
  '🔒 owner sign-off gate. false = the rate is PENDING owner confirmation (the calc/UI flag it). The owner reviews/edits then flips both this AND business_config commission.freight_enabled.';
comment on table public.freight_commission_accruals is
  'WAVE 6 — earned-but-unpaid FREIGHT commission LEDGER rows (visibility, not a money move). Idempotent via partial-UNIQUE (source_kind, source_ref, earner_admin_id). Minted by adminAccrueFreightCommission ONLY when business_config commission.freight_enabled is ON.';
comment on table public.freight_commission_withdrawals is
  'WAVE 6 — FREIGHT commission withdrawal header. status pending → approved → paid (or rejected). NO AUTO-PAY: the paid flip requires super + an explicit confirm action. WHT 15% on net > 5,000฿ per Revenue Code §50(1).';
comment on table public.freight_commission_withdrawal_items is
  'WAVE 6 — accruals bundled into a FREIGHT commission withdrawal. UNIQUE (accrual_id) prevents double-include.';
