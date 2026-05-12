# Legacy Schema Reference

CREATE TABLE statements ที่ extract มาจาก `pcsc_main.sql` (MySQL dump 2026-05-12, 321 MB / 1.38M LOC) split ตาม domain เพื่อใช้เป็น **reference** ตอนเขียน Postgres migrations ใน [`supabase/migrations/`](../../supabase/migrations/)

> 📖 **ใช้ยังไง:** อ่านไฟล์ของ domain ที่จะ port → เขียน migration ใหม่ใน `supabase/migrations/NNNN_<name>.sql` โดย apply rename rules ด้านล่าง → **อย่า** copy SQL ตรงๆ (MySQL syntax ≠ Postgres)

## 📦 Domain → Phase mapping

| File | Phase | Tables | สถานะ |
|---|---|---|---|
| [01_auth.sql](01_auth.sql) | B (Customer Core) | users + register + corporate + OTP + terms | 🟡 มี profiles base แล้ว — extend |
| [02_address.sql](02_address.sql) | B | address + main (default) + soft-delete | 🔴 ยังไม่มี |
| [03_wallet.sql](03_wallet.sql) | C (Wallet) | wallet + history + cash_back + credit | 🔴 ยังไม่มี |
| [04_service-order.sql](04_service-order.sql) | E (Service-Order) | cart + header + items + promotion | 🔴 ยังไม่มี |
| [05_service-import.sql](05_service-import.sql) | D (Service-Import — ใหญ่สุด) | forwarder + item + img + log | 🔴 ยังไม่มี |
| [06_service-payment.sql](06_service-payment.sql) | C | payment (Alipay) | 🔴 ยังไม่มี |
| [07_sales.sql](07_sales.sql) | F (Sales referral) | user_sales + commissions | 🔴 ยังไม่มี |
| [08_notifications.sql](08_notifications.sql) | F | notify ledger | 🔴 ยังไม่มี ([ADR-0001](../decisions/0001-line-notify-replacement.md)) |
| [09_search.sql](09_search.sql) | E | product cache + 1688/Taobao API | 🔴 ยังไม่มี |
| [10_rates.sql](10_rates.sql) | D | rate tables (G/VIP/Custom × KG/CBM) + settings | 🔴 ยังไม่มี — **D ใช้ตัวนี้** |
| [11_accounting.sql](11_accounting.sql) | D/E | bills + receipts + shop_pay | 🔴 ยังไม่มี |
| [20-27_*.sql](.) | G (Admin) | admin / containers / forwarder-ops / org / TAS / SMS / withdrawals / utils | ⏳ ยังไม่เริ่ม |
| [_deprecated.sql](_deprecated.sql) | — | time-bound promos / surveys / typo tables | ❌ **อย่า** port |

## 🔧 Rename rules ตอนเขียน Postgres migration

**ใช้ทุก migration** (per A3 hybrid strategy ใน [CLAUDE.md](../../CLAUDE.md))

### 1. Table names
- ✂️ **Drop `tb_` prefix** — `tb_users` → `users` (ไม่ต้องมี — แต่ `users` ชนกับ Supabase auth.users → ใช้ `profiles` แทน), `tb_address` → `addresses`, `tb_wallet` → `wallet`, etc.
- ✂️ **Drop `_hs` suffix** (= history) → `wallet_history`, `cash_back_history`
- ✂️ **Drop `_h`/`_sub` pair** → ใช้ table เดียวกับ FK (e.g. `tb_header_order` + `tb_order` → `orders` + `order_items`)
- 🔁 **Pacred branding:**
  - `tb_pcs_logged` → **ทิ้ง** (Supabase JWT ทดแทน)
  - `tb_account_pcs` → `account` หรือ skip ถ้าไม่จำเป็น
  - คำว่า "PCS" ทุกที่ใน column names / defaults / comments → "Pacred" หรือ rename ตาม context

### 2. Column names
- snake_case ทั้งหมด — `userID` → `id`, `userTel` → `phone`, `userName` → `first_name`, `userLastName` → `last_name`
- ตัด `user`/`tb_` prefix ที่ซ้ำกับ table name — `tb_address.addrName` → `addresses.name`

### 3. PCS strings ที่ต้อง rename (ระวัง — flagged ใน dump)

| Found | ที่ไหน | เปลี่ยนเป็น |
|---|---|---|
| `coID DEFAULT 'PCS'` | tb_users, tb_register | `coID DEFAULT 'PR'` หรือ rename column → `customer_group_id` ที่ FK ไปยัง `customer_groups` table |
| `rID` format `PCS221002-1` | tb_receipt (rID) | `PR{YYMMDD}-{seq}` หรือ keep แต่ generate ใหม่ |
| `userRegisterWith` enum `PCS/F/L` | tb_users | คงค่า enum ไว้ ('PCS' = email, 'F' = facebook, 'L' = line) ตามที่ port code ใช้ — หรือ rename enum value 'PCS' → 'EMAIL' |
| `member_code` (legacy `PCS<int>`) | tb_users.userID | **ทิ้ง** — Pacred ใช้ `PR00001` running (locked decision A1) |
| `smPCS` column | tb_user_sales | rename หรือ keep (internal sales linkage field) |

### 4. Type translations (MySQL → Postgres)

| MySQL | Postgres |
|---|---|
| `int(N)` (display width) | `integer` (drop width) |
| `tinyint(1)` | `boolean` |
| `varchar(1)` flag '0'/'1' | `boolean` (ตอน migrate ดึงข้อมูล cast) |
| `datetime` | `timestamptz` |
| `text` | `text` |
| `decimal(N,M)` | `numeric(N,M)` |
| `bigint(20) NOT NULL AUTO_INCREMENT` | `bigint generated always as identity` หรือ `uuid` |
| `ENGINE=InnoDB DEFAULT CHARSET=utf8` | — (Postgres ไม่มี) |
| `COLLATE=utf8_general_ci` | — (use `LC_COLLATE` ที่ DB level) |

### 5. ที่ต้องเพิ่ม (ไม่มีใน legacy)
- 🔒 **RLS policies** — owner-only ทุก customer-facing table
- 🔗 **FK constraints** — legacy ไม่มี FK (relations เป็น implicit) → add `REFERENCES` ทุกที่
- 📇 **Indexes** — เฉพาะ FK + columns ที่ใช้ใน WHERE/ORDER BY
- 🕐 **Auto `created_at` / `updated_at`** — ใช้ trigger หรือ default

## 🚨 Critical concerns (อย่าลืม)

ดู [CLAUDE.md § Critical migration concerns](../../CLAUDE.md) เต็มๆ — ที่กระทบ A4:

| # | Issue | กระทบ legacy-schema |
|---|---|---|
| 1 | `pass_tam()` symmetric hash | `tb_users.userPass` ไม่ port — force reset |
| 4 | member_code `PCS<int>` | **ทิ้ง** — Pacred ใช้ PR00001 ใหม่ |
| 5 | ไม่มี FK constraints | ทุกๆ migration ต้องเพิ่ม FK ใหม่ |
| 6 | `pcs_logged` 10ปี cookie | ทิ้ง — Supabase JWT |
| 7 | shared admin tables (settings/rate/co/admin) | coordinate กับ admin-side port |
| 11 | Sales whitelist hardcoded `PCS888/2000/352/2678/4155` | สร้าง `team_leaders` table |
| 12 | OTP gateways x3 | consolidate → ThaiBulkSMS (ดู `lib/sms/`) |
| 15 | RBAC inline tuple | redesign → roles + role_permissions |
| 16 | Cross-DB write `pcscafym_main` | ตัดออก (notify.php) |

## 📊 Stats

- **Total tables in dump:** 112 (excluding system)
- **Customer-side (Phase B–F):** 58 tables across 11 files
- **Admin-side (Phase G):** 48 tables across 8 files
- **Deprecated (skip):** 8 tables in 1 file

## 🔍 ตัวอย่างใช้งาน

ตอนเขียน Phase B1 migration (`supabase/migrations/0003_profiles_extended.sql`):
1. เปิด [01_auth.sql](01_auth.sql) ดู `tb_users` columns
2. List columns ที่ขาดใน profiles (เทียบกับ [supabase/schema.sql](../../supabase/schema.sql))
3. เขียน `ALTER TABLE profiles ADD COLUMN ...` ตาม rename rules ข้างบน
4. เพิ่ม RLS policies + indexes

## 🗑️ การล้างข้อมูลใน A4

ไฟล์ source dump (`C:\Users\devvork\Desktop\pcsc_main.sql`) **ไม่ commit ขึ้น git** — ขนาด 321 MB และมี sensitive data
ไฟล์ใน `docs/legacy-schema/` คือ pure DDL (CREATE TABLE only) — ปลอดภัย, ไม่มี INSERT data
