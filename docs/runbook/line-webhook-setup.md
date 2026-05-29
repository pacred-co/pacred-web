# 🟢 LINE OA inbound webhook — setup + verify runbook

**Updated:** 2026-05-29 (ปอน · InwPond007) · **Scope รอบนี้:** เก็บข้อความขาเข้าจาก LINE OA เท่านั้น (ยังไม่มี Inbox UI / ปุ่มตอบกลับ / FB-IG / AI auto-reply)

รับข้อความลูกค้าจาก LINE Official Account → verify ลายเซ็น → เก็บลง 4 table ใหม่ (migration `0131_line_oa_inbox.sql`). ไม่แตะ table เดิมใด ๆ.

| ส่วนประกอบ | ที่อยู่ |
|---|---|
| Migration (4 tables) | [`supabase/migrations/0131_line_oa_inbox.sql`](../../supabase/migrations/0131_line_oa_inbox.sql) |
| Webhook endpoint | [`app/api/webhooks/line/route.ts`](../../app/api/webhooks/line/route.ts) → `POST /api/webhooks/line` |
| Env docs | [`.env.example`](../../.env.example) (บล็อก "LINE OA inbound webhook") |

ตารางที่สร้าง: `customers_line` (1 row/ลูกค้า + สถิติ) · `line_messages` (ทุกข้อความ) · `line_webhook_events` (raw payload debug/replay) · `line_lead_sources` (map add-friend URL → ช่องทาง · seed Facebook/Google/YouTube).

---

## ขั้นที่ 1 — apply migration (Supabase Dashboard SQL Editor)

1. เปิด Supabase Dashboard → โปรเจกต์ prod (`yzljakczhwrpbxflnmco`) → **SQL Editor** → New query
2. เปิดไฟล์ [`supabase/migrations/0131_line_oa_inbox.sql`](../../supabase/migrations/0131_line_oa_inbox.sql) → copy ทั้งไฟล์ → paste → **Run**
3. Migration นี้ **idempotent** (`create … if not exists` / seed `on conflict do nothing`) — รันซ้ำปลอดภัย ไม่ทับของเดิม
4. ตรวจว่าสร้างครบ:

```sql
SELECT count(*) FROM customers_line;       -- 0
SELECT count(*) FROM line_messages;         -- 0
SELECT count(*) FROM line_webhook_events;   -- 0
SELECT count(*) FROM line_lead_sources;     -- 3  (Facebook / Google / YouTube)
```

> ✅ ไม่ต้องรัน CLI / ไม่ต้อง `supabase db push` — paste ใน Dashboard อย่างเดียว. โปรเจกต์นี้ apply migration ด้วยมือ (ดู `docs/runbook/migration-ledger.md`).

---

## ขั้นที่ 2 — ตั้งค่า env ใน `.env.local` (อย่าใส่ในแชท / อย่า commit)

webhook ใช้ env เดิม ไม่มีตัวใหม่:

```bash
# มีอยู่แล้วด้านบนของ .env.local — ใช้ตัวเดิม
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# จาก LINE Developers Console → Messaging API channel → Basic settings
LINE_CHANNEL_SECRET=<channel-secret-ของคุณ>          # REQUIRED — verify ลายเซ็น
LINE_CHANNEL_ACCESS_TOKEN=<long-lived-access-token>   # OPTIONAL — ดึงชื่อ+รูปโปรไฟล์
```

- **`LINE_CHANNEL_SECRET`** — ขาดไม่ได้. ไม่ตั้ง → endpoint คืน `503 {ok:false,error:"not_configured"}` (ตั้งใจ ให้ LINE retry เมื่อ secret ลงแล้ว)
- **`LINE_CHANNEL_ACCESS_TOKEN`** — มีก็ดี. ถ้าตั้ง → ระบบดึง `display_name` + `picture_url` ของลูกค้า (best-effort · ถ้าดึงไม่ได้/ไม่ตั้ง ก็ยังเก็บข้อความครบ แค่ชื่อ/รูปว่าง)

> 🔐 **ความปลอดภัย token:** ใส่ค่าจริงใน `.env.local` เท่านั้น · ห้ามส่ง token ผ่านแชทสาธารณะ · ห้าม hardcode ลงไฟล์โค้ด · `SUPABASE_SERVICE_ROLE_KEY` ใช้ฝั่ง server เท่านั้น (route นี้เป็น server route — ปลอดภัย).

ที่ Vercel: เพิ่ม `LINE_CHANNEL_SECRET` (+ `LINE_CHANNEL_ACCESS_TOKEN` ถ้าใช้) ใน Project → Settings → Environment Variables → Production แล้ว redeploy.

---

## ขั้นที่ 3 — ตั้ง Webhook URL ใน LINE Developers Console

1. เข้า https://developers.line.biz/console/ → เลือก provider → **Messaging API channel** ของ Pacred OA
2. แท็บ **Messaging API** → หัวข้อ **Webhook settings**:
   - **Webhook URL** =
     ```
     https://<your-domain>/api/webhooks/line
     ```
     - prod: `https://pacred.co.th/api/webhooks/line`
     - dev/ทดสอบเครื่องตัวเอง: ใช้ ngrok → `https://<random>.ngrok-free.app/api/webhooks/line`
   - กด **Update** → กด **Verify** → ต้องได้ **Success** (route ตอบ 200 ให้ payload events ว่าง)
   - เปิดสวิตช์ **Use webhook** = **ON**
3. แท็บ **Messaging API** → **LINE Official Account features**:
   - **Auto-reply messages** = ปิด (ไม่งั้น OA ตอบอัตโนมัติทับ)
   - **Greeting messages** = ตามต้องการ (ไม่กระทบการเก็บข้อมูล)

> ปุ่ม **Verify** ส่ง request ที่มี `events: []` — route จะคืน `{ok:true, processed:0}` โดยไม่เขียน DB. ถ้า Verify fail ทั้งที่ URL ถูก → เช็คว่า deploy แล้ว + `LINE_CHANNEL_SECRET` ตั้งถูก channel.

---

## ขั้นที่ 4 — ทดสอบด้วยการทักหา OA

1. เปิด LINE บนมือถือ → เพิ่มเพื่อน Pacred OA (หรือถ้าเป็นเพื่อนอยู่แล้ว ลองบล็อก/ปลดบล็อกเพื่อยิง follow event ใหม่ — ไม่จำเป็น)
2. พิมพ์ข้อความหา OA เช่น `ทดสอบระบบ 1` แล้วส่ง
3. ลองส่งรูป 1 รูป + สติกเกอร์ 1 อัน (จะได้เห็น `message_type` = `image` / `sticker`)
4. รอ ~2-3 วินาที แล้วรัน check queries ด้านล่าง

---

## ขั้นที่ 5 — Check queries (ยืนยันว่าข้อมูลเข้าจริง)

รันใน Supabase SQL Editor:

### 1) ลูกค้าทั้งหมด
```sql
SELECT line_user_id, display_name, lead_source_name,
       first_follow_at, first_message_at, last_message_at,
       total_messages, last_message_text
FROM   customers_line
ORDER  BY last_message_at DESC NULLS LAST;
```

### 2) ลูกค้าที่เพิ่งกดเพิ่มเพื่อนวันนี้
```sql
SELECT line_user_id, display_name, first_follow_at
FROM   customers_line
WHERE  first_follow_at >= date_trunc('day', now())
ORDER  BY first_follow_at DESC;
```

### 3) ลูกค้าที่ทักหาเราครั้งแรกวันนี้
```sql
SELECT line_user_id, display_name, first_message_at, last_message_text
FROM   customers_line
WHERE  first_message_at >= date_trunc('day', now())
ORDER  BY first_message_at DESC;
```

### 4) ข้อความทั้งหมดของลูกค้า 1 คน
```sql
-- แทน <LINE_USER_ID> ด้วยค่าจากผลข้อ 1
SELECT created_at, direction, message_type, message_text, line_message_id
FROM   line_messages
WHERE  line_user_id = '<LINE_USER_ID>'
ORDER  BY created_at ASC;
```

### 5) สรุปแหล่งที่มา (lead source) ของวันนี้
```sql
SELECT COALESCE(lead_source_name, '(ไม่ทราบแหล่งที่มา)') AS source,
       count(*) AS customers
FROM   customers_line
WHERE  first_seen_at >= date_trunc('day', now())
GROUP  BY 1
ORDER  BY customers DESC;
```

### 6) raw webhook ล่าสุด (ไว้ debug)
```sql
SELECT received_at, event_type, processed_status, error_message,
       line_user_id, raw_payload
FROM   line_webhook_events
ORDER  BY received_at DESC
LIMIT  20;
```

> ถ้าข้อ 6 มีแถวแต่ `processed_status='error'` → อ่าน `error_message`. ถ้า `skipped_no_user` = event ไม่มี userId (เช่น event ระดับกลุ่มบางชนิด) — ปกติ. ถ้าไม่มีแถวเลยทั้งที่ทักไปแล้ว → ลายเซ็น/Webhook URL ยังไม่ผ่าน (ดูขั้น 3) หรือ deploy ยังไม่ขึ้น.

---

## หมายเหตุพฤติกรรม (สำคัญ)

- **Dedup:** `line_messages.line_message_id` เป็น unique — LINE ส่ง event ซ้ำ (redelivery) จะไม่เขียนซ้ำ + ไม่นับสถิติซ้ำ
- **เก็บก่อนเสมอ:** ทุก event ที่ลายเซ็นผ่านถูกเก็บลง `line_webhook_events` ก่อนประมวลผล → debug/replay ได้แม้ขั้น parse จะพัง
- **error ราย event ไม่ล้ม batch:** ถ้า event นึงพัง อีก event ในชุดเดียวกันยังประมวลผลต่อ + route ตอบ 200 (กัน LINE retry ทั้ง batch) — error อยู่ใน `line_webhook_events.error_message`
- **ยังไม่ได้ตอบกลับ:** schema เผื่อ outbound ไว้แล้ว (`direction`, `reply_token`, `agent_id`) แต่รอบนี้เขียนเฉพาะ inbound
- **lead source:** `customers_line.lead_source_name` ยังไม่ถูกเซ็ตอัตโนมัติ — LINE ไม่ส่งช่องทางมาในตัว message event. ตาราง `line_lead_sources` (seed FB/Google/YT) เตรียมไว้ map ในรอบถัดไป (เช่น ผ่าน rich-menu / ref param)

---

## Rollback (ถ้าจำเป็น — ไม่กระทบ table เดิม)

ตารางทั้ง 4 isolated สมบูรณ์ ไม่มี FK ไป table เดิม. ถ้าต้องถอน:

```sql
-- ปิด webhook ใน LINE Console ก่อน (Use webhook = OFF) แล้วจึง:
DROP TABLE IF EXISTS public.line_messages;
DROP TABLE IF EXISTS public.line_webhook_events;
DROP TABLE IF EXISTS public.line_lead_sources;
DROP TABLE IF EXISTS public.customers_line;
DROP FUNCTION IF EXISTS public.line_oa_touch_updated_at();
```

> ⚠️ `DROP` ลบเฉพาะตาราง LINE ใหม่เท่านั้น — table เดิม (`tb_*`, `profiles`, `momo_*`) ไม่กระทบ.
