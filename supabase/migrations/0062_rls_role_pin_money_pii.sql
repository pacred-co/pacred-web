-- ════════════════════════════════════════════════════════════
-- 0062 · W-1 SECURITY KEYSTONE — role-pin money/PII/order RLS
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/PACRED-MASTER-STRATEGY.md §1 (Fix A) +
--         docs/research/gap-schema-security.md S-1 / G-6.
--
-- ── THE HOLE (S-1) ──────────────────────────────────────────
-- Migration 0033 extended admins.role with two LOW-TRUST roles
-- ('warehouse', 'driver') — scan staff + truck drivers. But every
-- admin-write override in 0015_admin_rbac.sql is
--   for all using (public.is_admin()) with check (public.is_admin())
-- — BARE is_admin(), no role array. is_admin(null) returns true for
-- ANY active admin. So a 'driver'/'warehouse' login, hitting PostgREST
-- directly with its own anon-key JWT (no server action needed), can:
--   • UPDATE public.wallet SET balance = 9999999  (any customer)
--   • INSERT public.wallet_transactions (kind='adjustment',
--     status='completed') → credit itself unlimited money
--   • flip any service_orders / forwarders to 'completed'
--   • rewrite any profiles row (another user's tax_id, credit_limit,
--     sales_admin_id) + read every customer's PII.
-- The app-layer requireAdmin(["ops"]) page guards are irrelevant —
-- the attacker never touches the actions; RLS is the only gate, and
-- bare is_admin() says yes.
--
-- ── THE FIX (S-1 Fix A) ─────────────────────────────────────
-- Every *_admin_all / admin-write policy on a money / PII / order /
-- pricing table is re-pinned to an explicit role array:
--   money       → array['super','accounting','ops']
--   orders      → array['super','ops','accounting']
--   PII         → array['super','ops','accounting','sales_admin']
--   sales money → array['super','accounting','sales_admin']
--   pricing cfg → array['super','ops','accounting']
-- 'super' is always implicitly included by is_admin() itself (the
-- helper short-circuits `role = 'super'`), so the arrays need not
-- list it — but we list it anyway for grep-ability / intent clarity.
--
-- warehouse/driver KEEP access only where they genuinely need it —
-- the cargo_* spine (0033) and legacy `containers` ops tracking — so
-- those policies are NOT locked out here. Migration 0033's cargo_*
-- policies are already correctly role-pinned and untouched.
--
-- Later migrations (0034 tax_invoices, 0036 carriers, 0038 cost-adj,
-- 0044 WHT, 0045-0052 freight) ALREADY role-pin their admin policies
-- — verified, nothing to fix there.
--
-- ── BACKSTOP (G-6) ──────────────────────────────────────────
-- §3 below adds a DB-level trigger that logs every INSERT/UPDATE on
-- wallet_transactions to admin_audit_log — so even the direct-PostgREST
-- exploit path above leaves an attribution row. logAdminAction() in
-- actions/admin/* structurally cannot catch a non-action write.
--
-- Idempotent: every policy is drop-if-exists + recreate; the trigger
-- is drop-if-exists + recreate; the function is create-or-replace.
-- RLS-aware: only re-pins existing policies, adds no new grants, never
-- widens access. Safe to apply on prod live, zero data migration.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 1. Role-pin the bare is_admin() policies from 0015 + 0016 + 0030
-- ════════════════════════════════════════════════════════════
-- Each block: drop the bare-is_admin() policy, recreate role-pinned.
-- The customer self-owned policies on each table are NOT touched —
-- PostgREST OR-combines same-action policies, so customers keep their
-- own-row access and admins get the (now role-gated) override.

-- ── PII tables — profiles / corporate / addresses ──
-- super + ops (operations need customer records) + accounting
-- (billing) + sales_admin (rep assignment). NOT warehouse/driver.
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

drop policy if exists "corporate_admin_all" on public.corporate;
create policy "corporate_admin_all" on public.corporate
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

drop policy if exists "addresses_admin_all" on public.addresses;
create policy "addresses_admin_all" on public.addresses
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

-- ── Money tables — wallet / wallet_transactions / yuan_payments ──
-- super + accounting + ops. NOT warehouse/driver/sales_admin.
-- This is the keystone — it closes the "driver credits its own
-- wallet via PostgREST" exploit.
drop policy if exists "wallet_admin_all" on public.wallet;
create policy "wallet_admin_all" on public.wallet
  for all
  using      (public.is_admin(array['super','accounting','ops']))
  with check (public.is_admin(array['super','accounting','ops']));

drop policy if exists "wallet_tx_admin_all" on public.wallet_transactions;
create policy "wallet_tx_admin_all" on public.wallet_transactions
  for all
  using      (public.is_admin(array['super','accounting','ops']))
  with check (public.is_admin(array['super','accounting','ops']));

drop policy if exists "yuan_payments_admin_all" on public.yuan_payments;
create policy "yuan_payments_admin_all" on public.yuan_payments
  for all
  using      (public.is_admin(array['super','accounting','ops']))
  with check (public.is_admin(array['super','accounting','ops']));

-- ── Order tables — forwarders + items/images/status_log ──
-- super + ops (run the orders) + accounting (bill them).
drop policy if exists "forwarders_admin_all" on public.forwarders;
create policy "forwarders_admin_all" on public.forwarders
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "forwarder_items_admin_all" on public.forwarder_items;
create policy "forwarder_items_admin_all" on public.forwarder_items
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "forwarder_images_admin_all" on public.forwarder_images;
create policy "forwarder_images_admin_all" on public.forwarder_images
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "forwarder_status_log_admin_all" on public.forwarder_status_log;
create policy "forwarder_status_log_admin_all" on public.forwarder_status_log
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- ── Order tables — service_orders + items + cart_items ──
drop policy if exists "service_orders_admin_all" on public.service_orders;
create policy "service_orders_admin_all" on public.service_orders
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "service_order_items_admin_all" on public.service_order_items;
create policy "service_order_items_admin_all" on public.service_order_items
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- cart_items had only an admin SELECT policy (not "for all").
drop policy if exists "cart_items_admin_select" on public.cart_items;
create policy "cart_items_admin_select" on public.cart_items
  for select using (public.is_admin(array['super','ops','accounting']));

-- ── Sales money — team_leaders / sales_commissions / sales_payouts ──
-- super + accounting (pays the commissions) + sales_admin (manages
-- the sales org). NOT ops/warehouse/driver.
drop policy if exists "team_leaders_admin_all" on public.team_leaders;
create policy "team_leaders_admin_all" on public.team_leaders
  for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

drop policy if exists "sales_commissions_admin_all" on public.sales_commissions;
create policy "sales_commissions_admin_all" on public.sales_commissions
  for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

drop policy if exists "sales_payouts_admin_all" on public.sales_payouts;
create policy "sales_payouts_admin_all" on public.sales_payouts
  for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

-- ── Pricing config — promotions / customer_groups / settings / rates ──
-- These define what customers PAY — a low-trust role rewriting a rate
-- or a promo IS a money-impact write. super + ops + accounting.
drop policy if exists "promotions_admin_all" on public.promotions;
create policy "promotions_admin_all" on public.promotions
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "customer_groups_admin_all" on public.customer_groups;
create policy "customer_groups_admin_all" on public.customer_groups
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "settings_admin_all" on public.settings;
create policy "settings_admin_all" on public.settings
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_general_admin_all" on public.rate_general;
create policy "rate_general_admin_all" on public.rate_general
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_vip_admin_all" on public.rate_vip;
create policy "rate_vip_admin_all" on public.rate_vip
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_custom_user_admin_all" on public.rate_custom_user;
create policy "rate_custom_user_admin_all" on public.rate_custom_user
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_custom_hs_admin_all" on public.rate_custom_hs;
create policy "rate_custom_hs_admin_all" on public.rate_custom_hs
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- ── Notifications — admin can write a notification to any customer ──
-- Not money, but a customer-facing write surface. Pin to the roles
-- that legitimately notify customers; exclude warehouse/driver.
drop policy if exists "notifications_admin_all" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

-- ── admin_audit_log — the audit trail must not be readable by the
--    low-trust roles (knowing what is/isn't logged aids an attacker).
drop policy if exists "admin_audit_log_select" on public.admin_audit_log;
create policy "admin_audit_log_select" on public.admin_audit_log
  for select using (public.is_admin(array['super','accounting','ops']));

-- ── 0016 legacy `containers` (ops tracking) — order-adjacent.
-- warehouse genuinely needs this (it is the legacy ops-tracking
-- table — container_no / vessel / status). Keep warehouse; add
-- ops + super. Drop the bare driver/accounting/sales_admin reach.
drop policy if exists "containers_admin_all" on public.containers;
create policy "containers_admin_all" on public.containers
  for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- ── 0030 container_hs_lines — HS-code customs lines on a container.
-- Customs declaration data tied to orders → super + ops + accounting.
drop policy if exists container_hs_lines_admin_all on public.container_hs_lines;
create policy container_hs_lines_admin_all on public.container_hs_lines
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- NOTE — DELIBERATELY LEFT as bare is_admin() (not money/PII-customer,
-- or genuinely all-admin internal tooling; locking them adds no
-- security and risks breaking a role that needs them):
--   0016 admin_contact_extras / dashboard_banners — internal admin +
--        marketing config (no customer money/PII).
--   0019/0020/0021 HR tables (job_postings, job_applicants,
--        attendance_logs, leave_requests, training_*, policies,
--        employee_audit_entries) — staff HR data; a separate concern,
--        gated by the HR admin surface, no customer money/PII.
--   0022 contact_messages — public contact-form inbox.
--   0028 forwarder_driver — driver run assignment; the driver role
--        legitimately needs this (it is literally the driver's table).
--   0029 csv_imports / 0030 hs_codes — internal import tooling +
--        HS-code reference data.

-- ════════════════════════════════════════════════════════════
-- 2. is_admin() — no change needed
-- ════════════════════════════════════════════════════════════
-- The helper is correct as written (0015): is_admin(text[]) returns
-- true when the caller holds 'super' OR any role in the passed array.
-- The bug was never the function — it was 0015 calling it with no
-- argument on write policies. §1 above fixes every such call site.

-- ════════════════════════════════════════════════════════════
-- 3. G-6 BACKSTOP — DB-level money-mutation audit trigger
-- ════════════════════════════════════════════════════════════
-- admin_audit_log is written ONLY by logAdminAction() inside
-- actions/admin/*. A direct createAdminClient() / PostgREST write
-- (exactly the S-1 exploit path) leaves zero audit rows. This trigger
-- records every INSERT/UPDATE on wallet_transactions REGARDLESS of
-- code path — the authoritative DB-level money trail.
--
-- It reuses the existing admin_audit_log table (0015). Shape mapping:
--   admin_id    — admin_audit_log.admin_id is NOT NULL + FK→profiles
--                 ON DELETE RESTRICT. A trigger has no guaranteed
--                 admin actor (auth.uid() can be a customer doing a
--                 self-serve wallet insert, or NULL for service-role).
--                 We resolve it to: auth.uid() if that uid exists in
--                 profiles, else the row's own profile_id (which is a
--                 valid profiles FK by wallet_transactions' own
--                 constraint). This satisfies NOT NULL + the FK while
--                 still recording WHO acted in the payload.
--   action      — 'wallet_tx.insert' | 'wallet_tx.update'
--   target_type — 'wallet_transaction'
--   target_id   — the wallet_transactions.id
--   payload     — actor uid, the txn's profile_id, kind, status,
--                 amount, bucket, reference, and (for UPDATE) the
--                 before-snapshot of the money-bearing columns.
--
-- SECURITY DEFINER so the insert into admin_audit_log succeeds even
-- when the triggering write came from a low-privilege session.
create or replace function public.audit_wallet_transaction()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  actor_uid  uuid := auth.uid();
  log_admin  uuid;
  payload    jsonb;
begin
  -- Resolve a non-null, FK-valid admin_id. Prefer the acting uid;
  -- fall back to the txn's own profile_id (always a valid profiles
  -- row per wallet_transactions.profile_id's FK).
  if actor_uid is not null
     and exists (select 1 from public.profiles p where p.id = actor_uid) then
    log_admin := actor_uid;
  else
    log_admin := new.profile_id;
  end if;

  payload := jsonb_build_object(
    'actor_uid',      actor_uid,                       -- null = service-role / cron
    'tx_profile_id',  new.profile_id,
    'kind',           new.kind,
    'bucket',         new.bucket,
    'status',         new.status,
    'amount',         new.amount,
    'reference_type', new.reference_type,
    'reference_id',   new.reference_id,
    'via',            'db_trigger'                     -- distinguishes from logAdminAction rows
  );

  if tg_op = 'UPDATE' then
    -- Capture the before-image of the money-bearing columns so a
    -- silent status flip / amount edit is reconstructable.
    payload := payload || jsonb_build_object(
      'before', jsonb_build_object(
        'status', old.status,
        'amount', old.amount,
        'kind',   old.kind,
        'bucket', old.bucket
      )
    );
  end if;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
  values (
    log_admin,
    'wallet_tx.' || lower(tg_op),                      -- wallet_tx.insert | wallet_tx.update
    'wallet_transaction',
    new.id::text,
    payload
  );

  return null;  -- after-trigger; return value ignored
end;
$$;

comment on function public.audit_wallet_transaction() is
  '0062/G-6 — DB-level money-mutation audit. Logs every INSERT/UPDATE on wallet_transactions to admin_audit_log regardless of code path, so a direct PostgREST/createAdminClient write (the S-1 exploit path) still leaves an attribution row. logAdminAction() in actions/admin/* cannot catch non-action writes; this can. SECURITY DEFINER so the audit insert succeeds for low-privilege sessions.';

drop trigger if exists wallet_tx_audit_trigger on public.wallet_transactions;
create trigger wallet_tx_audit_trigger
  after insert or update on public.wallet_transactions
  for each row execute function public.audit_wallet_transaction();
