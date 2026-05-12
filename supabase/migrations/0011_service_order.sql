-- ════════════════════════════════════════════════════════════
-- Phase E1 — Service-Order (ฝากสั่งซื้อ — cart + header + items)
-- ════════════════════════════════════════════════════════════
-- Customer pastes 1688/Taobao/Tmall URLs (or manually fills items)
-- into a shopping cart, then groups them into one or more service
-- orders. Pacred buys the goods in China, consolidates at the
-- warehouse, and ships to Thailand.
--
-- Cross-checked against legacy code at D:\xampp\htdocs\pcscargo\:
-- - member/cart.php (1211 LOC): addCart + addCartURL flows
-- - member/shops.php (2215 LOC): cart→order placement
-- - member/include/function.php: cProvider enum mapping
-- - 151-item per-user cart cap is in cart.php lines 17, 76
--
-- Legacy enum mappings (now stored as readable strings):
--   cProvider 1/2/3/4/5 → '1688' / 'taobao' / 'tmall' / 'shop' / 'nice'
--   hStatus 1..6 →
--     1=pending              รอดำเนินการ
--     2=awaiting_payment     รอชำระเงิน  (with payment_due_at expiry → auto-cancel to 6)
--     3=ordered              สั่งสินค้า
--     4=awaiting_chn_dispatch รอร้านจีนจัดส่ง
--     5=completed            สำเร็จ
--     6=cancelled            ยกเลิก
--   hWarehouseChina 1/2 → 'yiwu' / 'guangzhou' (note: legacy reversed
--     this from the forwarder mapping; we standardise to match
--     forwarders — 'guangzhou' / 'yiwu')
--   warehouse_name (per-item, admin receives at): 1/2/3/4/5 → 'sang' /
--     'ctt' / 'mk' / 'mx' / 'jmf'
--
-- h_no format: legacy was 'P' + auto-increment id. Pacred uses
-- 'O{YYMMDD}-{seq}' (the 'O' stands for Order, parallel to forwarders'
-- 'F'). Generated via sequence + trigger.
-- ════════════════════════════════════════════════════════════

-- ── cart_items ──
create table if not exists public.cart_items (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  provider     text not null default 'shop'
               check (provider in ('1688','taobao','tmall','shop','nice')),
  shop_name    text not null default 'pacred',           -- legacy default 'pcs' renamed
  url          text,                                      -- product link
  title        text,                                      -- product title
  image_path   text,                                      -- Supabase Storage key (carts bucket)
  color        text,
  size         text,
  price_cny    numeric(12,2) not null check (price_cny >= 0),
  amount       int           not null check (amount > 0),
  details      text,                                      -- buyer's note (size detail, special instruction)

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cart_items_profile_idx
  on public.cart_items(profile_id, created_at desc);

drop trigger if exists cart_items_updated_at_trigger on public.cart_items;
create trigger cart_items_updated_at_trigger
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- Enforce 151-item cap per profile (legacy cart.php hardcoded the same)
create or replace function public.cart_items_cap()
returns trigger as $$
declare
  cnt int;
begin
  if tg_op = 'INSERT' then
    select count(*) into cnt from public.cart_items where profile_id = new.profile_id;
    if cnt >= 151 then
      raise exception 'cart cap reached (151 items)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists cart_items_cap_trigger on public.cart_items;
create trigger cart_items_cap_trigger
  before insert on public.cart_items
  for each row execute function public.cart_items_cap();

-- ── service_orders (header) ──
create sequence if not exists public.service_order_seq;

create or replace function public.generate_service_order_no()
returns trigger as $$
declare
  yymmdd text;
  seq    int;
begin
  if new.h_no is null then
    yymmdd := to_char(current_date, 'YYMMDD');
    seq    := nextval('public.service_order_seq');
    new.h_no := 'O' || yymmdd || '-' || seq::text;
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.service_orders (
  id                    uuid primary key default gen_random_uuid(),
  h_no                  text unique,                                 -- O{YYMMDD}-{seq}
  profile_id            uuid not null references public.profiles(id) on delete cascade,

  status                text not null default 'pending'
                        check (status in (
                          'pending','awaiting_payment','ordered',
                          'awaiting_chn_dispatch','completed','cancelled'
                        )),
  shop_paid             boolean not null default false,              -- legacy hShopPay 1=already paid
  paydeposit_pending    boolean not null default false,              -- legacy paydeposit
  free_shipping         boolean not null default false,              -- ordered during free-shipping promo

  -- header summary
  title                 text,                                         -- legacy hTitle
  cover_image_path      text,                                         -- legacy hCover
  item_count            int    not null default 0,

  -- shipment classification
  warehouse_china       text   check (warehouse_china in ('guangzhou','yiwu')),
  transport_type        text   not null default 'truck'
                        check (transport_type in ('truck','ship','air')),
  ship_by               text,                                         -- 'PCS' / 'PCSF' / partner name
  pay_method            text   not null default 'origin' check (pay_method in ('origin','destination')),
  crate                 boolean not null default false,

  -- pricing — locked at submit
  yuan_rate_locked      numeric(8,4),                                 -- legacy hRate
  yuan_rate_cost        numeric(8,4) not null default 0,              -- admin internal
  subtotal_cny          numeric(12,2) not null default 0,             -- legacy hTotalPriceCHN
  domestic_china_cny    numeric(12,2) not null default 0,             -- legacy hShippingCHN (per-item sum)
  service_fee           numeric(10,2) not null default 50,            -- legacy hShippingService (50 baht)
  forwarder_fee         numeric(10,2) not null default 0,             -- legacy fShippingService for combined ship later
  price_update          numeric(12,2) not null default 0,             -- admin adjustment
  total_thb             numeric(12,2) not null default 0,             -- legacy hTotalPriceUser

  -- admin-internal cost/profit (Phase G)
  cost_all_cny          numeric(12,2),                                -- legacy hCostAll
  cost_all_thb          numeric(12,2),                                -- legacy hCostAllTH

  -- shipping address snapshot
  ship_first_name       text,
  ship_last_name        text,
  ship_phone            text,
  ship_phone2           text,
  ship_address_line     text,
  ship_sub_district     text,
  ship_district         text,
  ship_province         text,
  ship_postal_code      text,
  ship_note             text,

  -- state machine timestamps + payment timer
  date_pending          timestamptz not null default now(),
  date_awaiting_payment timestamptz,                                   -- legacy hDate2
  payment_due_at        timestamptz,                                   -- legacy hDatePayment — auto-cancel after this
  date_ordered          timestamptz,                                   -- legacy hDate3
  date_dispatched       timestamptz,                                   -- legacy hDate4
  date_completed        timestamptz,                                   -- legacy hDate5

  -- admin internals
  admin_id_create       text,
  admin_id_update       text,
  admin_id_interpreter  text,                                          -- legacy adminIDIP (Chinese interpreter)
  locked_until          timestamptz default now(),
  session_id            text,

  -- free-form
  note_admin            text,
  note_user             text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists service_orders_profile_idx
  on public.service_orders(profile_id, created_at desc);
create index if not exists service_orders_status_idx
  on public.service_orders(status, created_at);
create index if not exists service_orders_auto_cancel_idx
  on public.service_orders(payment_due_at)
  where status = 'awaiting_payment';

drop trigger if exists service_orders_h_no_trigger on public.service_orders;
create trigger service_orders_h_no_trigger
  before insert on public.service_orders
  for each row execute function public.generate_service_order_no();

drop trigger if exists service_orders_updated_at_trigger on public.service_orders;
create trigger service_orders_updated_at_trigger
  before update on public.service_orders
  for each row execute function public.set_updated_at();

-- ── service_order_items (line items, copied from cart at submit) ──
create table if not exists public.service_order_items (
  id                   uuid primary key default gen_random_uuid(),
  service_order_id     uuid not null references public.service_orders(id) on delete cascade,

  -- mirror of cart_items shape (snapshotted at order placement so cart
  -- changes don't affect already-submitted orders)
  provider             text not null,
  shop_name            text not null default 'pacred',
  url                  text,
  title                text,
  image_path           text,
  color                text,
  size                 text,
  price_cny            numeric(12,2) not null,
  amount               int           not null,
  details              text,

  -- per-item China-side details (admin fills as items ship)
  domestic_china_cny   numeric(12,2) not null default 0,             -- legacy cShippingCHN
  price_update         numeric(12,2) not null default 0,             -- legacy cPriceUpdate
  shipping_number      text,                                          -- legacy cShippingNumber
  tracking_number      text,                                          -- legacy cTrackingNumber
  warehouse_name       text check (warehouse_name in ('sang','ctt','mk','mx','jmf')),
  re_wallet            boolean not null default false,                -- legacy cReWallet — refunded back to wallet
  crate                boolean not null default false,
  qc                   boolean not null default false,
  note                 text,

  created_at           timestamptz not null default now()
);

create index if not exists service_order_items_order_idx
  on public.service_order_items(service_order_id);
create index if not exists service_order_items_tracking_idx
  on public.service_order_items(tracking_number)
  where tracking_number is not null;

-- Keep service_orders.item_count in sync via trigger
create or replace function public.service_orders_recount_items()
returns trigger as $$
declare
  target_order uuid;
  cnt int;
begin
  target_order := coalesce(new.service_order_id, old.service_order_id);
  select count(*) into cnt from public.service_order_items where service_order_id = target_order;
  update public.service_orders set item_count = cnt where id = target_order;
  return null;
end;
$$ language plpgsql;

drop trigger if exists service_order_items_recount_trigger on public.service_order_items;
create trigger service_order_items_recount_trigger
  after insert or delete on public.service_order_items
  for each row execute function public.service_orders_recount_items();

-- ── promotions (applied to a forwarder or service_order) ──
create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                                          -- e.g. '77' for the 2026-03-04 special
  name        text not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  yuan_rate_override numeric(8,4),                                    -- if set, locks h_rate for orders applying this promo
  free_shipping     boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.promotion_applications (
  id             uuid primary key default gen_random_uuid(),
  promotion_id   uuid not null references public.promotions(id) on delete cascade,
  service_order_id uuid references public.service_orders(id) on delete cascade,
  forwarder_id   uuid references public.forwarders(id) on delete cascade,
  applied_at     timestamptz not null default now(),
  check ((service_order_id is null) <> (forwarder_id is null))  -- exactly one of the two
);

create index if not exists promotion_applications_service_order_idx
  on public.promotion_applications(service_order_id) where service_order_id is not null;

create index if not exists promotion_applications_forwarder_idx
  on public.promotion_applications(forwarder_id) where forwarder_id is not null;

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.cart_items             enable row level security;
alter table public.service_orders         enable row level security;
alter table public.service_order_items    enable row level security;
alter table public.promotions             enable row level security;
alter table public.promotion_applications enable row level security;

-- cart_items: full ownership
drop policy if exists "cart_items_all_own" on public.cart_items;
create policy "cart_items_all_own" on public.cart_items
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- service_orders: select-own; insert-own (status=pending); update-own (status in pending/awaiting_payment)
drop policy if exists "service_orders_select_own" on public.service_orders;
create policy "service_orders_select_own" on public.service_orders
  for select using (auth.uid() = profile_id);

drop policy if exists "service_orders_insert_own" on public.service_orders;
create policy "service_orders_insert_own" on public.service_orders
  for insert with check (
    auth.uid() = profile_id
    and status in ('pending','awaiting_payment')
  );

drop policy if exists "service_orders_update_own_editable" on public.service_orders;
create policy "service_orders_update_own_editable" on public.service_orders
  for update using (
    auth.uid() = profile_id
    and status in ('pending','awaiting_payment')
  ) with check (
    auth.uid() = profile_id
    and status in ('pending','awaiting_payment','cancelled')   -- allow self-cancel by user
  );

-- service_order_items: ownership inferred via parent
drop policy if exists "service_order_items_select_own" on public.service_order_items;
create policy "service_order_items_select_own" on public.service_order_items
  for select using (
    exists (select 1 from public.service_orders so
             where so.id = service_order_id and so.profile_id = auth.uid())
  );

drop policy if exists "service_order_items_write_own_editable" on public.service_order_items;
create policy "service_order_items_write_own_editable" on public.service_order_items
  for all using (
    exists (select 1 from public.service_orders so
             where so.id = service_order_id
               and so.profile_id = auth.uid()
               and so.status in ('pending','awaiting_payment'))
  ) with check (
    exists (select 1 from public.service_orders so
             where so.id = service_order_id
               and so.profile_id = auth.uid()
               and so.status in ('pending','awaiting_payment'))
  );

-- promotions: public read (so frontend can show available promos)
drop policy if exists "promotions_select_active" on public.promotions;
create policy "promotions_select_active" on public.promotions
  for select using (auth.role() = 'authenticated' and is_active = true);

-- promotion_applications: read own
drop policy if exists "promotion_applications_select_own" on public.promotion_applications;
create policy "promotion_applications_select_own" on public.promotion_applications
  for select using (
    (service_order_id is not null and exists (
      select 1 from public.service_orders so
       where so.id = service_order_id and so.profile_id = auth.uid()))
    or
    (forwarder_id is not null and exists (
      select 1 from public.forwarders f
       where f.id = forwarder_id and f.profile_id = auth.uid()))
  );

-- ════════════════════════════════════════════════════════════
-- Storage — 'carts' bucket for cart-item images uploaded by users
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('carts', 'carts', false)
on conflict (id) do nothing;

drop policy if exists "carts_user_select" on storage.objects;
create policy "carts_user_select" on storage.objects
  for select using (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "carts_user_insert" on storage.objects;
create policy "carts_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "carts_user_update" on storage.objects;
create policy "carts_user_update" on storage.objects
  for update using (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "carts_user_delete" on storage.objects;
create policy "carts_user_delete" on storage.objects
  for delete using (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
