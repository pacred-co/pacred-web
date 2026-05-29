-- ════════════════════════════════════════════════════════════════
-- 0125 — Customer usage split: "ใช้งานแล้ว" vs "ยังไม่ได้ใช้งาน"
--        becomes ORDER-BASED, not userActive-flag-based.
-- เดฟ · 2026-05-30 · owner directive.
-- ════════════════════════════════════════════════════════════════
-- Problem: the /admin dashboard classified customers by tb_users.userActive
-- ('1' = used, ≠'1' = not used). But `approveCustomer` flips userActive→'1'
-- at APPROVAL — so a just-approved customer (who has never placed a single
-- shipment) wrongly counted as "ใช้งานแล้ว". The owner wants the legacy
-- meaning restored (legacy recently-used-imported-customers/home.php:
--   "ต้องเคยใช้งานระบบมาก่อนแล้ว หมายถึงเคยชำระเงินบริการใดบริการหนึ่งมาก่อน"
-- = "used" means has actually placed/paid for a service/shipment).
--
-- Fix: classify by ACTUAL orders, not the flag —
--   used   = customer (not deleted) with ≥1 row in tb_forwarder OR tb_header_order
--   unused = approved customer (not deleted, userActive≠'0') with 0 orders
-- `approveCustomer` is left UNCHANGED (userActive='1' now means "approved
-- account", and usage is derived from orders) — so an approved-but-no-order
-- customer auto-appears in "ยังไม่ได้ใช้งาน" and graduates to "ใช้งานแล้ว"
-- the moment their first shipment lands. Self-correcting, no flag-flip hook.
--
-- NOTE casing (verified on prod 2026-05-30): tb_users is camelCase-quoted
-- ("userID"/"userActive"/"userStatus"); tb_forwarder + tb_header_order are
-- LOWERCASE (userid) — camelCase batch 2b is deferred. Hence the mixed
-- quoting below — do NOT "normalise" it or the joins break.
--
-- Idempotent: create-or-replace + create-index-if-not-exists.
-- ════════════════════════════════════════════════════════════════

-- Speed the per-customer EXISTS lookups (no-op if already present).
create index if not exists idx_tb_forwarder_userid    on public.tb_forwarder (userid);
create index if not exists idx_tb_header_order_userid  on public.tb_header_order (userid);

-- ── Counts for the dashboard cards ──────────────────────────────
create or replace function public.get_customer_usage_counts()
returns table(used bigint, unused bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.tb_users u
       where coalesce(u."userStatus", '1') <> '0'
         and (exists (select 1 from public.tb_forwarder   f where f.userid = u."userID")
           or exists (select 1 from public.tb_header_order h where h.userid = u."userID"))
    )::bigint as used,
    (select count(*) from public.tb_users u
       where coalesce(u."userStatus", '1') <> '0'
         and coalesce(u."userActive", '') <> '0'
         and not exists (select 1 from public.tb_forwarder   f where f.userid = u."userID")
         and not exists (select 1 from public.tb_header_order h where h.userid = u."userID")
    )::bigint as unused;
$$;

-- ── Row list for the "ลูกค้าที่ยังไม่ได้ใช้งาน" dashboard tab ────
-- Returns approved customers (not deleted, not pending) with zero orders,
-- newest registration first. Capped 1..200.
create or replace function public.list_unused_customers(p_limit int default 50)
returns setof public.tb_users
language sql
stable
security definer
set search_path = public
as $$
  select u.*
    from public.tb_users u
   where coalesce(u."userStatus", '1') <> '0'
     and coalesce(u."userActive", '') <> '0'
     and not exists (select 1 from public.tb_forwarder   f where f.userid = u."userID")
     and not exists (select 1 from public.tb_header_order h where h.userid = u."userID")
   order by u."userRegistered" desc nulls last
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- Lock down: these SECURITY DEFINER functions return customer PII — only the
-- service-role (admin server client) may call them, never anon/authenticated.
revoke execute on function public.get_customer_usage_counts()      from public;
revoke execute on function public.list_unused_customers(int)       from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.get_customer_usage_counts() from anon';
    execute 'revoke execute on function public.list_unused_customers(int) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.get_customer_usage_counts() from authenticated';
    execute 'revoke execute on function public.list_unused_customers(int) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.get_customer_usage_counts() to service_role';
    execute 'grant execute on function public.list_unused_customers(int) to service_role';
  end if;
end $$;
