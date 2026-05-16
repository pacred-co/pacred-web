# LINE LIFF — create + set ID step-by-step (DV-2)

> **Purpose:** สร้าง LIFF app บน LINE Developer Console + ตั้ง `NEXT_PUBLIC_LIFF_ID` ใน Vercel เพื่อปลดล็อค **customer→profile linkage** ที่หน้า `/liff/link`. ใช้เวลา ~15-25 นาที. ทำครั้งเดียวพอ.
>
> **Status (2026-05-16):** LINE Messaging API channel มีแล้ว (Channel ID `2009931373`); creds ครบใน `.env.local` ของเดฟ. **เหลือแค่สร้าง LIFF app + เอา ID มาใส่ Vercel**. ทำตามคู่มือนี้เสร็จ → flip `LINE_PUSH_BYPASS=false` → ลูกค้าได้รับ LINE push.
>
> **Companion docs:** [`docs/setup/line.md`](line.md) (LINE Login OAuth — separate task LP-3) · [`docs/env.md`](../env.md) §7 (LINE Messaging + LIFF env vars) · [`docs/decisions/0001-line-notify-replacement.md`](../decisions/0001-line-notify-replacement.md).

---

## ทำไมต้องทำ?

Pacred customer notification chain ต้องการ:

```
Pacred event (order paid / shipped / receipt ready) 
   ↓
sendNotification(profile_id, ...)
   ↓
lib/notifications/index.ts reads profiles.line_user_id
   ↓
POST api.line.me/v2/bot/message/push  ← LINE OA pushes to customer
```

**Pacred LINE Messaging API token พร้อมแล้ว** — แต่ `profiles.line_user_id` เป็น `NULL` ในทุกลูกค้าจนกว่าจะลิงค์ LINE. **LIFF (`/liff/link`) คือทางเดียว** ที่ลูกค้าใช้ลิงค์เข้ามา. ไม่มี LIFF ID = ทุก push ลูกค้า = silent no-op.

---

## Pre-flight checklist

- [ ] เข้าถึง LINE Developer Console ได้: <https://developers.line.biz/console>
- [ ] รู้ credentials ของ Pacred LINE Business account (เจ้าของ provider ที่มี Channel `2009931373`)
- [ ] รู้ production URL ของ Pacred — `https://pacred.co` หรือ `https://pacred.co.th` (ใช้ตัวที่เป็น **canonical** หลัง Vercel deploy)
- [ ] เข้าถึง Vercel project ได้ (เพื่อตั้ง env var)

---

## Step 1 — เปิด LINE Developer Console

1. ไป <https://developers.line.biz/console>
2. ล็อกอินด้วย LINE Business account (Pacred owner / admin)
3. หา **Provider** ที่มี Channel `2009931373` (Pacred Messaging API)

> ⚠️ ถ้า login แล้วเห็นหลาย provider — เลือก provider ที่เป็นของ Pacred (ไม่ใช่ของบริษัทเก่า PCS Cargo / ไอแต้ม). ดูชื่อ provider ก่อนเข้า.

---

## Step 2 — เลือก Messaging API channel

1. ใน provider → คลิก **channel `2009931373`** (ชื่อแสดงเป็น "Pacred" หรือคล้ายๆ; ประเภทคือ "Messaging API")
2. เข้า channel detail page

---

## Step 3 — สร้าง LIFF app

1. แท็บด้านบน → คลิก **LIFF**
2. กด **Add** (มุมขวาบน)
3. กรอกข้อมูล:

| Field | ค่า | หมายเหตุ |
|---|---|---|
| **LIFF app name** | `Pacred — เชื่อมบัญชี` | ชื่อนี้แสดงตอนลูกค้า authorize |
| **Size** | **Compact** | หน้า `/liff/link` เล็ก — ไม่ต้องเต็มจอ |
| **Endpoint URL** | `https://pacred.co/liff/link` | ⚠️ ใส่ domain ของ prod ให้ตรง (ใช้ `https://`); ถ้า canonical domain คือ `pacred.co.th` ใส่ตัวนั้น |
| **Scope** | ✅ `profile` · ✅ `openid` | `profile` = ได้ userId + displayName + pictureUrl · `openid` = ได้ id_token (จำเป็นสำหรับ Pacred linkage). ไม่ต้องติ๊ก `email` (เราไม่ใช้). |
| **Bot link feature** | **ON (Aggressive)** | เปิด → ลูกค้าเปิด LIFF จะ auto-add Pacred OA เป็นเพื่อนทันที. **สำคัญมาก** — ไม่งั้นต้อง add เอง |
| **Scan QR** | ไม่ต้องเปิด | เราไม่ใช้ QR scanner ในหน้านี้ |
| **Module mode** | ไม่ต้องเปิด | |

4. กด **Add** → LINE Console สร้าง LIFF app + ออก **LIFF ID** ให้ (format: `1234567890-AbcDeFGh` หรือ `<channel_id>-<random>`)

> 💡 **Endpoint URL ต้อง HTTPS** — Vercel deploy เป็น HTTPS อยู่แล้ว ไม่ต้องตั้งค่าเพิ่ม. ถ้ายังไม่ deploy prod ให้ใช้ Vercel preview URL ก่อน (เช่น `https://pacred-web-<hash>.vercel.app/liff/link`) แล้วค่อยกลับมาแก้ตอน deploy `pacred.co` จริง

> ⚠️ **อย่าใส่ trailing slash** — `https://pacred.co/liff/link` ✅ · `https://pacred.co/liff/link/` ❌ (บาง LIFF SDK เวอร์ชันคำนวณ redirect ผิด)

---

## Step 4 — คัดลอก LIFF ID

1. ใน LIFF list → คลิก app ที่เพิ่งสร้าง
2. ดู **LIFF ID** ในหน้า detail (รูปแบบ `<channel_id>-<8 chars>`)
3. คัดลอก ID นี้ (เช่น `2009931373-AbCdEf12`)

---

## Step 5 — ตั้ง `NEXT_PUBLIC_LIFF_ID` ใน Vercel

1. ไป Vercel Dashboard → Pacred project → **Settings → Environment Variables**
2. กด **Add New**
3. กรอก:
   - **Name:** `NEXT_PUBLIC_LIFF_ID`
   - **Value:** ค่า LIFF ID ที่คัดลอกมา
   - **Environments:** ✅ Production · ✅ Preview · ✅ Development
4. Save
5. **Redeploy** (Deployments → latest → ⋯ → Redeploy) เพื่อให้ env เข้า build

> ⚠️ **`NEXT_PUBLIC_` prefix สำคัญ** — เพราะ LIFF ID ต้องอยู่ใน client bundle เพื่อให้ `liff.init({ liffId })` ทำงานได้

---

## Step 6 — ทดสอบ

### 6.1 — เปิด LIFF URL บน LINE mobile app

1. เปิด LINE บนมือถือ
2. แชทกับตัวเอง (กลุ่ม Keep Memo / Notes ของ LINE)
3. ส่ง URL: `https://liff.line.me/<LIFF_ID>` (เช่น `https://liff.line.me/2009931373-AbCdEf12`)
4. คลิก URL ที่ส่ง

### 6.2 — Expected behavior

1. LINE เปิด LIFF browser embed
2. หน้า `/liff/link` โหลด (อาจจะ redirect ไป `/login` ถ้ายังไม่ได้ login กับ Pacred — ลูกค้าต้อง login ก่อน)
3. กดผ่าน LINE authorize prompt
4. หน้า `/liff/link` เรียก `liff.init()` + `liff.getProfile()` → ได้ LINE userId
5. POST ไป `actions/profile.ts::linkLineAccount` → เซฟลง `profiles.line_user_id`
6. หน้าโชว์ "✅ เชื่อมบัญชี LINE เรียบร้อย"

### 6.3 — Verify ฝั่ง DB

```sql
-- ใน Supabase SQL editor
select id, member_code, first_name, line_user_id, line_linked_at
from profiles
where line_user_id is not null
order by line_linked_at desc
limit 5;
```

ถ้าเห็น row ที่ `line_user_id` ไม่ null และ `line_linked_at` เป็นเวลาล่าสุด → ✓ ลิงค์สำเร็จ.

### 6.4 — Test push

1. ใน Supabase SQL editor → trigger notification:
   ```sql
   -- หรือใช้ /admin UI ที่ ภูม build แล้ว
   select sendNotification(...) -- function ที่ lib/notifications/index.ts wraps
   ```
2. ลูกค้าควรได้รับข้อความใน LINE ภายในไม่กี่วินาที (สมมติ `LINE_PUSH_BYPASS=false`)

---

## Step 7 — Flip `LINE_PUSH_BYPASS=false` (production)

หลังจาก LIFF ทำงาน + มีลูกค้า test ลิงค์สำเร็จ:

1. Vercel → Settings → Environment Variables
2. หา `LINE_PUSH_BYPASS` (ถ้ามี — อาจไม่ได้ตั้งไว้)
3. ถ้าไม่มี → **Add New** ตั้งเป็น `false` (Production environment)
4. ถ้ามี + เป็น `true` → แก้เป็น `false`
5. Redeploy

> 💡 ใน dev (`.env.local`) ปกติ `LINE_PUSH_BYPASS=true` เพื่อไม่ spam test users. **ห้าม commit ค่า false ลง git** — ใช้ Vercel env (prod-only) เท่านั้น

---

## ปอน follow-up — wire CTAs

หลัง LIFF live แล้ว — ปอน wire ปุ่ม "เพิ่ม LINE OA + เชื่อมบัญชี" ที่:
- `/profile` page (ลูกค้าที่ login แล้ว สามารถลิงค์ได้)
- Landing pages (rich menu / CTA สำหรับลูกค้าที่ยังไม่ลิงค์)
- Email/SMS notifications (call-to-action: "เชื่อม LINE เพื่อรับการแจ้งเตือนเร็วขึ้น")

URL ที่ใช้ใน CTA: `https://liff.line.me/<LIFF_ID>` (ตรงๆ — LINE auto-routing ถ้าลูกค้าเปิดบน mobile = เปิดใน LINE app, บน desktop = redirect ไป LINE Web)

---

## 🆘 Troubleshooting

### LIFF page โหลดแล้ว blank
- เช็ค browser DevTools Console — `liff.init()` error?
- **มักเกิดจาก:** `NEXT_PUBLIC_LIFF_ID` ไม่ได้ตั้ง / สะกดผิด / ลืม redeploy
- Fix: verify env var → redeploy

### "LIFF endpoint URL doesn't match"
- Endpoint URL ที่ LINE Console ต้องตรงกับ URL ที่ลูกค้าเปิดทุกตัวอักษร (รวม `https://` + domain + path)
- ถ้า canonical คือ `pacred.co.th` แต่ LIFF endpoint ตั้งเป็น `pacred.co` → LINE ปฏิเสธ
- Fix: ตรวจ `next.config.ts` redirects + Vercel canonical domain → match ใน LIFF Console

### `liff.getProfile()` returns null
- ลูกค้า cancel ตอน authorize prompt
- หรือ scope ที่ตั้งไม่ครอบ `profile`
- Fix: re-check Scope ใน LIFF Console + force re-login (`liff.logout()` + reload)

### Push ไม่ส่ง (ลูกค้าลิงค์แล้วแต่ไม่ได้รับ)
- เช็ค `LINE_PUSH_BYPASS` — ถ้าเป็น `true` push จะ log only ไม่ส่งจริง
- เช็ค `LINE_CHANNEL_ACCESS_TOKEN` ใน Vercel — ต้องไม่ expire (long-lived tokens อายุ 30 วัน — set ใหม่ใน Console ถ้าใกล้หมด)
- เช็ค LINE OA → Settings → **Response settings → "Reply messages: Enabled" / "Push messages: Enabled"** (LINE OA หลายตัว default ปิด push)
- เช็ค `lib/notifications/index.ts` log → ดู error response จาก LINE API (มัก 401 = token / 403 = OA setting / 400 = userId ผิด)

### "ลูกค้าเปิด LIFF แต่ไม่ได้ add OA เป็นเพื่อน"
- Bot link feature ปิดอยู่ → กลับไปแก้ที่ LIFF Console → set **ON (Aggressive)**

### LIFF ID format ผิด
- LIFF ID ต้องมี format `<10-digit channel id>-<8 chars>` เช่น `2009931373-AbCdEf12`
- ถ้าเห็นแค่ `AbCdEf12` (ไม่มี channel prefix) → คัดลอก ID ผิด — ดู detail page ของ LIFF app

---

## 📚 References

- LIFF SDK docs: <https://developers.line.biz/en/docs/liff/overview/>
- LIFF v2 API reference: <https://developers.line.biz/en/reference/liff/>
- Messaging API push docs: <https://developers.line.biz/en/docs/messaging-api/sending-messages/>
- Pacred LINE Notify replacement decision: [`docs/decisions/0001-line-notify-replacement.md`](../decisions/0001-line-notify-replacement.md)
- Pacred env reference: [`docs/env.md`](../env.md) §7

---

## Acceptance — when is this task done?

- [ ] LIFF app สร้างใน Pacred Messaging API channel
- [ ] LIFF ID copy แล้ว
- [ ] `NEXT_PUBLIC_LIFF_ID` ตั้งใน Vercel (Production + Preview + Dev)
- [ ] Vercel redeploy
- [ ] เปิด `https://liff.line.me/<LIFF_ID>` บน LINE mobile → หน้า `/liff/link` mount ได้
- [ ] Test linkage flow → `profiles.line_user_id` เซฟลง DB
- [ ] `LINE_PUSH_BYPASS=false` ใน Vercel (production)
- [ ] Test push: trigger notification → ลูกค้าได้รับใน LINE OA chat
- [ ] บอก ปอน → wire CTAs ที่ `/profile` + landing

**Estimated total: ~25-40 นาที** (10m console + 5m env + 5m verify + 5-20m troubleshoot ถ้ามี)

**Owner:** เดฟ (Pacred LINE account access). **Tracker:** PORT_PLAN Part T D-1-LIFF / DV-2.
