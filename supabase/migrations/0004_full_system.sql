-- ════════════════════════════════════════════════════════════
-- Migration 0004 — Full System: Wallet, Shop, Import, Transfer, Freight, Rates
-- Run in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. EXCHANGE RATES — เรทค่าเงิน Yuan รายวัน
-- ─────────────────────────────────────────────────────────────
create table if not exists public.exchange_rates (
  id            uuid primary key default gen_random_uuid(),
  rate_buy      numeric(10,4) not null,   -- เรทรับซื้อ (ลูกค้าโอนเงินให้เรา)
  rate_sell     numeric(10,4) not null,   -- เรทขาย
  rate_transfer numeric(10,4) not null,   -- เรทโอน Yuan ให้ร้านจีน
  rate_sale     numeric(10,4),            -- เรท Sale พิเศษ
  note          text,
  set_by        uuid references public.profiles(id),
  effective_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists exchange_rates_effective_idx on public.exchange_rates(effective_at desc);

-- ─────────────────────────────────────────────────────────────
-- 2. WALLETS — กระเป๋าสตางค์ (1 wallet per profile)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.wallets (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  balance    numeric(15,2) not null default 0 check (balance >= 0),
  currency   text not null default 'THB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallets_profile_id_idx on public.wallets(profile_id);

-- Auto-create wallet when profile is inserted
create or replace function public.create_wallet_for_profile()
returns trigger language plpgsql as $$
begin
  insert into public.wallets (profile_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_create_wallet on public.profiles;
create trigger profiles_create_wallet
  after insert on public.profiles
  for each row execute function public.create_wallet_for_profile();

-- Auto-update updated_at
drop trigger if exists wallets_updated_at on public.wallets;
create trigger wallets_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. WALLET TRANSACTIONS — รายการเงินในกระเป๋า
-- ─────────────────────────────────────────────────────────────
create table if not exists public.wallet_transactions (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.wallets(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('deposit','withdraw','payment','refund','credit','debit')),
  amount       numeric(15,2) not null,          -- บวก=เข้า ลบ=ออก
  balance_after numeric(15,2) not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  reference_type text,                           -- 'shop_order' | 'import_order' | 'transfer_order' | 'withdrawal' | 'manual'
  reference_id  uuid,
  slip_url     text,                             -- หลักฐานการโอน
  note         text,
  approved_by  uuid references public.profiles(id),
  approved_at  timestamptz,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists wallet_tx_profile_idx  on public.wallet_transactions(profile_id, created_at desc);
create index if not exists wallet_tx_status_idx   on public.wallet_transactions(status);
create index if not exists wallet_tx_type_idx     on public.wallet_transactions(type);

-- ─────────────────────────────────────────────────────────────
-- 4. WITHDRAWAL REQUESTS — รายการเบิกเงิน
-- ─────────────────────────────────────────────────────────────
create table if not exists public.withdrawal_requests (
  id              uuid primary key default gen_random_uuid(),
  request_no      text unique,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  amount          numeric(15,2) not null check (amount > 0),
  bank_name       text not null,
  account_number  text not null,
  account_name    text not null,
  status          text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  note            text,
  admin_note      text,
  processed_by    uuid references public.profiles(id),
  processed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create sequence if not exists public.withdrawal_no_seq start with 1;

create or replace function public.generate_withdrawal_no() returns trigger as $$
begin
  if new.request_no is null then
    new.request_no := 'WD' || to_char(now(), 'YYMM') || lpad(nextval('public.withdrawal_no_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists withdrawal_no_trigger on public.withdrawal_requests;
create trigger withdrawal_no_trigger
  before insert on public.withdrawal_requests
  for each row execute function public.generate_withdrawal_no();

-- ─────────────────────────────────────────────────────────────
-- 5. SHOP ORDERS — บริการฝากสั่งสินค้า (1688 / Taobao / Alibaba)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shop_orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          text unique,
  profile_id        uuid not null references public.profiles(id) on delete cascade,

  -- สถานะ
  status            text not null default 'draft' check (status in (
    'draft',          -- ลูกค้ากรอก รอพนักงานตรวจ
    'confirmed',      -- พนักงานยืนยัน รอชำระเงิน
    'paid',           -- ชำระแล้ว รอสั่งซื้อ
    'ordered',        -- สั่งซื้อกับร้านจีนแล้ว
    'china_shipped',  -- ร้านจีนส่งออกแล้ว
    'cn_warehouse',   -- ถึงโกดังจีน
    'shipped_to_th',  -- ส่งออกจากจีน
    'customs',        -- เคลียร์ศุลกากร
    'th_warehouse',   -- ถึงโกดังไทย
    'delivering',     -- กำลังจัดส่ง
    'delivered',      -- ส่งแล้ว
    'cancelled'       -- ยกเลิก
  )),

  -- เงิน
  total_yuan        numeric(12,4) not null default 0,
  rate_used         numeric(10,4),
  shipping_fee_cn   numeric(12,2) default 0,   -- ค่าส่งในจีน
  service_fee       numeric(12,2) default 0,   -- ค่าดำเนินการ
  total_thb         numeric(15,2) default 0,
  paid_amount       numeric(15,2) default 0,

  -- ขนส่ง
  shipping_type     text check (shipping_type in ('sea','air','truck')),
  tracking_cn       text,                       -- เลขติดตามในจีน
  tracking_th       text,                       -- เลขติดตามในไทย

  -- เวลา
  ordered_at        timestamptz,
  cn_shipped_at     timestamptz,
  cn_arrived_at     timestamptz,
  th_shipped_at     timestamptz,
  delivered_at      timestamptz,

  -- อื่นๆ
  delivery_address  text,
  note              text,
  admin_note        text,
  assigned_to       uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create sequence if not exists public.shop_order_no_seq start with 1;

create or replace function public.generate_shop_order_no() returns trigger as $$
begin
  if new.order_no is null then
    new.order_no := 'SO' || to_char(now(), 'YYMM') || lpad(nextval('public.shop_order_no_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists shop_order_no_trigger on public.shop_orders;
create trigger shop_order_no_trigger
  before insert on public.shop_orders
  for each row execute function public.generate_shop_order_no();

drop trigger if exists shop_orders_updated_at on public.shop_orders;
create trigger shop_orders_updated_at
  before update on public.shop_orders
  for each row execute function public.set_updated_at();

create index if not exists shop_orders_profile_idx on public.shop_orders(profile_id, created_at desc);
create index if not exists shop_orders_status_idx  on public.shop_orders(status);
create index if not exists shop_orders_no_idx      on public.shop_orders(order_no);

-- ─────────────────────────────────────────────────────────────
-- 6. SHOP ORDER ITEMS — รายการสินค้าในออเดอร์
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shop_order_items (
  id              uuid primary key default gen_random_uuid(),
  shop_order_id   uuid not null references public.shop_orders(id) on delete cascade,
  product_url     text,
  product_name    text not null,
  sku             text,
  image_url       text,
  quantity        int not null default 1 check (quantity > 0),
  unit_price_yuan numeric(12,4) not null,
  subtotal_yuan   numeric(12,4) generated always as (quantity * unit_price_yuan) stored,
  weight_kg       numeric(8,3),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists shop_items_order_idx on public.shop_order_items(shop_order_id);

-- ─────────────────────────────────────────────────────────────
-- 7. IMPORT ORDERS — บริการฝากนำเข้า (ส่งสินค้าจากจีนมาไทย)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.import_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text unique,
  profile_id       uuid not null references public.profiles(id) on delete cascade,

  status           text not null default 'draft' check (status in (
    'draft', 'confirmed', 'cn_received', 'in_transit', 'customs', 'th_warehouse', 'delivering', 'delivered', 'cancelled'
  )),

  -- ประเภทขนส่ง
  shipping_type    text not null check (shipping_type in ('sea_lcl','sea_fcl','air','truck')),
  route            text,                          -- เส้นทาง เช่น กวางเจา-กรุงเทพ

  -- ขนาด/น้ำหนัก
  pieces           int default 0,
  weight_kg        numeric(10,3) default 0,
  cbm              numeric(10,4) default 0,

  -- ราคา
  rate_type        text check (rate_type in ('per_kg','per_cbm','per_piece')),
  rate_value       numeric(10,2),
  shipping_cost    numeric(15,2) default 0,
  customs_fee      numeric(15,2) default 0,
  other_fee        numeric(15,2) default 0,
  total_cost       numeric(15,2) default 0,
  paid_amount      numeric(15,2) default 0,

  -- เลข tracking
  tracking_cn      text,
  tracking_th      text,
  bill_no          text,

  -- เวลา
  cn_received_at   timestamptz,
  shipped_at       timestamptz,
  customs_cleared_at timestamptz,
  th_arrived_at    timestamptz,
  delivered_at     timestamptz,

  -- อื่นๆ
  goods_description text,
  delivery_address  text,
  note             text,
  admin_note       text,
  assigned_to      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create sequence if not exists public.import_order_no_seq start with 1;

create or replace function public.generate_import_order_no() returns trigger as $$
begin
  if new.order_no is null then
    new.order_no := 'IM' || to_char(now(), 'YYMM') || lpad(nextval('public.import_order_no_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists import_order_no_trigger on public.import_orders;
create trigger import_order_no_trigger
  before insert on public.import_orders
  for each row execute function public.generate_import_order_no();

drop trigger if exists import_orders_updated_at on public.import_orders;
create trigger import_orders_updated_at
  before update on public.import_orders
  for each row execute function public.set_updated_at();

create index if not exists import_orders_profile_idx on public.import_orders(profile_id, created_at desc);
create index if not exists import_orders_status_idx  on public.import_orders(status);

-- ─────────────────────────────────────────────────────────────
-- 8. TRANSFER ORDERS — บริการฝากโอน/ชำระ Yuan
-- ─────────────────────────────────────────────────────────────
create table if not exists public.transfer_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text unique,
  profile_id       uuid not null references public.profiles(id) on delete cascade,

  status           text not null default 'pending' check (status in (
    'pending', 'processing', 'completed', 'cancelled', 'failed'
  )),

  -- จำนวนเงิน
  amount_yuan      numeric(12,4) not null check (amount_yuan > 0),
  rate_used        numeric(10,4),
  amount_thb       numeric(15,2),
  service_fee      numeric(12,2) default 0,

  -- ปลายทาง
  recipient_name   text not null,
  alipay_account   text,
  wechat_account   text,
  bank_name_cn     text,
  bank_account_cn  text,
  purpose          text,

  -- หลักฐาน
  slip_url         text,
  receipt_url      text,

  -- อื่นๆ
  note             text,
  admin_note       text,
  processed_by     uuid references public.profiles(id),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create sequence if not exists public.transfer_order_no_seq start with 1;

create or replace function public.generate_transfer_order_no() returns trigger as $$
begin
  if new.order_no is null then
    new.order_no := 'TR' || to_char(now(), 'YYMM') || lpad(nextval('public.transfer_order_no_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists transfer_order_no_trigger on public.transfer_orders;
create trigger transfer_order_no_trigger
  before insert on public.transfer_orders
  for each row execute function public.generate_transfer_order_no();

drop trigger if exists transfer_orders_updated_at on public.transfer_orders;
create trigger transfer_orders_updated_at
  before update on public.transfer_orders
  for each row execute function public.set_updated_at();

create index if not exists transfer_orders_profile_idx on public.transfer_orders(profile_id, created_at desc);
create index if not exists transfer_orders_status_idx  on public.transfer_orders(status);

-- ─────────────────────────────────────────────────────────────
-- 9. FREIGHT ORDERS — ขนส่งระหว่างประเทศ (รถ/เรือ LCL-FCL/แอร์)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.freight_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text unique,
  profile_id       uuid not null references public.profiles(id) on delete cascade,

  mode             text not null check (mode in ('truck','sea_lcl','sea_fcl','air')),
  incoterm         text check (incoterm in ('EXW','FOB','CIF','DDP','DDU','CFR')),

  status           text not null default 'draft' check (status in (
    'draft', 'confirmed', 'pickup', 'origin_port', 'in_transit', 'dest_port', 'customs', 'delivery', 'delivered', 'cancelled'
  )),

  -- เส้นทาง
  origin_city      text,
  origin_country   text default 'CN',
  dest_city        text,
  dest_country     text default 'TH',
  port_of_loading  text,
  port_of_discharge text,

  -- สินค้า
  commodity        text,
  pieces           int,
  weight_kg        numeric(10,3),
  cbm              numeric(10,4),
  containers       text,                         -- e.g. "2x20GP" for FCL

  -- ราคา
  freight_cost     numeric(15,2) default 0,
  origin_charge    numeric(15,2) default 0,
  dest_charge      numeric(15,2) default 0,
  customs_fee      numeric(15,2) default 0,
  total_cost       numeric(15,2) default 0,
  paid_amount      numeric(15,2) default 0,
  currency         text default 'THB',

  -- เอกสาร
  bl_no            text,                         -- Bill of Lading
  awb_no           text,                         -- Air Waybill
  eta              date,
  etd              date,
  ata              date,                          -- Actual arrival

  -- อื่นๆ
  note             text,
  admin_note       text,
  assigned_to      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create sequence if not exists public.freight_order_no_seq start with 1;

create or replace function public.generate_freight_order_no() returns trigger as $$
begin
  if new.order_no is null then
    new.order_no := 'FR' || to_char(now(), 'YYMM') || lpad(nextval('public.freight_order_no_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists freight_order_no_trigger on public.freight_orders;
create trigger freight_order_no_trigger
  before insert on public.freight_orders
  for each row execute function public.generate_freight_order_no();

drop trigger if exists freight_orders_updated_at on public.freight_orders;
create trigger freight_orders_updated_at
  before update on public.freight_orders
  for each row execute function public.set_updated_at();

create index if not exists freight_orders_profile_idx on public.freight_orders(profile_id, created_at desc);
create index if not exists freight_orders_status_idx  on public.freight_orders(status);
create index if not exists freight_orders_mode_idx    on public.freight_orders(mode);

-- ─────────────────────────────────────────────────────────────
-- 10. SERVICE RATES — ตารางอัตราค่าบริการ
-- ─────────────────────────────────────────────────────────────
create table if not exists public.service_rates (
  id            uuid primary key default gen_random_uuid(),
  service_type  text not null check (service_type in (
    'shop_order', 'import_sea_lcl', 'import_sea_fcl', 'import_air', 'import_truck',
    'freight_sea_lcl', 'freight_sea_fcl', 'freight_air', 'freight_truck', 'transfer'
  )),
  name          text not null,                   -- ชื่อเส้นทาง/ประเภท
  price_per_kg  numeric(10,2),
  price_per_cbm numeric(10,2),
  price_per_piece numeric(10,2),
  min_price     numeric(10,2),
  currency      text default 'THB',
  note          text,
  is_active     boolean not null default true,
  effective_from date not null default current_date,
  effective_to  date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index if not exists service_rates_type_idx on public.service_rates(service_type, is_active);

-- ─────────────────────────────────────────────────────────────
-- 11. ORDER STATUS LOGS — ประวัติการเปลี่ยนสถานะ
-- ─────────────────────────────────────────────────────────────
create table if not exists public.order_status_logs (
  id             uuid primary key default gen_random_uuid(),
  order_type     text not null check (order_type in ('shop','import','transfer','freight')),
  order_id       uuid not null,
  from_status    text,
  to_status      text not null,
  note           text,
  changed_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists order_logs_order_idx on public.order_status_logs(order_type, order_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 12. ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table public.exchange_rates       enable row level security;
alter table public.wallets              enable row level security;
alter table public.wallet_transactions  enable row level security;
alter table public.withdrawal_requests  enable row level security;
alter table public.shop_orders          enable row level security;
alter table public.shop_order_items     enable row level security;
alter table public.import_orders        enable row level security;
alter table public.transfer_orders      enable row level security;
alter table public.freight_orders       enable row level security;
alter table public.service_rates        enable row level security;
alter table public.order_status_logs    enable row level security;

-- ── exchange_rates: anyone can read, only admin can write ──
drop policy if exists "exchange_rates_select" on public.exchange_rates;
create policy "exchange_rates_select" on public.exchange_rates for select using (true);
drop policy if exists "exchange_rates_admin" on public.exchange_rates;
create policy "exchange_rates_admin" on public.exchange_rates for all using (public.is_admin());

-- ── wallets: user can read own, admin can read all ──
drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "wallets_admin_all" on public.wallets;
create policy "wallets_admin_all" on public.wallets for all using (public.is_admin());

-- ── wallet_transactions: user can read own, admin can do all ──
drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;
create policy "wallet_tx_select_own" on public.wallet_transactions for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "wallet_tx_insert_own" on public.wallet_transactions;
create policy "wallet_tx_insert_own" on public.wallet_transactions for insert with check (auth.uid() = profile_id);
drop policy if exists "wallet_tx_admin_all" on public.wallet_transactions for all using (public.is_admin());

-- ── withdrawal_requests ──
drop policy if exists "withdrawal_select_own" on public.withdrawal_requests;
create policy "withdrawal_select_own" on public.withdrawal_requests for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "withdrawal_insert_own" on public.withdrawal_requests;
create policy "withdrawal_insert_own" on public.withdrawal_requests for insert with check (auth.uid() = profile_id);
drop policy if exists "withdrawal_admin_all" on public.withdrawal_requests;
create policy "withdrawal_admin_all" on public.withdrawal_requests for all using (public.is_admin());

-- ── shop_orders ──
drop policy if exists "shop_orders_select_own" on public.shop_orders;
create policy "shop_orders_select_own" on public.shop_orders for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "shop_orders_insert_own" on public.shop_orders;
create policy "shop_orders_insert_own" on public.shop_orders for insert with check (auth.uid() = profile_id);
drop policy if exists "shop_orders_update_own" on public.shop_orders;
create policy "shop_orders_update_own" on public.shop_orders for update using (auth.uid() = profile_id and status = 'draft');
drop policy if exists "shop_orders_admin_all" on public.shop_orders;
create policy "shop_orders_admin_all" on public.shop_orders for all using (public.is_admin());

-- ── shop_order_items ──
drop policy if exists "shop_items_select" on public.shop_order_items;
create policy "shop_items_select" on public.shop_order_items for select using (
  public.is_admin() or exists (select 1 from public.shop_orders where id = shop_order_id and profile_id = auth.uid())
);
drop policy if exists "shop_items_insert" on public.shop_order_items;
create policy "shop_items_insert" on public.shop_order_items for insert with check (
  exists (select 1 from public.shop_orders where id = shop_order_id and profile_id = auth.uid() and status = 'draft')
);
drop policy if exists "shop_items_admin" on public.shop_order_items;
create policy "shop_items_admin" on public.shop_order_items for all using (public.is_admin());

-- ── import_orders ──
drop policy if exists "import_orders_select_own" on public.import_orders;
create policy "import_orders_select_own" on public.import_orders for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "import_orders_insert_own" on public.import_orders;
create policy "import_orders_insert_own" on public.import_orders for insert with check (auth.uid() = profile_id);
drop policy if exists "import_orders_admin_all" on public.import_orders;
create policy "import_orders_admin_all" on public.import_orders for all using (public.is_admin());

-- ── transfer_orders ──
drop policy if exists "transfer_orders_select_own" on public.transfer_orders;
create policy "transfer_orders_select_own" on public.transfer_orders for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "transfer_orders_insert_own" on public.transfer_orders;
create policy "transfer_orders_insert_own" on public.transfer_orders for insert with check (auth.uid() = profile_id);
drop policy if exists "transfer_orders_admin_all" on public.transfer_orders;
create policy "transfer_orders_admin_all" on public.transfer_orders for all using (public.is_admin());

-- ── freight_orders ──
drop policy if exists "freight_orders_select_own" on public.freight_orders;
create policy "freight_orders_select_own" on public.freight_orders for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists "freight_orders_insert_own" on public.freight_orders;
create policy "freight_orders_insert_own" on public.freight_orders for insert with check (auth.uid() = profile_id);
drop policy if exists "freight_orders_admin_all" on public.freight_orders;
create policy "freight_orders_admin_all" on public.freight_orders for all using (public.is_admin());

-- ── service_rates: anyone can read active, admin can manage ──
drop policy if exists "service_rates_select" on public.service_rates;
create policy "service_rates_select" on public.service_rates for select using (is_active = true or public.is_admin());
drop policy if exists "service_rates_admin" on public.service_rates;
create policy "service_rates_admin" on public.service_rates for all using (public.is_admin());

-- ── order_status_logs: user can read own, admin reads all ──
drop policy if exists "order_logs_select" on public.order_status_logs;
create policy "order_logs_select" on public.order_status_logs for select using (public.is_admin());
drop policy if exists "order_logs_admin" on public.order_status_logs;
create policy "order_logs_admin" on public.order_status_logs for all using (public.is_admin());
