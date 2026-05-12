# ADR-0001 — LINE Notify Replacement

**Status:** Accepted
**Date:** 2026-05-12
**Phase:** A2 (Foundation)
**Owner:** ก๊อต (pending review on `dave` branch)

---

## Context

PHP เดิม (`pcscargo/member`) ส่ง notification ทุกชนิด (order updates, payment confirmation, sales alerts, admin pings) ผ่าน **LINE Notify** (`tb_users.userLineNotify` token + `tb_notify` history)

LINE Notify **EOL ไปแล้ว 2025-04-01** — token เก่าจะใช้ไม่ได้, ไม่มี API ใหม่
→ ต้องเลือก replacement **ก่อน** port โมดูล notification (Phase F2) เพราะทุก action ใน Phase B–E ที่ trigger notification ต้องเรียก interface เดียวกัน

## Constraints

- ต้องส่งได้ทั้ง **per-user push** (order status, payment receipt) และ **group/admin broadcast** (sales alert, oncall)
- Cost: น้อยที่สุด — Pacred ยังเป็น early-stage, ไม่ต้องการ infra burden
- ลูกค้าไทย ~95% ใช้ LINE — ห้ามตัดทิ้ง LINE channel
- มี **LINE OA อยู่แล้ว** ([@pacred](https://lin.ee/Yg3fU0I)) → leverage ได้ฟรี
- Dev workflow: bypass-able ใน local (เหมือน `OTP_BYPASS=true`)

## Options Considered

| # | Option | Pros | Cons | Verdict |
|---|---|---|---|---|
| 1 | **LINE Messaging API push** (ผ่าน LINE OA) | leverage OA ที่มีอยู่; per-user push ตอน user เป็น friend แล้ว; ภายใน 500 msg/m ฟรี; supports rich messages (Flex) | ต้อง map Supabase user ↔ LINE userId (link flow); 200 msg/m ฟรีบน OA Lite Plan, หลังจากนั้น 0.15-0.30 THB/msg | ✅ **เลือก** |
| 2 | LINE Notify token (ตัวเก่า) | code เดิม port ตรงๆ | EOL แล้ว, token ไม่ออก | ❌ ใช้ไม่ได้ |
| 3 | Web Push (browser/PWA) | free, no vendor lock-in | คนไทยไม่ได้เปิด PWA นิสัย; iOS Safari support เพิ่งมา iOS 16.4 | ❌ user reach แคบ |
| 4 | Email (Resend / Supabase) | free 3K/m, audit trail ดี | ลูกค้าไทยไม่ค่อยเปิด email; latency สูง | 🟡 **fallback only** |
| 5 | Discord/Telegram bot | free, easy | ลูกค้าทั่วไปไม่ใช้ | ❌ |
| 6 | SMS (ThaiBulkSMS) | 100% delivery | $$ ต่อ msg, ใช้แค่ OTP จะดีกว่า | ❌ overkill |

## Decision

**Primary:** LINE Messaging API push ผ่าน Pacred LINE OA ([@pacred](https://lin.ee/Yg3fU0I))
**Fallback:** Email digest (ผ่าน Resend หรือ Supabase Auth's built-in mailer)
**Bypass:** `LINE_PUSH_BYPASS=true` ใน `.env.local` → log ลง console แทน push จริง (ตามแบบ `OTP_BYPASS`)

### User linking flow
1. User กด "เชื่อม LINE" ใน `(protected)/profile/`
2. Redirect ไป LINE Login (ใช้ channel เดียวกับ login flow ใน [docs/setup/line.md](../setup/line.md))
3. Callback → save `line_user_id` ลง `profiles` table
4. ตั้งแต่ตอนนั้น notification ส่งผ่าน LINE Messaging API push (มี `line_user_id`) หรือ email (ถ้าไม่มี / failed)

### Group broadcast (sales / admin)
- ใช้ **LINE Group webhook** (admin invite bot เข้า group) — Phase G (admin)
- ไม่ใช่ blocker สำหรับ customer-side

## Implementation Notes (สำหรับ Phase F2)

```
lib/notifications/
├─ types.ts                # NotificationPayload, NotificationChannel
├─ index.ts                # send(userId, payload) — main entry
├─ channels/
│  ├─ line-push.ts         # LINE Messaging API push
│  ├─ email.ts             # Resend / Supabase mailer
│  └─ bypass.ts            # console.log for dev
└─ templates/              # Flex Message JSON + email HTML
   ├─ order-status.ts
   ├─ payment-confirmed.ts
   └─ ...

profiles table additions:
- line_user_id (text, nullable, unique)
- line_linked_at (timestamptz, nullable)
- notify_channels (jsonb default '{"line":true,"email":true}')
```

### Env vars (production)
```
LINE_CHANNEL_ID=2007xxxxxx
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...        # long-lived from console
LINE_PUSH_BYPASS=false               # true in local
RESEND_API_KEY=re_...                # for email fallback
```

### Cost projection
- 1000 active users × 5 push/m = 5000 msg/m
- LINE Messaging API: ฟรี 200/m → ต้องอัพ Light Plan (1300 THB/m = 5000 msg/m) ตอน users >40
- Email fallback: Resend free 3000/m, ใช้ได้ถึง 600 users

## Migration of legacy data
- `tb_users.userLineNotify` (LINE Notify token) → **ทิ้ง** (ใช้ไม่ได้แล้ว)
- `tb_notify` history → **ไม่ migrate** (เริ่มใหม่ตาม Pacred event log)
- ลูกค้าเก่าทุกคนจะเห็น banner "เชื่อม LINE ใหม่อีกครั้ง — เปลี่ยนระบบ" หลัง login

## Open questions (ค้างไว้ตอน Phase F2)
- ใช้ Resend (paid, simpler) หรือ Supabase built-in (free, ผูกกับ Auth)?
- Email template engine: react-email หรือ inline HTML?
- Retry/queue: pg_cron table? Inngest? BullMQ?
- Quiet hours / user notification preferences?

## References
- [LINE Notify EOL announcement](https://notify-bot.line.me/closing-announce) (ja/en)
- [LINE Messaging API docs](https://developers.line.biz/en/docs/messaging-api/)
- [docs/setup/line.md](../setup/line.md) — Login channel (reuse provider)
- [CLAUDE.md](../../CLAUDE.md) — section "Critical migration concerns" #2
