-- 0272 — widen the product-text / product-link columns 300 → 1000
--
-- 🔴 owner 2026-07-22: "แก้ไขให้หน่อยไม่สามารถกดสั่งในระบบได้ · ปรับขนาด database
-- จาก 300 เป็น 1000 หรือยังไงก็ได้ ให้มันตรงชื่อเวลากดสั่งอะครับ"
--
-- WHAT BROKE: the staff link-paste add-to-cart (/admin/service-orders/cart/add)
-- stores the pasted product URL verbatim in `tb_cart.curl`. A 1688 offer opened
-- from a search result carries spm / offerId / sortType / hotSaleSkuId /
-- trace_log / uuid / forcePC plus a percent-encoded Chinese `keywords=` — a real
-- one measures 401 characters. `curl` was varchar(300), and the matching zod cap
-- refused the value with an untranslated default that the operator saw raw.
--
-- PROD EVIDENCE (survivorship fingerprint on tb_order.curl, rows with query
-- params): 87 under 100 chars · 41 in 100-199 · 100 in 200-249 · 37 in 250-289 ·
-- ZERO in 290-300 · ZERO above. Everything longer was rejected, always.
--
-- WHY THE WHOLE CHAIN, NOT JUST tb_cart: submitCartOrder copies a cart row into
-- tb_order, then rolls the FIRST row up onto the header —
-- `htitle := ctitle`, `hcover := cimages` (actions/cart.ts) — and
-- adminUpdateCartItemImage syncs `tb_forwarder.fcover := cimages`. Widening only
-- the cart would move the same failure from "เพิ่มในรถเข็น" to "กดสั่ง". The
-- lockstep set below is the full path a product name / image actually travels.
--
-- SAFETY: widening varchar(n) → varchar(m) where m > n is a catalog-only change
-- in Postgres (no table rewrite, no data touched, no re-index). Verified against
-- prod before writing: these columns carry NO dependent view, NO check
-- constraint and NO index. Idempotent — re-running is a no-op.
--
-- ONE DEPENDENCY, HANDLED: `trg_advance_shop_on_order_link` (the mig-0234/0235
-- ฝากสั่งซื้อ multi-ร้าน status trigger) lists `cnameshop, ctitle` in its
-- `UPDATE OF` column list, and Postgres refuses to retype a column a trigger
-- names (0A000). A prod dry-run inside a rolled-back transaction caught this
-- before it ever ran for real. It is dropped and recreated VERBATIM in the same
-- transaction as the ALTERs, so the status trigger is never absent for a single
-- committed moment — the same DROP+recreate envelope migrations 0185 and 0196
-- used for the view that depended on the columns they widened.
--
-- NOT widened on purpose:
--   tb_cart/tb_order .ccolor .csize   varchar(200) — real max in prod is far below
--   tb_forwarder_item.productname     varchar(255) — fed by MOMO/CargoThai/manual
--                                     entry, never by the cart chain
--   tb_forwarder_jmf_tmp / tb_tmp_*   partner-import staging, outside this path

begin;

-- The trigger names ctitle/cnameshop in its UPDATE OF list → must stand aside
-- for the retype. Recreated verbatim at the bottom of this same transaction.
drop trigger if exists trg_advance_shop_on_order_link on public.tb_order;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('tb_cart',         'ctitle'),
      ('tb_cart',         'cnameshop'),
      ('tb_cart',         'curl'),
      ('tb_cart',         'cimages'),
      ('tb_order',        'ctitle'),
      ('tb_order',        'cnameshop'),
      ('tb_order',        'curl'),
      ('tb_order',        'cimages'),
      -- rolled up from the first cart row at order-submit (actions/cart.ts)
      ('tb_header_order', 'htitle'),
      ('tb_header_order', 'hcover'),
      -- synced from tb_order.cimages (actions/admin/service-orders-line-edits.ts)
      ('tb_forwarder',    'fcover')
    ) as v(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = t.tbl
        and column_name  = t.col
        and character_maximum_length is not null
        and character_maximum_length < 1000
    ) then
      execute format(
        'alter table public.%I alter column %I type varchar(1000)',
        t.tbl, t.col
      );
    end if;
  end loop;
end $$;

-- Verbatim restore (pg_get_triggerdef output, migration 0234/0235).
create trigger trg_advance_shop_on_order_link
  after insert or delete or update of ctrackingnumber, hno, userid, cnameshop, ctitle
  on public.tb_order
  for each row execute function advance_shop_order_on_order_link();

commit;
