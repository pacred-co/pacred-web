-- ════════════════════════════════════════════════════════════
-- Phase G2 — Admin RBAC + helper + admin-write RLS overrides
-- ════════════════════════════════════════════════════════════
-- See docs/decisions/0002-admin-architecture.md for the full design.
--
-- Legacy tb_admin had 40+ columns mixing identity (companyType,
-- department, section) with admin-specific data. We split:
--   admins                 — minimal (profile_id, role)
--   admin_audit_log        — audit trail for status mutations
--
-- Roles (codes used by is_admin / app-layer guards):
--   super         — full access
--   ops           — forwarder / service-order operations
--   accounting    — wallet / yuan / payouts
--   sales_admin   — sales payouts + team_leaders
-- ════════════════════════════════════════════════════════════

create table if not exists public.admins (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('super','ops','accounting','sales_admin')),
  granted_at   timestamptz not null default now(),
  granted_by   uuid references public.profiles(id) on delete set null,
  is_active    boolean not null default true,
  primary key (profile_id, role)
);

create index if not exists admins_role_idx on public.admins(role) where is_active = true;

-- ── is_admin() helper ──
-- SECURITY DEFINER so RLS on `admins` can't recurse when policies on
-- other tables call it. search_path locked to public so it can't be
-- subverted by a session-level setting.
create or replace function public.is_admin(any_role text[] default null)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  ok boolean;
begin
  select exists (
    select 1 from public.admins
     where profile_id = auth.uid()
       and is_active  = true
       and (any_role is null or role = any(any_role) or role = 'super')
  ) into ok;
  return coalesce(ok, false);
end;
$$;

revoke all on function public.is_admin(text[]) from public;
grant execute on function public.is_admin(text[]) to anon, authenticated;

-- ── admin_audit_log (status change history) ──
create table if not exists public.admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.profiles(id) on delete restrict,
  action          text not null,                                -- 'forwarder.status_set' | 'wallet.deposit_approved' | etc
  target_type     text not null,                                -- 'forwarder' | 'service_order' | 'wallet_transaction' | ...
  target_id       text not null,                                -- text to accept slugs or uuids
  payload         jsonb,                                        -- arbitrary context
  created_at      timestamptz not null default now()
);

create index if not exists admin_audit_log_admin_idx
  on public.admin_audit_log(admin_id, created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log(target_type, target_id);

-- ════════════════════════════════════════════════════════════
-- RLS on admins table itself
-- ════════════════════════════════════════════════════════════
alter table public.admins enable row level security;

-- An admin can see own role row(s); super can see all
drop policy if exists "admins_select" on public.admins;
create policy "admins_select" on public.admins
  for select using (
    profile_id = auth.uid() or public.is_admin(array['super'])
  );

-- Only 'super' can grant/revoke admin roles (via service-role from app)
-- We don't add INSERT/UPDATE/DELETE policies — those operations go
-- through the service-role admin client, which bypasses RLS.

-- audit_log: any admin can write (via service-role) + read own
alter table public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_log_select" on public.admin_audit_log;
create policy "admin_audit_log_select" on public.admin_audit_log
  for select using (public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Admin-write overrides on customer-side tables
-- ════════════════════════════════════════════════════════════
-- The pattern: existing customer policies stay untouched (they grant
-- self-owned access). We ADD a "for all" policy guarded by is_admin()
-- so admins can read/write any row. PostgREST evaluates policies of
-- the same action with OR, so customer keeps own access AND admin
-- gets everything.

-- profiles (admin sees + edits any)
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- corporate
drop policy if exists "corporate_admin_all" on public.corporate;
create policy "corporate_admin_all" on public.corporate
  for all using (public.is_admin()) with check (public.is_admin());

-- addresses
drop policy if exists "addresses_admin_all" on public.addresses;
create policy "addresses_admin_all" on public.addresses
  for all using (public.is_admin()) with check (public.is_admin());

-- wallet + ledger
drop policy if exists "wallet_admin_all" on public.wallet;
create policy "wallet_admin_all" on public.wallet
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "wallet_tx_admin_all" on public.wallet_transactions;
create policy "wallet_tx_admin_all" on public.wallet_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- yuan_payments
drop policy if exists "yuan_payments_admin_all" on public.yuan_payments;
create policy "yuan_payments_admin_all" on public.yuan_payments
  for all using (public.is_admin()) with check (public.is_admin());

-- forwarders + items + images + status_log
drop policy if exists "forwarders_admin_all" on public.forwarders;
create policy "forwarders_admin_all" on public.forwarders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "forwarder_items_admin_all" on public.forwarder_items;
create policy "forwarder_items_admin_all" on public.forwarder_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "forwarder_images_admin_all" on public.forwarder_images;
create policy "forwarder_images_admin_all" on public.forwarder_images
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "forwarder_status_log_admin_all" on public.forwarder_status_log;
create policy "forwarder_status_log_admin_all" on public.forwarder_status_log
  for all using (public.is_admin()) with check (public.is_admin());

-- cart_items
drop policy if exists "cart_items_admin_select" on public.cart_items;
create policy "cart_items_admin_select" on public.cart_items
  for select using (public.is_admin());

-- service_orders + items
drop policy if exists "service_orders_admin_all" on public.service_orders;
create policy "service_orders_admin_all" on public.service_orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "service_order_items_admin_all" on public.service_order_items;
create policy "service_order_items_admin_all" on public.service_order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- promotions
drop policy if exists "promotions_admin_all" on public.promotions;
create policy "promotions_admin_all" on public.promotions
  for all using (public.is_admin()) with check (public.is_admin());

-- rates + settings + customer_groups
drop policy if exists "customer_groups_admin_all" on public.customer_groups;
create policy "customer_groups_admin_all" on public.customer_groups
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_admin_all" on public.settings;
create policy "settings_admin_all" on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_general_admin_all" on public.rate_general;
create policy "rate_general_admin_all" on public.rate_general
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_vip_admin_all" on public.rate_vip;
create policy "rate_vip_admin_all" on public.rate_vip
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_custom_user_admin_all" on public.rate_custom_user;
create policy "rate_custom_user_admin_all" on public.rate_custom_user
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_custom_hs_admin_all" on public.rate_custom_hs;
create policy "rate_custom_hs_admin_all" on public.rate_custom_hs
  for all using (public.is_admin()) with check (public.is_admin());

-- sales tables
drop policy if exists "team_leaders_admin_all" on public.team_leaders;
create policy "team_leaders_admin_all" on public.team_leaders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sales_commissions_admin_all" on public.sales_commissions;
create policy "sales_commissions_admin_all" on public.sales_commissions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sales_payouts_admin_all" on public.sales_payouts;
create policy "sales_payouts_admin_all" on public.sales_payouts
  for all using (public.is_admin()) with check (public.is_admin());

-- notifications (admin can see + insert any)
drop policy if exists "notifications_admin_all" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());
