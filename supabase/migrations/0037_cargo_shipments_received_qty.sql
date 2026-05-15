-- ════════════════════════════════════════════════════════════
-- U1-5 · cargo_shipments.received_box_count (split-receipt aware)
-- ════════════════════════════════════════════════════════════
-- Per chat audit MOMO group: container splits become qty=1 in legacy
-- because "เป็นข้อจำกัดของแอปรับเข้าไทย" — the receipt scanner only
-- records "received" as a binary, not partial counts.
--
-- Pacred fix: model expected vs received explicitly. Existing
-- `box_count` becomes the expected count (what was packed/declared at
-- origin). New `received_box_count` is what staff actually scanned in
-- at the TH warehouse. UI then computes "received N of M boxes".
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.cargo_shipments
  add column if not exists received_box_count int not null default 0;

-- Constraint: received cannot be negative. Allow received > expected
-- (rare but valid: extra boxes arrive that weren't on the manifest).
alter table public.cargo_shipments
  drop constraint if exists cargo_shipments_received_box_count_chk;
alter table public.cargo_shipments
  add constraint cargo_shipments_received_box_count_chk
  check (received_box_count >= 0);

-- Timestamp of the most recent received_box_count change. Useful for
-- "last partial scan" display + freshness metrics.
alter table public.cargo_shipments
  add column if not exists received_at_partial timestamptz;

-- Bookkeeping comments that future readers/devs will see in DB schema
comment on column public.cargo_shipments.box_count is
  'Expected number of boxes (declared at origin / packed by China warehouse). Compare with received_box_count to detect partial receipt — chat MOMO bug fix U1-5.';
comment on column public.cargo_shipments.received_box_count is
  'Actual boxes received at TH warehouse. Defaults 0 until staff scans in. Can exceed box_count if extra/unmanifested boxes arrive.';
comment on column public.cargo_shipments.received_at_partial is
  'Timestamp of the last received_box_count change. Distinct from received_at_cn (whole-shipment first-receive) and delivered_at_th (terminal transition).';

-- Backfill: completed shipments (status='delivered' or terminal-ish)
-- should have received_box_count = box_count for historical accuracy.
-- Defensive UPDATE — only touches rows where received is still 0
-- (so re-running migration never overwrites manual edits).
update public.cargo_shipments
   set received_box_count = box_count
 where received_box_count = 0
   and status in ('arrived_th','unloaded','out_for_delivery','delivered');
