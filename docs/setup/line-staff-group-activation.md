# 🔔 LINE staff-group notify — activation runbook (P1-24)

**Status (2026-06-01, เดฟ · verified live):** wired but **INERT** — 3 things block it.
This doc is the build-on-top plan (per owner directive: *"ดูการทำงานของ webhook ที่ปอน set
ไว้ แล้วเราพัฒนาต่อยอด ... อย่าไปปิดกั้นน้อง"* — extend ปอน's Worker, don't replace/repoint it).

The code is `lib/notifications/staff-group.ts` → `notifyStaffGroup()`, already wired into both
yuan-create paths. The moment the real `groupId` + env land, it fires with **zero code change**.

---

## 🔬 Verified diagnosis (ยิง LINE API + query prod จริง 2026-06-01 — ไม่เดา)

| # | เช็ค | ผล | หมายเหตุ |
|---|---|---|---|
| 1 | `GET api.line.me/v2/bot/info` (token) | ✅ `displayName: Pacred Shipping` · `@pacred` | token ถูกตัว · push ฝั่ง outbound พร้อม |
| 2 | `GET /v2/bot/group/C61f60d763a766e4f391812381281e3d9/summary` | ❌ **HTTP 404 "Not found"** | ID จาก URL chat.line.biz **push ไม่ได้** |
| 3 | `LINE_PUSH_BYPASS` ใน prod | ❌ `=true` | push ถูกปิด — ต้อง flip `false` (Production scope) |
| 4 | `line_webhook_events` / `line_messages` / `customers_line` row count | ❌ **0 / 0 / 0** | webhook ชี้ Worker ปอน → app เราไม่เคยรับ inbound เลย |

### ทำไม `C61f...` (ID ใน URL chat.line.biz) ใช้ไม่ได้
`chat.line.biz` = หน้า **OA Manager (Chat console)**. `C61f...` ใน URL เป็น **chat-thread ID ของ
console** — คนละ namespace กับ `groupId` ของ **Messaging API**. LINE จงใจไม่มี API "list กลุ่มของ
bot" → **`groupId` จริงโผล่ทาง webhook event เท่านั้น** (`join` ตอน bot เข้ากลุ่ม หรือ `message`
ตอนมีคนพิมพ์ → `source.groupId`). ขึ้นต้น `C...` เหมือนกันแต่คนละค่ากับใน URL.

> เทสต์ซ้ำได้: `TOKEN=$(grep ^LINE_CHANNEL_ACCESS_TOKEN= .env.local | sed -E 's/^[^=]+=//; s/"//g'); curl -s -w "\n[%{http_code}]\n" -H "Authorization: Bearer $TOKEN" "https://api.line.me/v2/bot/group/<id>/summary"` — 200 = push ได้, 404 = ไม่ใช่ groupId.

---

## 🏗 ปอน's architecture (สำรวจแล้ว — เคารพ lane เขา)

- **Inbound (LINE → เรา):** LINE Developers Console → Webhook URL = **ปอน's Cloudflare Worker**
  `https://podenglineworker.natmeena8.workers.dev` (live · `{"ok":true,"message":"Podeng LINE Webhook is running"}`).
  Worker เป็น standalone ใน Cloudflare ของปอน (source ไม่ได้อยู่ใน repo นี้) · **ไม่เคย forward เข้า DB เรา** (line_* = 0 rows).
- **Outbound (เรา → push):** `lib/notifications/*` ยิง `api.line.me/v2/bot/message/push` ตรง · ใช้ `LINE_CHANNEL_ACCESS_TOKEN` · **ไม่พึ่ง webhook** → push ได้แม้ webhook อยู่ที่ปอน.
- **route `app/api/webhooks/line/route.ts`** (340 LOC · ใช้ตาราง 0131 ของปอน) = **โค้ดของปอน** committed ในเรป แต่**ไม่ใช่** webhook ที่ deploy จริง (Worker คือตัวจริง). มันเก็บ `raw_payload` ของทุก event ลง `line_webhook_events` ก่อนเสมอ → **ถ้า event group เข้ามา groupId อยู่ใน raw_payload ทันที** (query ได้ ไม่ต้องแก้โค้ด).

---

## ✅ Build-on-top plan (ต่อยอด · non-breaking · 3 ขั้น)

### ขั้น 1 — ปอน เพิ่ม fan-out ใน Worker (lane ปอน · ~6 บรรทัด · ไม่ทำลายของเดิม)
Worker ยังเป็นเจ้าของ inbound เหมือนเดิม — แค่ส่ง **สำเนา** event ดิบ (+ signature header เดิม) มาที่
route เราด้วย เพื่อให้ฝั่งเรา capture groupId + เริ่มมี customers_line/line_messages (= upgrade ฟรี).
ใส่หลังจาก Worker ทำงานของตัวเองเสร็จ (best-effort · ไม่ await แบบ block):

```js
// ── fan-out copy ไปยัง Pacred app (เก็บ groupId + analytics) — best-effort ──
ctx.waitUntil(
  fetch("https://pacred.co.th/api/webhooks/line", {   // ← แก้เป็น prod domain จริงของ app
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": request.headers.get("x-line-signature") ?? "",
    },
    body: rawBody,   // ← ต้องเป็น raw string ตัวเดียวกับที่ verify signature (ห้าม re-stringify)
  }).catch(() => {})
);
```
> สำคัญ: ต้อง forward **raw body string เดิม + header `x-line-signature` เดิม** — route เรา verify
> signature จาก byte เป๊ะ ๆ ด้วย `LINE_CHANNEL_SECRET` (ต้องเป็น secret ของ channel เดียวกัน). ส่ง
> body ที่ re-stringify แล้ว → signature ไม่ตรง → เรา 401 (ปอน fan-out เป็น best-effort เลยไม่กระทบ Worker).

### ขั้น 2 — ดึง groupId จริงออกมา (หลัง deploy ขั้น 1 + พิมพ์ในกลุ่ม "SA PACRED" 1 ครั้ง)
```bash
SBURL=$(grep ^NEXT_PUBLIC_SUPABASE_URL= .env.local | sed -E 's/.*=//; s/"//g')
SRK=$(grep ^SUPABASE_SERVICE_ROLE_KEY= .env.local | sed -E 's/.*=//; s/"//g')
curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  "$SBURL/rest/v1/line_webhook_events?select=event_type,raw_payload&order=received_at.desc&limit=20" \
  | grep -oE '"groupId":"C[0-9a-f]+"' | sort -u
```
ได้ `Cxxxxxxxx...` (คนละค่ากับ `C61f...` ใน URL) = **groupId จริงที่ push ได้**.
ยืนยัน: `curl ... /v2/bot/group/<groupId จริง>/summary` ต้อง **200** + ชื่อกลุ่ม.

### ขั้น 3 — activate
1. Vercel → Pacred app → Settings → Environment Variables (Production scope):
   - `LINE_STAFF_GROUP_ID` = `<groupId จริงจากขั้น 2>` (แทน `C61f...` เดิมที่ผิด)
   - `LINE_PUSH_BYPASS` = `false`
2. Redeploy (หรือรอ auto-deploy).
3. Smoke test: ทำรายการฝากโอน (yuan-create) ทดสอบ → staff group ต้องเด้ง "มีรายการฝากชำระใหม่ …".
   หรือยิงตรง: `curl -s -X POST https://api.line.me/v2/bot/message/push -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"to":"<groupId>","messages":[{"type":"text","text":"Pacred staff-notify test ✅"}]}'` → ต้อง `{}` + 200.

---

## 🚦 สิ่งที่ทำได้ solo แล้ว vs ที่ต้องรอ
- ✅ **solo (done):** diagnosis + ยืนยัน push outbound พร้อม + route เรา capture groupId ได้อยู่แล้ว (ไม่ต้องแก้) + runbook นี้.
- 🟠 **รอปอน (lane เขา · ~6 บรรทัด):** เพิ่ม fan-out ขั้น 1 ใน Worker. *ทางเลือกเร็วกว่า:* ปอน อ่าน `source.groupId` ของ event `source.type=group` จาก log/KV ของ Worker ตรง ๆ แล้วบอกค่ามา → ข้ามขั้น 1-2 ไป activate ขั้น 3 ได้เลย.
- 🟠 **รอ owner:** flip env ขั้น 3 (Vercel Production).

> **ห้าม** repoint LINE Webhook URL ออกจาก Worker ปอน (จะตัด customer-LINE pipeline ของเขา) ·
> **ห้าม** rewrite `app/api/webhooks/line/route.ts` (โค้ดปอน). ต่อยอดด้วย fan-out เท่านั้น.
