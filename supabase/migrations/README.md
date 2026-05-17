# Pacred — Database migrations runbook

วิธีรัน migration ทั้งหมดบน **Supabase Dashboard → SQL Editor**

## ⚡ ขั้นตอนรัน (ตามลำดับ — **ห้ามข้าม**)

1. เปิด [Supabase Dashboard](https://supabase.com/dashboard) → โปรเจกต์ Pacred
2. เมนูซ้าย → **SQL Editor** → **New query**
3. รันไฟล์ทีละไฟล์ตามลำดับด้านล่าง (เปิดไฟล์ → copy ทั้งหมด → paste ใน SQL Editor → กด **Run**)
4. ถ้า migration ใดเตือน "duplicate" / "already exists" ไม่ต้องตกใจ — ทุก migration ใช้ `IF NOT EXISTS` / `create or replace` ก็ปลอดภัยรัน 2 รอบ

### ลำดับการรัน

| # | ไฟล์ | สาระ | Phase |
|---|---|---|---|
| 1 | [`../schema.sql`](../schema.sql) | base — profiles + documents + otp_codes + member-docs bucket | (initial) |
| 2 | [0002_orders.sql](0002_orders.sql) | demo orders (อ้างอิงเท่านั้น — ไม่ใช้ใน Pacred) | (legacy) |
| 3 | [0003_profiles_extended.sql](0003_profiles_extended.sql) | เพิ่ม 25 columns ใน profiles | **B1** |
| 4 | [0004_corporate.sql](0004_corporate.sql) | corporate (juristic 1:1) | **B2** |
| 5 | [0005_addresses.sql](0005_addresses.sql) | shipping addresses | **B3** |
| 6 | [0006_tos_acceptance.sql](0006_tos_acceptance.sql) | TOS gate columns | **B6** |
| 7 | [0007_wallet.sql](0007_wallet.sql) | wallet + ledger + slips bucket | **C1** |
| 8 | [0008_payment_yuan.sql](0008_payment_yuan.sql) | yuan_payments (Alipay) | **C2** |
| 9 | [0009_rates.sql](0009_rates.sql) | rate tables + settings + seeds | **D1** |
| 10 | [0010_forwarder.sql](0010_forwarder.sql) | forwarders + items + images + forwarder-covers bucket | **D2** |
| 11 | [0011_service_order.sql](0011_service_order.sql) | cart + service_orders + items + promotions + carts bucket | **E1** |
| 12 | [0012_avatars_bucket.sql](0012_avatars_bucket.sql) | avatars storage bucket (public read) | hotfix |
| 13 | [0013_sales_referral.sql](0013_sales_referral.sql) | team_leaders + sales_commissions + sales_payouts + auto-emit triggers | **F1** |
| 14 | [0014_notifications.sql](0014_notifications.sql) | notifications log + notification_reads | **F2** |
| 15 | [0015_admin_rbac.sql](0015_admin_rbac.sql) | admins + is_admin() + admin_audit_log + admin RLS overrides | **G2** |
| 16 | [0016_phase_h_upgrades.sql](0016_phase_h_upgrades.sql) | containers + admin_contact_extras + dashboard_banners + cart_items variant fields | **H** |
| 17 | [0017_org_chart.sql](0017_org_chart.sql) | org_branches + org_sections + org_positions + org_assignments + seed Pacred structure (3 directors, 9 sections, 24 positions) | **H · HR** |
| 18 | [0018_hr_employees.sql](0018_hr_employees.sql) | admin_contact_extras extras: nickname + company + employee_type + work_email + work_phone + hired_at + suspended_at (powers /admin/hr/employees data-table) | **H · HR** |
| 19 | [0019_hr_recruitment.sql](0019_hr_recruitment.sql) | job_postings + job_applicants + resumes bucket + seed 3 sample postings (powers /admin/hr/recruitment pipeline: applied → screening → interviewing → offered → hired / rejected) | **H · HR** |
| 20 | [0020_hr_attendance.sql](0020_hr_attendance.sql) | attendance_logs + leave_requests + trigger that auto-computes late_minutes/worked_minutes and applies approved leaves to attendance (powers /admin/hr/attendance + /admin/hr/attendance/leaves) | **H · HR** |
| 21 | [0021_hr_learning_policies_audit.sql](0021_hr_learning_policies_audit.sql) | training_courses + training_enrollments + policies + policy_acknowledgments + employee_audit_entries + seed (3 courses, 4 policies). Powers /admin/hr/training + /admin/hr/policies + /admin/hr/audit | **H · HR** |
| 22 | [0022_contact_messages.sql](0022_contact_messages.sql) | contact_messages — ฟอร์มติดต่อ /contact | **P-6** |
| 23 | [0023_otp_purpose_change_phone.sql](0023_otp_purpose_change_phone.sql) | otp_codes.purpose += `change_phone` | **P-3** |
| 24 | [0024_notification_ref_contact_message.sql](0024_notification_ref_contact_message.sql) | notifications.reference_type += `contact_message` | **0024** |
| 25 | [0025_profiles_notify_channels_daily_digest.sql](0025_profiles_notify_channels_daily_digest.sql) | profiles.notify_channels.daily_digest flag | **P-15** |
| 26 | [0026_notification_category_sales_digest.sql](0026_notification_category_sales_digest.sql) | notifications.category += `sales_digest` | **P-15** |
| 27 | [0027_admin_contact_extras_contract_end_date.sql](0027_admin_contact_extras_contract_end_date.sql) | admin_contact_extras.contract_end_date | **P-17** |
| 28 | [0028_forwarder_driver.sql](0028_forwarder_driver.sql) | forwarder_driver — driver assignment table | **P-18** |
| 29 | [0029_csv_imports.sql](0029_csv_imports.sql) | csv_imports + csv-imports storage bucket | **P-19** |
| 30 | [0030_hs_codes_rates.sql](0030_hs_codes_rates.sql) | hs_codes + container_hs_lines + seed | **P-20** |
| 31 | [0031_hs_codes_rls_authenticated.sql](0031_hs_codes_rls_authenticated.sql) | hs_codes RLS → authenticated-only read | **P-20** |
| 32 | [0032_csv_imports_started_at.sql](0032_csv_imports_started_at.sql) | csv_imports.started_at + stale-import recovery | **P-19** |
| 33 | [0033_containers.sql](0033_containers.sql) | cargo_containers + cargo_shipments + tracking + history | **T-P2** |
| 34 | [0034_tax_invoices.sql](0034_tax_invoices.sql) | tax_invoices + lines + serial generator | **T-P4 G2** |
| 35 | [0035_tax_invoices_storage.sql](0035_tax_invoices_storage.sql) | tax-invoices storage bucket | **T-P4 G2** |
| 36 | [0036_carriers.sql](0036_carriers.sql) | carriers + seed (SPX/J&T/Flash/EMS/Lalamove) | **U2-3** |
| 37 | [0037_cargo_shipments_received_qty.sql](0037_cargo_shipments_received_qty.sql) | cargo_shipments.received_box_count (split-receipt) | **U1-5** |
| 38 | [0038_forwarder_cost_adjustments.sql](0038_forwarder_cost_adjustments.sql) | forwarder_cost_adjustments — post-delivery rebill | **U2-4** |
| 39 | [0039_cargo_shipments_cbm_per_source.sql](0039_cargo_shipments_cbm_per_source.sql) | cargo_shipments + cbm per source (V-D1) | **V-D1** |
| 40 | [0040_cargo_type_and_carrier_container.sql](0040_cargo_type_and_carrier_container.sql) | cargo_type canonical enum + carrier_container_no (V-D2/D3) | **V-D2/D3** |
| 41 | [0041_bill_to_name_override.sql](0041_bill_to_name_override.sql) | forwarders + service_orders bill_to_name_override (V-C2) | **V-C2** |
| 42 | [0042_cargo_containers_close_at.sql](0042_cargo_containers_close_at.sql) | cargo_containers close_at ตัดตู้ deadline (V-C3) | **V-C3** |
| 43 | [0043_slip_transferred_at.sql](0043_slip_transferred_at.sql) | wallet_transactions + yuan_payments slip_transferred_at (V-A1) | **V-A1** |
| 44 | [0044_withholding_tax.sql](0044_withholding_tax.sql) | withholding_tax_entries + wht-certs storage bucket (V-A6) | **V-A6 · I2** |
| 45 | [0045_freight_qa_inspections.sql](0045_freight_qa_inspections.sql) | freight_qa_inspections + qa_inspection_seq + qa-inspection-photos bucket (V-E10) | **V-E10 · I2** |
| 46 | [0046_org_contacts.sql](0046_org_contacts.sql) | org_contacts — owner-self-serve contact mgmt (V-G5) | **V-G5 · I2** |
| 47 | [0047_tos_versions.sql](0047_tos_versions.sql) | tos_versions + tos_acceptances — TOS version mgmt (V-G4) | **V-G4 · I2** |
| 48 | [0048_freight_quotes.sql](0048_freight_quotes.sql) | freight_quotes + freight_quote_items + freight_quote_seq (V-E6) | **V-E6 · I2** |
| 49 | [0049_wallet_order_payment_unique.sql](0049_wallet_order_payment_unique.sql) | partial-unique guard — double-debit fix on pay-from-wallet (F-11/G9) | **F-11 · I2** |
| 50 | [0050_freight_shipments.sql](0050_freight_shipments.sql) | freight_shipments + freight_parties + freight_job_seq + V-E10 QA FK backfill (V-E1) | **V-E1 · I2** |
| 51 | [0051_freight_invoices.sql](0051_freight_invoices.sql) | freight_invoices + freight_invoice_lines + freight_invoice_seq (V-E1) | **V-E1 · I2** |
| 52 | [0052_freight_invoice_payments.sql](0052_freight_invoice_payments.sql) | freight_invoice_payments ledger + freight_invoices.payment_status + freight-payment-slips bucket (V-E7) | **V-E7 · I2** |
| 53 | [0053_freight_invoice_wht.sql](0053_freight_invoice_wht.sql) | withholding_tax_entries.freight_invoice_id + 3-way parent XOR + per-freight-invoice unique/lookup indexes | **U2-3 freight WHT** |
| 54 | [0060_member_code_3digit.sql](0060_member_code_3digit.sql) | generate_member_code() PR00001→PR001 (min-3-digit) + profiles backfill | **launch fix** |
| 55 | [0061_money_idempotency_guards.sql](0061_money_idempotency_guards.sql) | wallet_transactions kind+='cost_adjustment' + 3 partial-unique guards (forwarder pay · freight payment · tax invoice) — money audit P0-1/P1-2/P1-4 | **launch fix** |
| 56 | [0062_rls_role_pin_money_pii.sql](0062_rls_role_pin_money_pii.sql) | role-pin every money/PII/order/pricing `*_admin_all` RLS policy to explicit role arrays + wallet_transactions DB-level audit trigger — W-1 / gap-schema-security S-1 keystone (closes the driver/warehouse direct-PostgREST money-write hole) | **launch fix** |
| 57 | [0063_wallet_freight_invoice_reference.sql](0063_wallet_freight_invoice_reference.sql) | wallet_transactions reference_type+='freight_invoice' + partial-unique guard on the freight-payment wallet slice — W-3 / gap-schema-security G-3 (freight wallet-pay now writes a real wallet debit instead of a free shipment) | **launch fix** |
| 58 | [0064_wallet_overdraw_guard.sql](0064_wallet_overdraw_guard.sql) | wallet_available_balance() fn + wallet_assert_no_overdraw() BEFORE-trigger — hard non-negative floor on customer pending main-bucket debits with FOR UPDATE row-lock — gap-customer H-1 / S-5 aggregate-pending overdraw | **launch fix** |

> 📋 **Phase-I2 batch (`0044`-`0052` + `0060`) — ภูม applies.** ภูม owns running
> these on **dev + production** Supabase — paste each file into the SQL Editor in
> ascending number order, or `supabase db push`. Apply in number order:
> `0050`/`0051` reference `0045`/`0048` and `0052` references `0051`, so ascending
> order satisfies every dependency. เดฟ/agent reviews the SQL; ภูม applies — no zip
> hand-off. Status + per-file detail → [`../../docs/runbook/poom-apply-migrations-2026-05-17.md`](../../docs/runbook/poom-apply-migrations-2026-05-17.md).

> ⚡ **Shortcut for 0023–0038:** instead of pasting 16 files one by one,
> open [`../../docs/setup/migrations-0023-0038.sql`](../../docs/setup/migrations-0023-0038.sql)
> — a single combined, idempotent file — paste the whole thing into the
> SQL Editor and **Run** once. (0022 is standalone; run it first if the
> `contact_messages` table doesn't exist yet.)
>
> ⚡ **Shortcut for 0039–0043 (ภูม night-3 batch):** open
> [`../../docs/setup/migrations-0039-0043.sql`](../../docs/setup/migrations-0039-0043.sql)
> — combined, idempotent, includes a verify query at the bottom.
> Paste → **Run** once. PREREQUISITES: 0033 (cargo_containers /
> cargo_shipments) + 0034 (tax_invoices) must already be applied.

## 🛠 ตรวจว่ารันสำเร็จมั้ย

หลังรันครบทุกไฟล์ ตรวจตามนี้ (รันใน SQL Editor):

```sql
-- ควรเจอ tables ทั้งหมดนี้
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in (
     'profiles','documents','otp_codes',
     'corporate','addresses',
     'wallet','wallet_transactions',
     'yuan_payments',
     'customer_groups','settings','rate_general','rate_vip','rate_custom_user','rate_custom_hs',
     'forwarders','forwarder_items','forwarder_images','forwarder_status_log',
     'cart_items','service_orders','service_order_items','promotions','promotion_applications',
     'team_leaders','sales_commissions','sales_payouts',
     'notifications','notification_reads',
     'admins','admin_audit_log'
   )
 order by table_name;
```

ควรได้ **31 rows** ครบ — ถ้าได้น้อยกว่า แสดงว่า migration บางตัวยังไม่ได้รัน

```sql
-- ตรวจว่า TOS columns พร้อมแล้ว (แก้ bug "schema cache")
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'profiles'
   and column_name  in ('tos_accepted_version','tos_accepted_at');
```

ควรได้ **2 rows** — ถ้าได้ 0 → ยังไม่ได้รัน 0006_tos_acceptance.sql

```sql
-- ตรวจ storage buckets
select id from storage.buckets where id in ('member-docs','slips','forwarder-covers','carts');
```

ควรได้ **4 buckets**

## 🪣 Storage buckets ที่ migration สร้างให้

| Bucket | Public? | Path pattern | สร้างใน |
|---|---|---|---|
| `member-docs` | private | `{user_id}/{doc_type}/{filename}` | schema.sql |
| `slips` | private | `{user_id}/{kind}/{filename}` | 0007_wallet.sql |
| `forwarder-covers` | private | `{user_id}/{forwarder_id}/{filename}` | 0010_forwarder.sql |
| `carts` | private | `{user_id}/{filename}` | 0011_service_order.sql |
| `avatars` | **public** | `{user_id}/avatar.{ext}` | 0012_avatars_bucket.sql |

ทุก bucket มี RLS policy แล้วใน migration — เปิดได้เฉพาะเจ้าของ folder

## 🚨 ถ้าเจอ error "Could not find the 'X' column of '...' in the schema cache"

= ยังไม่ได้รัน migration ที่เพิ่ม column นั้น — รันไฟล์ที่ขาดให้ครบ แล้วใน Supabase Dashboard:
- **Database → Schema** → กด **Reload Schema Cache** (หรือรอ ~1 นาที PostgREST จะ reload เอง)

## 🔁 Re-run policy

ทุก migration เขียนแบบ idempotent:
- `create table if not exists ...`
- `add column if not exists ...`
- `create or replace function ...`
- `drop trigger if exists ... → create trigger ...`
- `drop policy if exists ... → create policy ...`
- `on conflict do nothing` ใน seed inserts

= รันซ้ำได้ทุกเมื่อ ไม่ทำลายข้อมูล

## ⚙️ Env vars (production)

หลังรัน migration เสร็จ ตั้ง env บน Vercel:

```
# Auth + DB (จาก Supabase Dashboard → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>  # server-only

# OTP (Phase 4)
OTP_BYPASS=false                   # production
THAIBULKSMS_USERNAME=<>
THAIBULKSMS_PASSWORD=<>

# Notifications (ADR-0001, Phase F2 prep)
LINE_PUSH_BYPASS=true              # until F2 ships
RESEND_API_KEY=<>                  # email fallback

# Payment + finance
PROMPTPAY_ID=<phone-or-tax-id>     # for /wallet/deposit QR
NEXT_PUBLIC_YUAN_RATE=5.00          # admin-edit yuan_rate in `settings` table instead — env is just fallback

# China search (Phase E3-E5)
PACRED_RCGROUP_API_URL=https://rcgroup-th.com/api-china/api-search
PACRED_TAMIT_API_URL=https://tamit-cloud.com/api-product/api-search

# Cron
CRON_SECRET=<random-string>        # protects /api/cron/* routes
```

## 📋 Per-migration notes

### 0006_tos_acceptance.sql — TOS gate
- Adds `tos_accepted_version` + `tos_accepted_at` to profiles
- Bump `CURRENT_TOS_VERSION` in [`lib/tos.ts`](../../lib/tos.ts) when terms change
- The blocking modal lives in `(protected)/layout.tsx`
- **If you see "schema cache" error referencing tos_accepted_*** — this migration didn't run

### 0007_wallet.sql — Wallet
- Auto-creates `wallet` row on profile insert (via trigger)
- Backfills `wallet` rows for existing profiles
- Trigger `wallet_recompute_balance` keeps the three balance columns (main / cashback / credit) in sync with `wallet_transactions` (only `status='completed'` txns count)

### 0009_rates.sql — Rates
- Seeds 10 default `rate_general` rows so the price engine has data on day 1
- Admin replaces these via Supabase Dashboard or the Phase G admin UI

### 0011_service_order.sql — Cart + orders
- 151-item cap on cart_items enforced via trigger (matches legacy `cart.php` hardcoded limit)
- `h_no` format: `O{YYMMDD}-{seq}` from a sequence + trigger
- Payment due in 24 hours (`payment_due_at`); see `/api/cron/auto-cancel-orders` route + `vercel.json` cron schedule `*/15 * * * *`

### 0015_admin_rbac.sql — Admin RBAC
- `admins` table — minimal split from legacy 40+-column tb_admin
- Role codes: `super` | `ops` | `accounting` | `sales_admin` (`super` inherits all)
- `is_admin(text[])` SECURITY DEFINER helper for RLS policies on other tables
- Adds "for all" admin-override policies to ~20 customer-facing tables

**To create the first admin** (replace `<profile-id>` with the target profile uuid):

```sql
-- Grant super-admin (the safest first admin)
insert into public.admins (profile_id, role)
values ('<profile-id>', 'super');
```

Or via Supabase Dashboard → Table Editor → admins → Insert row. Once
inserted, that user's `/admin/*` routes unlock; non-admins still 404.

To find profile ids: `select id, member_code, first_name, phone from profiles;`
