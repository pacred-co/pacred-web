-- 0248_booking_pricing_catalog.sql — Booking pricing catalog store (ปอน 2026-07-10)
--
-- Backs the /admin/workspace/booking/import/settings "ตั้งค่า" editor: Pricing sets the
-- default line-item rate template per condition combo (Term × ขนส่ง × LCL/FCL) — sale +
-- cost + profit — which the Booking quotation form (Condition Builder) pulls in.
-- Additive only — one new table, no change to existing schema.
--
-- Shape mirrors mkt_* (mig 0238): id (text PK = combo key e.g. "CIF_SEA_FCL") + data
-- (jsonb = the whole CatalogTemplate incl. cost/profit) + updated_at. Filtering is done
-- app-side. Server actions use the service-role client; cost/profit is stripped in the
-- action per the viewer's role (lib/admin/money-visibility.ts) before it reaches a client.
-- RLS: admin-only via public.is_admin() (ADR-0002 / migration 0015) — defense in depth.

create table if not exists booking_pricing_catalog (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table booking_pricing_catalog enable row level security;

do $$
begin
  execute 'drop policy if exists booking_pricing_catalog_admin_all on booking_pricing_catalog';
  execute 'create policy booking_pricing_catalog_admin_all on booking_pricing_catalog for all using (public.is_admin()) with check (public.is_admin())';
end $$;
