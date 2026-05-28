-- ════════════════════════════════════════════════════════════
-- 0092 · Forwarder >10%-over-preview customer RE-CONFIRM gate
-- ════════════════════════════════════════════════════════════
-- Source:
--   docs/audit/pcs-business-flow-2026-05-20.md §3 (Priority 2 — 🔴)
--   BUSINESS_FLOW.md L85-87 (verbatim ops rule):
--     "[ถ้าราคาเพิ่มเกิน 10%] แจ้งลูกค้ายืนยัน"
--
-- ── The hole ────────────────────────────────────────────────
-- Pacred bills silently whenever admin adds a forwarder_cost_adjustments
-- row (0038) — surprise-billing the customer wallet without consent.
-- Per the legacy PCS rule, when ACTUAL forwarding cost (preview total +
-- cumulative adjustments) exceeds the PREVIEW total by >10%, the system
-- MUST pause the bill and force the customer to RE-CONFIRM before
-- debiting. This is the H6 hand-off in pcs-business-flow §4.
--
-- ── This migration ──────────────────────────────────────────
-- Additive extension of `forwarder_cost_adjustments` (0038):
--
--   1) status check now includes 'pending_reconfirm' — the new gated
--      state between 'unpaid' and 'paid'. Admin still inserts as 'unpaid'
--      by default; the application layer flips to 'pending_reconfirm'
--      atomically when the >10% gate trips. Customer decision moves
--      'pending_reconfirm' → 'unpaid' (accept → admin can then mark paid)
--      or stays 'pending_reconfirm' until ops opens a work_item dispute.
--
--   2) 5 new columns capture the gate context + customer decision:
--        preview_total_thb       — the forwarders.total_price snapshot
--                                  AT the time the gate fired (NOT a
--                                  live join — must survive a later
--                                  admin price_update)
--        cumulative_after_thb    — preview + all paid/unpaid/pending
--                                  adjustments after this row (the
--                                  "actual" the customer must accept)
--        reconfirm_required_at   — timestamp the gate fired
--        customer_decision       — null | 'accept' | 'dispute'
--                                  (when set, the customer has decided)
--        customer_decision_at    — timestamp the customer pressed
--
--   3) RLS — extend the existing customer-self-read policy with a
--      narrow UPDATE policy: customer may flip THEIR OWN row from
--      status='pending_reconfirm' → 'unpaid' (accept) only AND only
--      after setting customer_decision='accept' + decision_at. The
--      'dispute' decision goes through a Server Action (creates a
--      work_item + leaves the adjustment pending) so the customer's
--      direct write surface is minimised. NOTE: the customer write
--      path actually uses createAdminClient + assertOwnsRecord per
--      the W-1/S-2 pattern (see actions/forwarder.ts), so the RLS
--      UPDATE policy is defence-in-depth — not the primary gate.
--
--   4) business_config seed: `forwarder.reprice_threshold_pct` = 10
--      (admin can tune via /admin/settings/business-config without
--      a redeploy — same pattern as 0076's other admin constants).
--
-- ── Idempotent ──────────────────────────────────────────────
-- The whole file is re-runnable: ALTER ... DROP CONSTRAINT IF EXISTS;
-- ADD CONSTRAINT; ADD COLUMN IF NOT EXISTS; CREATE POLICY DROP-then-
-- CREATE; INSERT ... ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════

-- 1) Extend status enum: add 'pending_reconfirm' between 'unpaid' and
--    'paid'. Drop the old CHECK, recreate with the 4-value set.
alter table public.forwarder_cost_adjustments
  drop constraint if exists forwarder_cost_adjustments_status_check;

alter table public.forwarder_cost_adjustments
  add constraint forwarder_cost_adjustments_status_check
  check (status in ('unpaid','pending_reconfirm','paid','cancelled'));

comment on column public.forwarder_cost_adjustments.status is
  '0038 + 0092 — unpaid (default new) | pending_reconfirm (>10% gate triggered, waiting on customer) | paid (wallet debited) | cancelled. Customer decides via /service-import/[fNo]: accept → flip to unpaid (admin then bills); dispute → stays pending_reconfirm + ops work_item created.';

-- 2) Gate context columns (all nullable — only populated when the gate
--    fires; pre-existing rows stay all-NULL which is correct).
alter table public.forwarder_cost_adjustments
  add column if not exists preview_total_thb     numeric(12,2);
alter table public.forwarder_cost_adjustments
  add column if not exists cumulative_after_thb  numeric(12,2);
alter table public.forwarder_cost_adjustments
  add column if not exists reconfirm_required_at timestamptz;
alter table public.forwarder_cost_adjustments
  add column if not exists customer_decision     text;
alter table public.forwarder_cost_adjustments
  add column if not exists customer_decision_at  timestamptz;

comment on column public.forwarder_cost_adjustments.preview_total_thb is
  '0092 — snapshot of forwarders.total_price AT the moment the >10% reconfirm gate fired. NOT a live join — survives later admin price_update edits so the customer always sees the same "ราคาประเมินตอนสั่ง" they would expect.';
comment on column public.forwarder_cost_adjustments.cumulative_after_thb is
  '0092 — preview_total_thb + SUM(all non-cancelled adjustments up to AND INCLUDING this one). This is the "ราคาจริง" number shown to the customer.';
comment on column public.forwarder_cost_adjustments.reconfirm_required_at is
  '0092 — timestamp the >10% gate fired and put this row into pending_reconfirm.';
comment on column public.forwarder_cost_adjustments.customer_decision is
  '0092 — null while waiting | ''accept'' (customer approved billing — flips status to unpaid) | ''dispute'' (customer wants review — work_item opened for ops, row stays pending_reconfirm).';
comment on column public.forwarder_cost_adjustments.customer_decision_at is
  '0092 — timestamp the customer pressed accept or dispute.';

-- 3) Defensive check: customer_decision values + symmetry with timestamp
alter table public.forwarder_cost_adjustments
  drop constraint if exists fwd_cost_adj_decision_check;
alter table public.forwarder_cost_adjustments
  add constraint fwd_cost_adj_decision_check check (
    customer_decision is null
    or customer_decision in ('accept','dispute')
  );

alter table public.forwarder_cost_adjustments
  drop constraint if exists fwd_cost_adj_decision_timestamp_check;
alter table public.forwarder_cost_adjustments
  add constraint fwd_cost_adj_decision_timestamp_check check (
    (customer_decision is null and customer_decision_at is null)
    or (customer_decision is not null and customer_decision_at is not null)
  );

-- 4) Index to find pending_reconfirm rows fast on the customer detail
--    page (per-forwarder query) and on a future ops "stuck reconfirms"
--    dashboard (status partial index).
create index if not exists fwd_cost_adj_pending_reconfirm_idx
  on public.forwarder_cost_adjustments(forwarder_id, status)
  where status = 'pending_reconfirm';

-- 5) RLS — narrow customer UPDATE for the accept path (defence in depth;
--    the Server Action is the primary gate). Customer may update their
--    own row, but ONLY:
--     - when current status='pending_reconfirm'
--     - flipping it to status='unpaid' (accept) and stamping the decision
--     - touching only the customer_decision + decision_at + status fields
--   The "touch only" part is enforced at the action layer; RLS only
--   restricts WHO and WHICH ROWS.
drop policy if exists fwd_cost_adj_customer_decide on public.forwarder_cost_adjustments;
create policy fwd_cost_adj_customer_decide
  on public.forwarder_cost_adjustments for update
  using      (profile_id = auth.uid() and status = 'pending_reconfirm')
  with check (profile_id = auth.uid() and status in ('pending_reconfirm','unpaid'));

-- 6) Seed the tunable threshold in business_config (admin can change via
--    /admin/settings/business-config — 0076). 10% per BUSINESS_FLOW.md L85.
--    Idempotent — ON CONFLICT DO NOTHING leaves any admin-tuned value alone.
insert into public.business_config (key, value, value_type, category, description)
values (
  'forwarder.reprice_threshold_pct',
  to_jsonb(10),
  'percent',
  'forwarder',
  'Percent over preview total at which the actual cost forces a customer re-confirm (BUSINESS_FLOW.md L85 — legacy PCS rule). Default 10. Set to a higher number to relax the gate during a sprint; do not set below 5 or staff will be re-confirming every adjustment.'
)
on conflict (key) do nothing;

-- 7) Verify
do $$
declare
  status_check_def text;
  policy_count    int;
begin
  -- Status enum was extended
  select pg_get_constraintdef(c.oid) into status_check_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'forwarder_cost_adjustments'
      and c.conname = 'forwarder_cost_adjustments_status_check';
  if status_check_def is null
     or position('pending_reconfirm' in status_check_def) = 0 then
    raise warning '0092 — status check did not extend with pending_reconfirm: %', status_check_def;
  else
    raise notice '0092 — status check extended OK: %', status_check_def;
  end if;

  -- Customer UPDATE policy installed
  select count(*) into policy_count
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'forwarder_cost_adjustments'
      and policyname = 'fwd_cost_adj_customer_decide';
  if policy_count <> 1 then
    raise warning '0092 — customer decide policy expected 1, found %', policy_count;
  else
    raise notice '0092 — customer decide RLS policy installed';
  end if;
end $$;
