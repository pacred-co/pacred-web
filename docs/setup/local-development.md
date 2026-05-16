# Local Development Setup

วิธีเริ่ม dev environment บนเครื่องใหม่

## Requirements

- **Node.js** 20.x+ (แนะนำ ใช้ `nvm` หรือ `fnm` จัดเวอร์ชัน)
- **pnpm** 9+ — `npm i -g pnpm`
- **Git**
- บัญชี Supabase (ฟรี) — ดู [supabase.md](./supabase.md)

## Steps

### 1. Clone + install

```bash
git clone <repo-url> pacred-web
cd pacred-web
pnpm install
```

### 2. Setup env vars

```bash
cp .env.example .env.local
```

แก้ค่าใน `.env.local` ตามแต่ละ service:
- Supabase keys → ดู [supabase.md](./supabase.md) → Step "Get API keys"
- ThaiBulkSMS keys → ดู [thaibulksms.md](./thaibulksms.md) (ข้ามได้ถ้า `OTP_BYPASS=true`)
- LINE keys → ดู [line.md](./line.md) (ข้ามได้)

ค่าที่ต้องใส่อย่างน้อย (เพื่อให้ dev ทำงาน):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
- `OTP_BYPASS=true`
- `OTP_PEPPER=<any-random-string>`

### 3. Setup Supabase project

ทำตาม [supabase.md](./supabase.md):
1. สร้าง project
2. รัน SQL `supabase/schema.sql`
3. รัน SQL `supabase/migrations/0002_orders.sql`
4. ตั้ง Auth providers (เปิด Email + Phone)

### 4. Run dev server

```bash
pnpm dev
```

เปิด <http://localhost:3000> — ภาษาไทย default; <http://localhost:3000/en> สำหรับ English

## Useful commands

| Command | Description |
|---|---|
| `pnpm dev` | dev server (hot reload) |
| `pnpm build` | production build |
| `pnpm start` | start production build (ต้อง `pnpm build` ก่อน) |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | TypeScript check |

## Test the auth flow (with OTP_BYPASS)

1. ไป `/register` → tab "บุคคลธรรมดา"
2. กรอกฟอร์ม + กด "สมัครสมาชิก" — OTP จะถูก bypass
3. หลัง register จะ redirect ไป `/` พร้อม session cookie
4. คลิก avatar (มุมขวาบน) → "แดชบอร์ด" → เห็นข้อมูลตัวเอง + member_code (PR001)
5. คลิก "ออเดอร์ของคุณ" → สร้างออเดอร์ทดสอบ
6. กลับ Supabase → SQL Editor → `select * from auth.users`, `select * from profiles`, `select * from orders`

## Troubleshooting

### `Cannot find module '@supabase/...'`
- รัน `pnpm install` ใหม่

### "Invalid login credentials" ทุกครั้งแม้รหัสถูก
- ตรวจ `.env.local` ว่าใส่ Supabase URL + keys ถูก project
- เปิด Supabase Dashboard → Auth → Providers → Email = enabled

### `proxy.ts` middleware error
- เช็คว่า `NEXT_PUBLIC_SUPABASE_URL` เป็น URL จริง (https://xxx.supabase.co)

### Hot reload ไม่ทำงาน
- ปิด-เปิด `pnpm dev` ใหม่
- เคลียร์ `.next/` cache: `rm -rf .next && pnpm dev`

### `EADDRINUSE :::3000`
- มี process อื่นใช้พอร์ต 3000 อยู่ — `lsof -i :3000` หา PID แล้ว `kill <pid>`
- หรือเปลี่ยนพอร์ต: `pnpm dev --port 3001`
