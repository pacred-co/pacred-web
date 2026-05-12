-- ════════════════════════════════════════════════════════════
-- Phase D2 — Forwarder (ฝากนำเข้า — biggest customer-side domain)
-- ════════════════════════════════════════════════════════════
-- Legacy tb_forwarder is 100+ columns mixing customer-set inputs,
-- computed prices, and 30+ admin-internal fields (cost_*, profit_*,
-- printStatus*, lockDate, sessionId, fStatusCar*, partner-warehouse
-- IDs). We split into:
--
--   forwarders                 — customer-visible record + computed price
--   forwarder_items            — line items per package
--   forwarder_images           — cover + extras (Storage paths)
--   forwarder_status_log       — audit (legacy tb_log_forwarder_status)
--
-- Admin-internal columns (cost_*, profit_*, admin_id_*, partner
-- warehouse codes, printStatus*) are NULLABLE on forwarders for now
-- and get a separate forwarder_admin sidecar table in Phase G if the
-- column count grows.
--
-- Status enum (replaces legacy varchar(2) numeric codes):
--   1 → 'pending_payment'    รอชำระเงิน
--   2 → 'shipped_china'      สินค้าออกจากจีน
--   3 → 'in_transit'         ขนส่งกลางทาง (ทะเล/รถ)
--   4 → 'arrived_thailand'   สินค้าเข้าโกดังไทย
--   5 → 'out_for_delivery'   กำลังจัดส่ง
--   6 → 'delivered'          ส่งสำเร็จ
--   7 → 'cancelled'          ยกเลิก
--
-- f_no format: F{YYMMDD}-{seq}  (Pacred convention, parallel to ONS
-- for service-order). Generated via sequence + trigger.
-- ════════════════════════════════════════════════════════════

create sequence if not exists public.forwarder_seq;

create or replace function public.generate_forwarder_no()
returns trigger as $$
declare
  yymmdd text;
  seq    int;
begin
  if new.f_no is null then
    yymmdd := to_char(current_date, 'YYMMDD');
    seq    := nextval('public.forwarder_seq');
    new.f_no := 'F' || yymmdd || '-' || seq::text;
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.forwarders (
  id                    uuid primary key default gen_random_uuid(),
  f_no                  text unique,                                  -- F{YYMMDD}-{seq}
  profile_id            uuid not null references public.profiles(id) on delete cascade,

  -- state machine
  status                text not null default 'pending_payment'
                        check (status in (
                          'pending_payment','shipped_china','in_transit',
                          'arrived_thailand','out_for_delivery','delivered','cancelled'
                        )),
  paydeposit_pending    boolean not null default false,               -- legacy paydeposit 1 = "รอตรวจสอบการจ่ายเงิน"

  -- shipment classification (customer choice)
  source_warehouse      text not null check (source_warehouse in ('guangzhou','yiwu')),
  partner_warehouse     text,                                          -- 'sang' | 'ctt' | 'mk' | 'mx' | 'jmf' — admin sets
  transport_type        text not null check (transport_type in ('truck','ship','air')),
  product_type          text not null check (product_type in ('general','tisi','fda','special')),
  product_type_sub      text,                                          -- legacy fProductsType2
  ship_by               text,                                          -- domestic delivery method
  pay_method            text not null default 'origin' check (pay_method in ('origin','destination')),
  rate_basis            text not null default 'auto' check (rate_basis in ('kg','cbm','auto')),
                                                                       -- 'auto' = take whichever yields higher price
                                                                       --  per legacy fRefPrice 1=weight 2=volume

  -- shipping address snapshot (legacy fAddress*)
  ship_first_name       text not null,
  ship_last_name        text not null,
  ship_phone            text not null,
  ship_phone2           text,
  ship_address_line     text not null,
  ship_sub_district     text not null,
  ship_district         text not null,
  ship_province         text not null,
  ship_postal_code      text not null,
  ship_note             text,
  ship_latitude         numeric(10,8),
  ship_longitude        numeric(11,8),

  -- box-level details (rolled up from items; or set directly if no items breakdown)
  box_count             int not null default 1,
  weight_kg             numeric(10,2) not null default 0,
  width_cm              numeric(10,2) not null default 0,
  length_cm             numeric(10,2) not null default 0,
  height_cm             numeric(10,2) not null default 0,
  volume_cbm            numeric(10,5) not null default 0,              -- (W×L×H)/10^6, generated on read

  -- pricing inputs (locked at submit time)
  custom_rate           boolean not null default false,                -- legacy customRate 0 default, 1 custom
  custom_rate_kg        numeric(10,2),
  custom_rate_cbm       numeric(10,2),
  yuan_rate_locked      numeric(8,4),                                  -- exchange rate at submit (for fTransportPriceCHNTHB)
  domestic_china_thb    numeric(10,2) not null default 0,              -- ค่าขนส่งในจีน (already in THB)
  thailand_delivery_thb numeric(10,2) not null default 0,              -- ค่าขนส่งในไทย (legacy fTransportPrice)
  crate                 boolean not null default false,                -- ตีลังไม้
  crate_price           numeric(10,2) not null default 0,
  qc                    boolean not null default false,
  qc_price              numeric(10,2) not null default 0,
  other_price           numeric(10,2) not null default 0,
  other_price_desc      text,
  discount              numeric(10,2) not null default 0,
  service_fee           numeric(10,2) not null default 0,              -- read from settings.service_fee at submit
  price_update          numeric(10,2) not null default 0,              -- adjustment column

  -- pricing outputs (computed by D3 engine, written at submit + admin-edit)
  transport_price       numeric(10,2) not null default 0,              -- main rate × weight/cbm
  total_price           numeric(10,2) not null default 0,

  -- admin internals (Phase G; nullable for now)
  cost_total_price      numeric(10,2),                                 -- legacy fCostTotalPrice
  profit_total          numeric(10,2),
  print_status_invoice  boolean not null default false,
  print_status_receipt  boolean not null default false,
  admin_id_creator      text,
  admin_id_update       text,
  locked_until          timestamptz default now(),
  session_id            text,

  -- delivery tracking
  tracking_chn          text,
  tracking_chn2         text,
  tracking_th           text,
  cabinet_number        text,
  date_shipped_china    timestamptz,                                   -- legacy fDateStatus2
  date_in_transit       timestamptz,                                   -- fDateStatus3
  date_arrived_thailand timestamptz,                                   -- fDateStatus4
  date_out_for_delivery timestamptz,                                   -- fDateStatus5
  date_delivered        timestamptz,                                   -- fDateStatus6

  -- free-form
  detail                text,
  note_admin            text,                                          -- legacy fNote
  note_user             text,                                          -- legacy fNoteUser

  -- linkage
  credit_used           boolean not null default false,                -- paid via credit_balance
  ref_order             text,                                          -- legacy refOrder

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists forwarders_profile_idx
  on public.forwarders(profile_id, created_at desc);
create index if not exists forwarders_status_idx
  on public.forwarders(status, created_at);
create index if not exists forwarders_tracking_chn_idx
  on public.forwarders(tracking_chn) where tracking_chn is not null;

drop trigger if exists forwarders_no_trigger on public.forwarders;
create trigger forwarders_no_trigger
  before insert on public.forwarders
  for each row execute function public.generate_forwarder_no();

drop trigger if exists forwarders_updated_at_trigger on public.forwarders;
create trigger forwarders_updated_at_trigger
  before update on public.forwarders
  for each row execute function public.set_updated_at();

-- ── forwarder_items ──
create table if not exists public.forwarder_items (
  id                       uuid primary key default gen_random_uuid(),
  forwarder_id             uuid not null references public.forwarders(id) on delete cascade,
  product_id               text,                                       -- legacy reference; may join to product cache
  product_name             text not null,
  product_tracking         text,                                       -- per-box CN tracking
  product_tracking_note    text,
  product_qty              int not null default 1,
  product_type_code        text,                                       -- legacy productTypeCode

  -- dimensions per item (optional — fall back to forwarder-level if null)
  width_cm                 numeric(10,2),
  length_cm                numeric(10,2),
  height_cm                numeric(10,2),
  weight_per_item_kg       numeric(10,2),
  weight_all_kg            numeric(10,2),
  cbm_per_item             numeric(10,5),
  cbm_all                  numeric(10,5),

  -- per-item pricing carve-out (legacy items had separate qc/discount/etc)
  domestic_china_thb       numeric(10,2) not null default 0,
  crate_price              numeric(10,2) not null default 0,
  qc_price                 numeric(10,2) not null default 0,
  other_service_fee        numeric(10,2) not null default 0,
  thailand_delivery_fee    numeric(10,2) not null default 0,
  price_update             numeric(10,2) not null default 0,
  discount                 numeric(10,2) not null default 0,

  location_wth             text,                                       -- warehouse internal location
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  admin_id                 text,
  admin_id_updated         text
);

create index if not exists forwarder_items_forwarder_idx
  on public.forwarder_items(forwarder_id);

drop trigger if exists forwarder_items_updated_at_trigger on public.forwarder_items;
create trigger forwarder_items_updated_at_trigger
  before update on public.forwarder_items
  for each row execute function public.set_updated_at();

-- ── forwarder_images ──
-- One row per uploaded image; storage path under
-- forwarder-covers/{profile_id}/{forwarder_id}/...
create table if not exists public.forwarder_images (
  id           uuid primary key default gen_random_uuid(),
  forwarder_id uuid not null references public.forwarders(id) on delete cascade,
  image_path   text not null,                                           -- Supabase Storage key
  is_cover     boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists forwarder_images_forwarder_idx
  on public.forwarder_images(forwarder_id, sort_order);

-- only one cover per forwarder
create unique index if not exists forwarder_images_one_cover_idx
  on public.forwarder_images(forwarder_id) where is_cover = true;

-- ── forwarder_status_log (audit) ──
create table if not exists public.forwarder_status_log (
  id              uuid primary key default gen_random_uuid(),
  forwarder_id    uuid not null references public.forwarders(id) on delete cascade,
  status_old      text,
  status_new      text not null,
  changed_at      timestamptz not null default now(),
  admin_id        text
);

create index if not exists forwarder_status_log_forwarder_idx
  on public.forwarder_status_log(forwarder_id, changed_at desc);

-- log inserts on status change
create or replace function public.forwarder_log_status_change()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into public.forwarder_status_log (forwarder_id, status_new)
      values (new.id, new.status);
    return new;
  end if;
  if new.status <> old.status then
    insert into public.forwarder_status_log (forwarder_id, status_old, status_new, admin_id)
      values (new.id, old.status, new.status, new.admin_id_update);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists forwarders_status_log_trigger on public.forwarders;
create trigger forwarders_status_log_trigger
  after insert or update of status on public.forwarders
  for each row execute function public.forwarder_log_status_change();

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.forwarders            enable row level security;
alter table public.forwarder_items       enable row level security;
alter table public.forwarder_images      enable row level security;
alter table public.forwarder_status_log  enable row level security;

drop policy if exists "forwarders_select_own" on public.forwarders;
create policy "forwarders_select_own" on public.forwarders
  for select using (auth.uid() = profile_id);

drop policy if exists "forwarders_insert_own" on public.forwarders;
create policy "forwarders_insert_own" on public.forwarders
  for insert with check (
    auth.uid() = profile_id
    and status = 'pending_payment'
  );

drop policy if exists "forwarders_update_own_pending" on public.forwarders;
create policy "forwarders_update_own_pending" on public.forwarders
  for update using (
    auth.uid() = profile_id
    and status = 'pending_payment'
  ) with check (
    auth.uid() = profile_id
    and status = 'pending_payment'
  );

-- items: select + write own (parent ownership inferred via forwarder_id)
drop policy if exists "forwarder_items_select_own" on public.forwarder_items;
create policy "forwarder_items_select_own" on public.forwarder_items
  for select using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id and f.profile_id = auth.uid())
  );

drop policy if exists "forwarder_items_write_own_pending" on public.forwarder_items;
create policy "forwarder_items_write_own_pending" on public.forwarder_items
  for all using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  ) with check (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  );

-- images: select + write own
drop policy if exists "forwarder_images_select_own" on public.forwarder_images;
create policy "forwarder_images_select_own" on public.forwarder_images
  for select using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id and f.profile_id = auth.uid())
  );

drop policy if exists "forwarder_images_write_own_pending" on public.forwarder_images;
create policy "forwarder_images_write_own_pending" on public.forwarder_images
  for all using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  ) with check (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  );

-- status log: select own (admin-write only — no policy = denied for users)
drop policy if exists "forwarder_status_log_select_own" on public.forwarder_status_log;
create policy "forwarder_status_log_select_own" on public.forwarder_status_log
  for select using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id and f.profile_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════
-- Storage — forwarder-covers bucket (cover + multi-image upload)
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('forwarder-covers', 'forwarder-covers', false)
on conflict (id) do nothing;

-- Path pattern: forwarder-covers/{user_id}/{forwarder_id}/{filename}

drop policy if exists "forwarder_covers_user_select" on storage.objects;
create policy "forwarder_covers_user_select" on storage.objects
  for select using (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "forwarder_covers_user_insert" on storage.objects;
create policy "forwarder_covers_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "forwarder_covers_user_update" on storage.objects;
create policy "forwarder_covers_user_update" on storage.objects
  for update using (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "forwarder_covers_user_delete" on storage.objects;
create policy "forwarder_covers_user_delete" on storage.objects
  for delete using (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
