-- ════════════════════════════════════════════════════════════
-- 0273 · momo_invoice_settlement — the MOMO-bill SETTLEMENT (ตัดจ่าย) register
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-22, verbatim): *"มันต้องมี action ให้กดบันทึกต้นทุน แล้วก็ แสดงผล
--   กลับของ action นั้นๆ ด้วย แล้วก็บันทึกเสร็จก็มีปุ่มให้กด ตัดจ่าย ตามรายการได้ด้วย …
--   ตัดจ่ายทั้งบิลได้ครับ … คำว่า ตัดจ่ายตู้นี้ใช้ไม่ได้นะครับ เพราะมันไม่ใช่ทั้งตู้ครับ …
--   บางบิลของ MOMO ก็มีหลายตู้ครับเพราะ เขาเก็บเรามาแบบ tracking … พอกดตัดบิล MOMO นี้
--   ก็มีรันเอกสารไว้ให้สามารถดูประวัติ และ ดูอ้างอิงได้ และต้องมีช่องไว้ใส่สลิปย้อนหลังได้ด้วย"*
--
-- WHAT THIS IS:
--   The append-only register of "we PAID a MOMO bill". Distinct from the legacy
--   per-CONTAINER tb_cnt register (report-cnt.php · "ตัดจ่ายค่าตู้") — which the owner
--   just rejected because a MOMO bill is billed PER TRACKING and one bill can span
--   MULTIPLE containers (proven prod: INV-20260708-0002 spans GZS260620-2 + GZE260701-1).
--   So settlement is keyed to the BILL, not the ตู้. One header per settlement (a whole
--   bill OR a single line), N lines (one per tb_forwarder row settled), a running doc_no
--   (MCS{yyMM}-{NNNN}) for history + reference, retroactive slip attachment, and void.
--
-- WHAT THIS IS NOT:
--   - NOT a money-mover. Recording a settlement moves ZERO baht in-app — the real payment
--     is a bank transfer to MOMO; the slip is the evidence (same model as tb_cnt / the
--     billing-run slip register). NO FK to tb_forwarder / tb_cnt / any wallet/billing table
--     (§0e money-isolation · mirrors momo_invoice_line 0267 + taem_packing_line). `fid` is a
--     plain bigint snapshot of tb_forwarder.id — a dangling fid never blocks anything.
--   - NOT a cost/status input. It never writes fcosttotalprice (that stays the บันทึกต้นทุน
--     path = applyMomoInvoiceCost) nor fstatus (customer-facing SELL axis — untouched).
--     The link-back to a shipment/tracking is DISPLAY-only (a "ตัดจ่ายแล้ว · MCS…" chip).
--
-- DOUBLE-PAY GUARD:
--   A settlement line REQUIRES fid (only positively-identified rows can settle) and is
--   UNIQUE per (settlement_id, fid) so one settlement can't list a row twice. Across
--   settlements, a fid may legitimately reappear after a VOID (void frees it) — so there
--   is NO cross-settlement UNIQUE(fid) constraint; the create action enforces "no fid
--   already covered by a NON-VOID settlement" (createMomoInvoiceSettlement · the create-side
--   double-pay lesson · cnt-hs 2026-06-14). Fail-safe direction: the guard refuses on doubt.
--
-- Additive + idempotent (create … if not exists). Safe to re-run. RLS enabled, NO policies
-- → service-role only (the admin client reads/writes it after withAdmin gating), matching
-- the mig 0256 customs-lead / 0267 momo_invoice_line isolation style. Next free = 0274.
-- The integrator (เดฟ) applies migrations; the app reads these tables FAIL-SOFT (a missing
-- table degrades the settled-chip to "ไม่มีข้อมูล", never a 500), so a deploy that briefly
-- precedes this migration never breaks.
-- ════════════════════════════════════════════════════════════

create table if not exists public.momo_invoice_settlement (
  id           bigserial primary key,
  -- Running document number for history + reference: MCS{yyMM}-{NNNN} (e.g. MCS2607-0001).
  -- UNIQUE — the create action mints it with a retry-on-collision loop (23505 → re-mint).
  doc_no       text not null,
  -- The MOMO invoice this settlement paid (as printed, e.g. "INV-20260708-0002"). May be
  -- '' for an unnumbered bill — the doc_no is the real identity.
  invoice_no   text not null default '',
  -- The invoice's printed date (nullable — some bills omit it).
  invoice_date date,
  supplier     text not null default 'MOMO',
  -- Σ of this settlement's line amounts (gross per-tracking Total THB). The WHT/net is on
  -- the invoice itself (shown in the workspace) — not overloaded into the register.
  total_thb    numeric(14,2) not null default 0,
  line_count   int not null default 0,
  -- 'paid' = recorded (the default on create — the accountant records an already-done
  -- transfer, like tb_cnt) · 'void' = reversed, kept for history (append-only truth).
  status       text not null default 'paid' check (status in ('paid', 'void')),
  -- Retroactive bank-slip evidence — jsonb array of storage paths (member-docs bucket),
  -- same multi-slip shape as tb_forwarder_invoice.slip_paths (billing-run · mig 0231).
  slip_paths   jsonb not null default '[]'::jsonb,
  note         text,
  -- Which source the bill was read from — 'pdf_upload' | 'paste'. A money-provenance write
  -- must never be ambiguous about its origin when audited months later.
  source_kind  text,
  created_by   text,
  created_at   timestamptz not null default now(),
  paid_by      text,
  paid_at      timestamptz not null default now(),
  void_by      text,
  void_at      timestamptz,
  void_reason  text,
  constraint momo_invoice_settlement_doc_no_uniq unique (doc_no)
);

create index if not exists momo_invoice_settlement_invoice_idx
  on public.momo_invoice_settlement (invoice_no);
create index if not exists momo_invoice_settlement_status_idx
  on public.momo_invoice_settlement (status);
create index if not exists momo_invoice_settlement_created_idx
  on public.momo_invoice_settlement (created_at desc);

create table if not exists public.momo_invoice_settlement_line (
  id            bigserial primary key,
  settlement_id bigint not null references public.momo_invoice_settlement(id) on delete cascade,
  -- The tb_forwarder row this line settled. Plain bigint snapshot — NO FK (§0e). REQUIRED:
  -- only positively-identified (matched · ตู้ตรง · not shared) lines can settle.
  fid           bigint not null,
  -- The tracking AS MOMO PRINTED IT (may be "<base>-1/N") + our container at settle time
  -- (snapshots for the history view · the double-pay guard trusts fid, not these).
  tracking      text not null default '',
  cabinet       text,
  amount_thb    numeric(14,2) not null default 0,
  -- Was tb_forwarder.fcosttotalprice already equal to this line's invoice amount at settle
  -- time (i.e. the บันทึกต้นทุน step had run)? Informational — settle never requires it.
  cost_written  boolean not null default false,
  -- One settlement can't list the same row twice (23505 → the create action refuses).
  constraint momo_invoice_settlement_line_uniq unique (settlement_id, fid)
);

-- The double-pay guard reads paid lines by fid; the history detail reads lines by settlement.
create index if not exists momo_invoice_settlement_line_fid_idx
  on public.momo_invoice_settlement_line (fid);
create index if not exists momo_invoice_settlement_line_settlement_idx
  on public.momo_invoice_settlement_line (settlement_id);

alter table public.momo_invoice_settlement enable row level security;
alter table public.momo_invoice_settlement_line enable row level security;
-- NO policies → service-role only (the withAdmin-gated admin client is the sole accessor).
