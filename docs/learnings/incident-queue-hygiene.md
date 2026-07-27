# คิว incidents จะว่างจริงได้ ต้องอุดราก 2 ทางก่อนล้าง (2026-07-27)

owner: *"admin/incidents แก้ให้หมดแล้วล้างรายการให้ครบครับ"* — คิวมี **30 ใบค้าง**
ทั้งที่ session ก่อน (07-23) เพิ่ง auto-close lifecycle ไปแล้ว. ล้างเฉยๆ = เต็มใหม่ภายในวัน.

## แยกใบเป็น class ก่อนเสมอ — 30 ใบมาจาก 4 ที่คนละเรื่อง

| class | จำนวน | เป็นบั๊กจริงไหม | ทำอะไร |
|---|---|---|---|
| `js_error` จาก dev บนเครื่อง | 19 | ❌ | อุดราก: gate `NODE_ENV` |
| data-health check ที่เป็น "คิวงานคน" | 4 | ❌ (งานบัญชี/CS) | cron เลิกเปิดใบ class นี้ |
| wallet-reconcile PR588 ใช้เกินยอด | 1 | ✅ ของจริง | ปิดใบ + แจ้ง owner (cron จะเปิดใหม่ = ตั้งใจ) |
| deploy churn ("unexpected response") | 6 | ❌ | ปิด (มี suppress + ข้อความไทยแล้ว) |

## ราก 1 — dev บนเครื่องเขียนใบลง DB prod

ตาม local-first (§0k) เครื่อง dev รัน `next dev` แต่ `.env.local` ชี้ **DB prod**.
`reportClientIncident` ไม่มี gate `NODE_ENV` → ทุก error ระหว่างแก้โค้ด
(hot-reload "X is not defined" · prop-type warning) **โพสต์เข้าคิว incidents ของ prod**.
19 ใบหน้า `/admin/drivers` = ร่องรอย session dev ของเพื่อนร่วมทีมเมื่อ 07-23/24
ทั้งที่โค้ดบน main ไม่เคยมี symbol ผิดพวกนั้นเลย.

FIX = `if (process.env.NODE_ENV !== "production") return;` ทั้งฝั่ง client
(`client-report.ts`) และฝั่ง server (`captureIncident` — server action/cron ที่พังตอน dev
ก็เขียนใบเหมือนกัน). `NODE_ENV` ถูก inline ตอน build → prod รายงานเหมือนเดิมทุกประการ.

## ราก 2 — "คิวงานคน" ไม่ใช่ incident

data-health cron เปิดใบให้ทุก check ที่แดง แต่บาง check แดงเพราะ **มีงานรอคนทำ**
(บัญชี void บิลซ้ำ · CS เติมที่อยู่ 186 งาน) ไม่ใช่ระบบพัง — และมันมี**บ้านของตัวเองอยู่แล้ว**
คือ `/admin/data-health` ที่ลิสต์แถวจริงให้กดทำงาน. เปิดใบซ้ำ = คิว incidents
มีใบค้างถาวรจนแยกบั๊กจริงไม่ออก.

FIX = `HUMAN_QUEUE_CHECK_IDS` ใน cron — check กลุ่มนี้ข้าม `captureIncident`
(check ที่เป็นระบบพังจริง เช่น dup/dangling/fanout ยังเปิดใบเหมือนเดิม).

## กลไกที่ต้องรู้ก่อนแก้ (ไม่งั้นล้างไม่ลง)

- `captureIncident` dedup โดยไม่นับ `resolved`/`ignored` → ปิดใบแล้วรอบหน้า
  **INSERT ใบใหม่** ไม่ใช่ bump ใบเก่า ⇒ ถ้าต้นเหตุยังยิง ล้างไปก็เต็มใหม่.
- หน้า incidents กรอง default = `LIVE_INCIDENT_STATUSES` = `open` + **`acknowledged`** +
  `in_progress` ⇒ "รับเรื่องแล้ว" ยังโชว์อยู่ ต้องปิดถึง `resolved`/`ignored` เท่านั้น.
- mig 0077 มี CHECK **2 ตัว**: `resolved_consistent` (ต้องมี `resolved_at` + `resolution_note`)
  และ `triaged_consistent` (**`acknowledged_at` + `assigned_to`**) — ลืมตัวหลัง = UPDATE ตกทั้ง 30 แถว.
- ปิดใบต้องใส่ `resolution_note` ที่บอก **เหตุ + ที่ตามงานต่อ** ไม่ใช่ "ปิดแล้ว" ลอยๆ
  (คนอ่านทีหลังต้องรู้ว่าปิดเพราะไม่ใช่บั๊ก หรือเพราะแก้แล้ว).

## กติกาไปข้างหน้า

คิวว่าง = สัญญาณที่ใช้ได้. เมื่อไหร่มีใบใหม่โผล่ = ของจริงที่ prod เท่านั้น.
เจอใบค้างเยอะอีกครั้ง ให้ถามก่อนว่า *"ใบนี้เกิดจาก prod จริงไหม และมันควรมีบ้านอื่นไหม"*
ก่อนจะไปแก้อาการที่ปลายทาง.
