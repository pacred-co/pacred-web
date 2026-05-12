-- ════════════════════════════════════════════════════════════
-- Phase H — Feature parity catch-up
-- ════════════════════════════════════════════════════════════
-- Adds the schema pieces flagged in the gap audit:
-- 1. containers — ops daily-tracking table (legacy รายการตู้)
-- 2. profiles: assigned_admin_phone / admin_avatar (derived via join — no
--    extra column needed; we use existing profiles.sales_admin_id)
-- 3. admin_profile_extras for legacy adminID-style metadata that doesn't
--    fit elsewhere (department / section / phone for sales rep card)
-- 4. cart_items.variant_label + variant_data (for SKU variants from
--    1688/Taobao paste flow)
-- ════════════════════════════════════════════════════════════

-- ── containers ──
-- Tracks shipping containers from China → Thailand.
-- Each forwarder/service_order line item links via container_id once
-- assigned by the warehouse ops team.
create table if not exists public.containers (
  id                   uuid primary key default gen_random_uuid(),
  container_no         text unique,                                   -- e.g. CN-260513-01
  vendor_container_id  text,                                          -- shipping line's container number
  vessel               text,                                          -- ship/truck name
  carrier              text,                                          -- carrier company (Maersk, COSCO, JMF, etc.)
  origin_warehouse     text check (origin_warehouse in ('guangzhou','yiwu','other')) default 'guangzhou',
  transport_type       text not null default 'truck' check (transport_type in ('truck','ship','air')),

  -- timeline
  status               text not null default 'preparing'
                       check (status in (
                         'preparing','sealed','in_transit',
                         'arrived_port','cleared_customs','delivered','cancelled'
                       )),
  date_sealed          timestamptz,
  date_in_transit      timestamptz,
  date_arrived_port    timestamptz,
  date_cleared         timestamptz,
  date_delivered       timestamptz,
  eta                  date,

  -- billing details
  total_weight_kg      numeric(12,2) default 0,
  total_volume_cbm     numeric(12,5) default 0,
  cost_thb             numeric(12,2),                                  -- admin internal (cost from carrier)

  note                 text,
  admin_id_create      text,
  admin_id_update      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists containers_status_idx on public.containers(status, created_at desc);
create index if not exists containers_eta_idx on public.containers(eta) where status in ('sealed','in_transit');

-- generator: CN-{YYMMDD}-{seq}
create sequence if not exists public.container_seq;
create or replace function public.generate_container_no()
returns trigger as $$
begin
  if new.container_no is null then
    new.container_no := 'CN' || to_char(current_date,'YYMMDD') || '-' || nextval('public.container_seq')::text;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists containers_no_trigger on public.containers;
create trigger containers_no_trigger before insert on public.containers
  for each row execute function public.generate_container_no();

drop trigger if exists containers_updated_at_trigger on public.containers;
create trigger containers_updated_at_trigger before update on public.containers
  for each row execute function public.set_updated_at();

-- Link forwarders + service_orders to a container (optional)
alter table public.forwarders     add column if not exists container_id uuid references public.containers(id) on delete set null;
alter table public.service_orders add column if not exists container_id uuid references public.containers(id) on delete set null;

create index if not exists forwarders_container_idx     on public.forwarders(container_id) where container_id is not null;
create index if not exists service_orders_container_idx on public.service_orders(container_id) where container_id is not null;

alter table public.containers enable row level security;

-- Customers can see containers their own forwarders/orders are in
-- (so /service-import/[fNo] can show "อยู่ในตู้ XXX")
drop policy if exists "containers_select_via_my_orders" on public.containers;
create policy "containers_select_via_my_orders" on public.containers
  for select using (
    exists (select 1 from public.forwarders f
             where f.container_id = id and f.profile_id = auth.uid())
    or
    exists (select 1 from public.service_orders so
             where so.container_id = id and so.profile_id = auth.uid())
  );

drop policy if exists "containers_admin_all" on public.containers;
create policy "containers_admin_all" on public.containers
  for all using (public.is_admin()) with check (public.is_admin());

-- ── cart_items: variant fields ──
-- For URL-paste flow with multi-SKU products. variant_data jsonb stores
-- the propPath like { color: 'red', size: 'M' } so a re-paste of the
-- same URL doesn't dedupe rows that are actually different SKUs.
alter table public.cart_items
  add column if not exists variant_label text,
  add column if not exists variant_data  jsonb,
  add column if not exists source_product_id text,                   -- legacy thid_item_id
  add column if not exists stock_available  int;

create index if not exists cart_items_source_idx
  on public.cart_items(profile_id, source_product_id) where source_product_id is not null;

-- ── admin_contact_extras ──
-- Sales rep card on customer sidebar needs the rep's display name +
-- direct phone + avatar (legacy fields adminPhone, adminPicture). We
-- piggyback on profiles for name/phone/avatar_url (admin IS a profile
-- with role row in admins) and add a single sidecar for non-profile
-- extras like the "extension number" used by some teams.
create table if not exists public.admin_contact_extras (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  display_name   text,                                              -- "เซลล์ มิว" (shown on customer card)
  direct_phone   text,                                              -- the click-to-call number
  department     text,                                              -- 'sale' | 'ops' | 'qc' | ...
  section        text,                                              -- finer grouping inside department
  updated_at     timestamptz not null default now()
);

drop trigger if exists admin_contact_extras_updated_at_trigger on public.admin_contact_extras;
create trigger admin_contact_extras_updated_at_trigger
  before update on public.admin_contact_extras
  for each row execute function public.set_updated_at();

alter table public.admin_contact_extras enable row level security;

-- Public read (customer needs to see their rep's name+phone)
drop policy if exists "admin_contact_extras_select_all" on public.admin_contact_extras;
create policy "admin_contact_extras_select_all" on public.admin_contact_extras
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_contact_extras_admin_all" on public.admin_contact_extras;
create policy "admin_contact_extras_admin_all" on public.admin_contact_extras
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Dashboard banners (admin-managed marketing) ──
create table if not exists public.dashboard_banners (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,                              -- 'search-china', 'billing', 'line-notify', ...
  title           text not null,
  subtitle        text,
  image_path      text,                                              -- public bucket
  link_href       text,
  cta_label       text,
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists dashboard_banners_active_idx
  on public.dashboard_banners(sort_order)
  where is_active = true;

drop trigger if exists dashboard_banners_updated_at_trigger on public.dashboard_banners;
create trigger dashboard_banners_updated_at_trigger before update on public.dashboard_banners
  for each row execute function public.set_updated_at();

alter table public.dashboard_banners enable row level security;

drop policy if exists "dashboard_banners_select_active" on public.dashboard_banners;
create policy "dashboard_banners_select_active" on public.dashboard_banners
  for select using (
    auth.role() = 'authenticated'
    and is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );

drop policy if exists "dashboard_banners_admin_all" on public.dashboard_banners;
create policy "dashboard_banners_admin_all" on public.dashboard_banners
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Seed default banners so dashboard isn't empty on launch ──
insert into public.dashboard_banners (slug, title, subtitle, cta_label, link_href, sort_order) values
  ('search-china', 'ค้นหาสินค้าจากเว็บ 1688 / Taobao / Tmall', 'วางลิ้งสินค้าหรือพิมพ์คำค้น แปลภาษาไทยทันที', 'เริ่มค้นหา', '/service-order/add', 1),
  ('billing',      'ออกบิลใบเสร็จ / ใบแจ้งหนี้', 'ฝากสั่งซื้อด้วยตัวคุณเอง — Pacred ออกบิลให้อัตโนมัติ', 'ดูตัวอย่าง', '/service-order/cart', 2),
  ('line-notify',  'ไม่พลาดทุกการแจ้งเตือน', 'เชื่อมต่อ LINE OA Pacred ได้แล้ววันนี้', 'เชื่อม LINE', '/profile', 3)
on conflict (slug) do nothing;
