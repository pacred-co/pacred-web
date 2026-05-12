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
     'cart_items','service_orders','service_order_items','promotions','promotion_applications'
   )
 order by table_name;
```

ควรได้ **24 rows** ครบ — ถ้าได้น้อยกว่า แสดงว่า migration บางตัวยังไม่ได้รัน

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
