# Supabase Setup

วิธีสร้าง Supabase project + ตั้งค่าให้ Pacred ใช้งานได้

## 1. Create project

1. ไป <https://app.supabase.com>
2. กด **New project**
3. ตั้งค่า:
   - **Name:** `pacred-web` (หรือชื่ออะไรก็ได้)
   - **Database Password:** สร้างรหัสแข็งแรง — เก็บไว้ดีๆ (ใช้ตอน connect database โดยตรง)
   - **Region:** **Singapore (ap-southeast-1)** ← ใกล้ไทยที่สุด ความเร็วดีสุด
   - **Plan:** Free tier เพียงพอตอน dev (500MB DB, 1GB Storage, 50K MAU)
4. รอ ~2 นาที จน project พร้อม

## 2. Get API keys

หลัง project พร้อมแล้ว → **Project Settings** (ฟันเฟือง ซ้ายล่าง) → **API**

จดค่า 3 ตัว:

| Field ใน Supabase | ใส่ใน `.env.local` |
|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **Project API keys → `anon` `public`** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Project API keys → `service_role` `secret`** | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ **service_role key bypass RLS ทั้งหมด** — ห้ามให้รั่วใน client code, ห้าม commit, ห้ามใช้ใน `"use client"` component

## 3. Run database migrations

ไปที่ **SQL Editor → New query** แล้วรัน 2 ไฟล์เรียงตามลำดับ:

### 3.1 Initial schema
Copy เนื้อหาจาก [`supabase/schema.sql`](../../supabase/schema.sql) วาง → กด **Run**

จะสร้าง:
- 3 tables: `profiles`, `documents`, `otp_codes`
- Sequence + trigger สำหรับ `member_code` (PR001 — PR + ขั้นต่ำ 3 หลัก)
- Trigger `set_updated_at`
- RLS policies (own-rows สำหรับ profiles, documents)
- Storage bucket `member-docs` (private) + storage policies

### 3.2 Orders demo (optional แต่แนะนำให้รันเพื่อทดสอบ pattern)
Copy [`supabase/migrations/0002_orders.sql`](../../supabase/migrations/0002_orders.sql) → Run

จะสร้าง table `orders` พร้อม RLS

### 3.3 Verify

ไปที่ **Table Editor** ควรเห็น 4 tables (`profiles`, `documents`, `otp_codes`, `orders`)
ไปที่ **Storage** ควรเห็น bucket `member-docs`
ไปที่ **Database → Roles** หรือ **Authentication → Policies** ควรเห็น RLS = enabled พร้อม policies

## 4. Configure Auth

### 4.1 Email provider
**Authentication → Providers → Email**
- Enable: ✅ ON (default)
- **Confirm email:** ❌ OFF (ตามตัดสินใจ — ให้ user เข้าใช้ได้เลย)
- Secure email change: ตามใจ

### 4.2 Phone provider
**Authentication → Providers → Phone**
- Enable: ✅ ON
- ⚠️ ไม่ต้องตั้ง Twilio/MessageBird — เราใช้ ThaiBulkSMS เอง โดยส่งผ่าน `admin.createUser({ phone, phone_confirm: true })` ที่ผ่าน Supabase phone provider แต่ skip การส่ง SMS ของ Supabase

### 4.3 OAuth providers (ทำเมื่อพร้อม)
- **Google:** ดู [google-oauth.md](./google-oauth.md)
- **Facebook:** ดู [facebook-oauth.md](./facebook-oauth.md)
- **LINE:** ดู [line.md](./line.md) (ใช้ custom OIDC)

### 4.4 Redirect URLs
**Authentication → URL Configuration**

| Field | Value |
|---|---|
| **Site URL** | `http://localhost:3000` (dev) / `https://your-domain.com` (prod) |
| **Redirect URLs** (allow list) | `http://localhost:3000/auth/callback`<br>`http://localhost:3000/**`<br>`https://your-domain.com/auth/callback`<br>`https://your-domain.com/**` |

## 5. Verify with the app

1. ใส่ Supabase URL + 2 keys ใน `.env.local`
2. `pnpm dev`
3. ไป `/register` → กรอกฟอร์ม Personal → submit
4. กลับ Supabase Dashboard → **Authentication → Users** เห็น user ใหม่
5. **Table Editor → profiles** เห็น row พร้อม `member_code = PR001`

## ⚙️ Common operations

### ลบ test users
**Authentication → Users → Select → Delete** (cascade ลบ profile + documents + orders ด้วย)

หรือ SQL:
```sql
delete from auth.users where email like '%test%';
```

### Reset member_code sequence (เริ่ม PR001 ใหม่)
```sql
alter sequence public.member_code_seq restart with 1;
```

### View RLS policies
```sql
select * from pg_policies where schemaname = 'public';
```

### Backup data ก่อน destructive change
```sql
create table profiles_backup as select * from profiles;
```

## 🔄 Updating schema

เพิ่ม migration ใหม่ที่ `supabase/migrations/00NN_<description>.sql` — รันใน SQL Editor

ในอนาคตเมื่อใช้ Supabase CLI:
```bash
npx supabase init
npx supabase link --project-ref <ref>
npx supabase db push
```

## 🆘 Troubleshooting

### "permission denied for table profiles"
- RLS policy ไม่ถูกต้อง หรือยังไม่ได้รัน schema.sql

### "duplicate key value violates unique constraint profiles_member_code_key"
- Sequence trigger ยังไม่ทำงาน — ตรวจว่ารัน schema.sql ครบ

### "relation auth.users does not exist"
- Auth not enabled — ปกติเปิด default. ถ้าไม่: SQL `select count(*) from auth.users`

### Token refresh ไม่ทำงาน
- ตรวจ `proxy.ts` middleware
- ตรวจ env vars ถูก project (มี typo ใน URL?)
- เปิด DevTools → Application → Cookies → ดูว่ามี `sb-*` cookies
