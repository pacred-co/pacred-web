# Setup Guides

คู่มือตั้งค่า service ต่างๆ ที่ Pacred ใช้ — แยกไฟล์ละ service เพื่อให้กลับมาดูทีหลังง่าย

## ▶️ เริ่มที่นี่ก่อน

| ลำดับ | คู่มือ | จำเป็นต้องทำเมื่อ |
|:---:|---|---|
| 1 | [local-development.md](./local-development.md) | เริ่ม dev บน machine ใหม่ |
| 2 | [supabase.md](./supabase.md) | สร้าง project + รัน SQL + ตั้ง auth providers |

## 🔌 OAuth Providers (ทำเมื่อพร้อมเปิดใช้)

| คู่มือ | ใช้เมื่อ |
|---|---|
| [google-oauth.md](./google-oauth.md) | เปิดปุ่ม "Sign in with Google" |
| [facebook-oauth.md](./facebook-oauth.md) | เปิดปุ่ม "Sign in with Facebook" |
| [line.md](./line.md) | เปิดปุ่ม "Sign in with LINE" |

## 📨 SMS / OTP

| คู่มือ | ใช้เมื่อ |
|---|---|
| [thaibulksms.md](./thaibulksms.md) | ปิด `OTP_BYPASS` แล้วใช้ OTP จริงผ่าน SMS |

## 🚀 Deployment

| คู่มือ | ใช้เมื่อ |
|---|---|
| [vercel.md](./vercel.md) | deploy production บน Vercel |

---

## ⚙️ Env vars summary

ดูตัวอย่างที่ [`.env.example`](../../.env.example) — แต่ละค่าได้จากคู่มือไหนระบุไว้ในคอมเมนต์ของไฟล์นั้น

| ตัวแปร | จาก | จำเป็น |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | ✅ ทุก env |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | ✅ ทุก env |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | ✅ ทุก env (server only) |
| `NEXT_PUBLIC_SITE_URL` | คุณกำหนด | ✅ |
| `OTP_BYPASS` | `true` ใน dev / `false` ใน prod | ✅ |
| `OTP_PEPPER` | random 32+ chars | ✅ ใน prod |
| `SMS_PROVIDER` | `thaibulksms` | ใช้เมื่อ bypass=false |
| `THAIBULKSMS_API_KEY` | ThaiBulkSMS | ใช้เมื่อ bypass=false |
| `THAIBULKSMS_API_SECRET` | ThaiBulkSMS | ใช้เมื่อ bypass=false |
| `THAIBULKSMS_SENDER` | ThaiBulkSMS | ใช้เมื่อ bypass=false |
| `LINE_LOGIN_CLIENT_ID` | LINE Dev | ทำเมื่อพร้อม |
| `LINE_LOGIN_CLIENT_SECRET` | LINE Dev | ทำเมื่อพร้อม |

## 📐 Architecture overview

ก่อนเริ่ม config แนะนำให้อ่าน [docs/architecture.md](../architecture.md) — มี:
- High-level architecture (Vercel + Supabase + 3rd-party)
- DB schema + RLS
- Auth flows (sequence diagrams)
- Security model
- 5-phase implementation roadmap
