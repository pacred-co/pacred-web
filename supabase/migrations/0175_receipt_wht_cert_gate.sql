-- ════════════════════════════════════════════════════════════
-- 0175 · ใบเสร็จ 50-ทวิ gate — lock customer print until the WHT cert
--        (renumbered 0173→0175: dave-pacred took 0173/0174 first · 2026-06-11)
--        is uploaded AND admin-approved (ภูม flag 2026-06-10)
-- ════════════════════════════════════════════════════════════
-- Rule (owner via ภูม): a juristic customer who withholds 1% CANNOT print /
-- download their ใบเสร็จ (the public /r/<token> page) until they upload their
-- 50-ทวิ certificate AND an admin approves it — otherwise Pacred loses the
-- tax credit. This adds the per-receipt cert state directly on tb_receipt
-- (the doc being gated); the WHT amount itself stays computed-on-read.
--
-- Flow:  none → pending (customer uploads on /r/<token>) → approved (admin)
--        none → waived  (admin: small WHT / customer won't send · with reason)
--
-- The print gate fires only when the receipt is corporate + has WHT > 0 AND
-- status is NOT approved/waived. Personal customers / no-WHT = 'none' but the
-- gate never triggers for them (no WHT line), so they print freely.
--
-- Storage reuses the existing private 'wht-certs' bucket (migration 0044).
-- Idempotent. Applied + verified prod 2026-06-11. Next free migration = 0179.
-- ════════════════════════════════════════════════════════════

alter table public.tb_receipt
  add column if not exists wht_cert_status      text        not null default 'none',
  add column if not exists wht_cert_path        text,
  add column if not exists wht_cert_no          text,
  add column if not exists wht_cert_uploaded_at timestamptz,
  add column if not exists wht_cert_approved_by text,
  add column if not exists wht_cert_approved_at timestamptz,
  add column if not exists wht_cert_waive_reason text;

-- Constrain the status to the 4 known states.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tb_receipt_wht_cert_status_check'
  ) then
    alter table public.tb_receipt
      add constraint tb_receipt_wht_cert_status_check
      check (wht_cert_status in ('none', 'pending', 'approved', 'waived'));
  end if;
end $$;

-- Queue index — the admin "ใบเสร็จรออนุมัติ 50 ทวิ" list reads pending rows.
create index if not exists tb_receipt_wht_cert_pending_idx
  on public.tb_receipt (wht_cert_uploaded_at)
  where wht_cert_status = 'pending';

comment on column public.tb_receipt.wht_cert_status is
  '50-ทวิ gate (ภูม 2026-06-10): none | pending (customer uploaded) | approved (admin) | waived (admin). Customer print on /r/<token> is locked until approved/waived for corporate+WHT receipts.';
comment on column public.tb_receipt.wht_cert_path is
  'Storage path in the private wht-certs bucket — the customer-uploaded 50-ทวิ file.';
