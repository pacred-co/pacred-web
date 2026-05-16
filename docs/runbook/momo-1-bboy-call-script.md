# MOMO-1 — call BBOY script (ลูกพี่ + เดฟ ทำต่อ)

> **Status:** ⏳ pending — **ลูกพี่ takes call with BBOY** (MOMO dev). เดฟ ฟัง + parse + กรอก [`momo-jmf.md`](../integrations/momo-jmf.md) ให้.
> **Date opened:** 2026-05-16 night
> **Time budget:** ~30-45 นาที call + ~30 นาที เดฟ parse + กรอก
> **Goal:** unblock CT-5 (MOMO sync cron) + CT-6 (webhook receiver) ภูม implement ทันที post-call. **ไม่จำเป็นต้องเข้าใจ technical jargon** — แค่ถามตามสคริปต์ + record audio + ส่งให้ เดฟ.
>
> **Read with:** [`docs/integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) (full 24-Q technical reference — สำหรับ เดฟ parse) · [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) (current state).

---

## 🎯 What's locked vs blocked

| Status | Item |
|---|---|
| ✅ MOMO endpoint observed | `https://api-cn.alilogisticshub.com/?api=container-list` |
| ✅ Auth method | Bearer JWT (HS256) — token captured `MOMO_JMF_TOKEN` |
| ✅ JMF analog reverse-engineered | PHP `update-forwarder/JMFCARGO/` decoded |
| ⏳ Full endpoint list | **THIS CALL** |
| ⏳ Push (webhook) vs Pull (cron) | **THIS CALL — chooses CT-5 vs CT-6 wire pattern** |
| ⏳ Container splits behavior | **THIS CALL — V-D4 / U1-5 bug origin** |
| ⏳ Status enum confirmation | **THIS CALL** |
| ⏳ Sandbox + operational support | **THIS CALL — operations หลัง launch** |

---

## 📞 Call structure — 6 topics ใน 30-45 นาที

> **Tip ลูกพี่:**
> - **ก่อนโทร:** เปิด LINE/voice call บันทึกไว้ + เปิด notes app
> - **ทุก topic อ่าน script ที่เขียนไว้** → BBOY ตอบ → record/note → ไป topic ถัดไป
> - **ถ้าไม่เข้าใจคำตอบ:** ขอ BBOY ส่ง email/LINE follow-up พร้อม sample (จะให้ เดฟ parse เอง)
> - **ถ้า BBOY ไม่ว่าง:** ขอ schedule 30 นาที — ห้าม half-call (ครึ่งๆ กลางๆ จะต้องโทรซ้ำ)

---

### ปฐมบท (~2 นาที — set context)

> "BBOY สวัสดีครับ พี่ ผม [ลูกพี่] จาก Pacred ครับ. ที่บริษัทเปิด PCS Cargo เปลี่ยนเป็น Pacred — ระบบใหม่กำลังเสร็จ จันทร์เปิด. ขอคุยเรื่อง MOMO integration สั้นๆ ประมาณ 30 นาที — ขอเก็บข้อมูลให้ทีม dev (เดฟ) wire ระบบเชื่อมต่อ MOMO ให้ครบ. รบกวนทีละหัวข้อนะครับ"

---

### Topic #1 — Endpoint list + integration shape (~8-10 นาที)

**ทำไม:** Pacred ใช้แค่ container-list endpoint อยู่ ต้องรู้ทั้งหมดที่ MOMO มี

**ถาม BBOY 4 ข้อ:**

1. > "ที่ Pacred ใช้อยู่ตอนนี้คือ `?api=container-list` — มี endpoint อื่นที่ MOMO เปิดให้เราอีกไหม? เช่น container-detail, shipment-detail, user-balance? ขอ list ทั้งหมดเลย"

2. > "ขอ API documentation หรือ Postman collection ส่งมาทาง email/LINE ได้ไหม? ถ้าไม่มี doc ขอ sample JSON response ของแต่ละ endpoint"

3. > "MOMO มี **webhook push** ไหม? คือ MOMO จะส่งข้อมูลมาที่ Pacred เลยเมื่อ status เปลี่ยน — แทนที่ Pacred ต้อง poll เอง"

4. > "ถ้าไม่มี webhook → MOMO ตอบ API ได้ rate limit เท่าไหร่? (กี่ครั้งต่อนาที/ชั่วโมง)"

**Capture:** ✏️ list ทุก endpoint + ✏️ "push or pull" + ✏️ rate limit number

---

### Topic #2 — Webhook details (~5 นาที — ถ้า BBOY ตอบ Topic#1 ว่ามี push)

**Skip ถ้า MOMO pull-only** (= ภูม ใช้ cron 15 นาที)

5. > "Webhook ส่งมาที่ URL ที่เรา set ได้ไหม? Pacred จะ expose endpoint `https://pacred.co/api/webhooks/momo-jmf` — set ใน MOMO ได้เลยใช่ไหม?"

6. > "MOMO ส่ง webhook พร้อม signature/security header อะไรไหม? เช่น HMAC, หรือใช้ JWT bearer เดียวกัน? Pacred ต้องการ verify ว่า request มาจาก MOMO จริง"

7. > "ถ้า Pacred webhook ล่ม 1 ชั่วโมง — MOMO retry หรือ replay events ที่ส่งไม่ติดให้เราไหม? หรือเราต้อง catch-up ผ่าน GET endpoint?"

**Capture:** ✏️ signature method + ✏️ retry behavior

---

### Topic #3 — Container splits + data quirks (~8 นาที — **most important business problem**)

**ทำไม:** การที่ขนตู้แบ่ง 2 ตู้ทำให้ Pacred ระบบเก่าแสดง `qty=1` (= บัก U1-5 ที่ลูกค้าจ่ายเงินผิด!) ต้องรู้ว่า MOMO ส่งข้อมูลยังไง

8. > "ถ้าตู้ของลูกค้าแบ่งเป็น 2 ตู้ (เช่น สินค้า 10 กล่อง — 5 กล่องไปตู้ A, 5 กล่องไปตู้ B) — MOMO ส่งข้อมูลยังไง?
> - แบบเดียว `qty=2` รวมเลย, หรือ
> - แยก 2 messages, message ละ `qty=1`?
> ระบบเก่าเรา `qty=1` เพราะอ่านแค่ตู้แรก — อยากเข้าใจว่าฝั่ง MOMO ส่งครบไหม"

9. > "ถ้าตู้เดียวกัน ส่งแล้วน้ำหนัก/CBM ไม่ตรงกัน (เช่น manifest = 100kg, ใช้จริง = 105kg) — MOMO ส่ง field ไหนเป็น authoritative? อันไหนที่ Pacred ใช้คิดเงินลูกค้าได้?"

10. > "Container number ที่ MOMO ส่ง (เช่น `BLOU2025012`) — แตกต่างจากเลข `GZE`/`GZS` ที่ Pacred ใช้ไหม? MOMO ส่งทั้ง 2 เลขให้เลย หรือเราต้อง map เอง?"

**Capture:** ✏️ container-split behavior + ✏️ authoritative weight/CBM field + ✏️ container-number mapping

---

### Topic #4 — Status enum confirmation (~5 นาที)

**ทำไม:** Pacred wire 9 statuses ที่ MOMO ใช้ ต้อง verify ว่าไม่มีเพิ่ม

11. > "Status ที่ MOMO ส่งให้เราทั้งหมดมี 9 ค่านี้ใช่ไหม:
> - loading_container (กำลังบรรจุตู้)
> - ek_left_china_border (ออกด่านจีน)
> - ek_arrived_vietnam_border (ถึงด่านเวียดนาม)
> - in_transit (ระหว่างทาง)
> - sea_leaving_china (เรือออกจีน)
> - sea_arrived_thailand_port (เรือถึงท่าเรือไทย)
> - ek_arrived_mukdahan (ถึงด่านมุกดาหาร)
> - unloading_in_thailand (กำลังลงตู้ที่ไทย)
> - unloaded_completed (ลงตู้เสร็จ)
>
> มี status อื่นที่ส่งบ้างไหม? หรือกำลังจะเพิ่มใน version ใหม่?"

12. > "Cargo type code ที่ MOMO ใช้ — เป็น `A/M/X/O/Z` (แบบ PCS เก่า) หรือ `G/T/F` (แบบ China manifest) หรืออื่น?"

**Capture:** ✏️ list status ที่ตอบ + ✏️ cargo type system

---

### Topic #5 — Backend access + operational support (~5 นาที)

**ทำไม:** พี่ป๊อปขอไว้แล้วใน chat 2026-05-08 — Pacred อยากเข้า MOMO admin backend ดูข้อมูลตอนระบบมีปัญหา

13. > "Pacred ขอ **read-only access** เข้า MOMO admin backend (web UI) ได้ไหม? เพื่อ debug ตอนระบบมีปัญหา — Pacred จะไม่แก้ข้อมูลใดๆ แค่ดูเฉยๆ"

14. > "MOMO มี **sandbox environment** ไหม? Pacred จะได้ test การเชื่อมต่อโดยไม่กระทบข้อมูล production"

15. > "ถ้า MOMO API ล่ม หรือมี breaking change — แจ้ง Pacred ทาง email/LINE/อะไรก่อนกี่วัน?"

16. > "นอกจากพี่ BBOY — มีใครที่ Pacred ติดต่อได้อีกเรื่อง API? ขอ contact + ช่องทาง (LINE/email/เบอร์)"

**Capture:** ✏️ backend access ได้/ไม่ได้ + ✏️ sandbox URL + ✏️ change-notice policy + ✏️ contact list

---

### Topic #6 — Strategic (long-term) (~5 นาที — ถ้ายังมีเวลา)

17. > "Pacred ในอนาคตอยากมีคลังเอง — MOMO contract ที่เราใช้อยู่ ถ้าวันหนึ่งไม่ใช้ — มี notice period กี่วัน? ขอ export ข้อมูลทั้งหมดกลับมาได้ไหม?"

18. > "ในทางกลับกัน — Pacred push ข้อมูล TO MOMO ได้ไหม? เช่น ลูกค้าทำ 'delivery complete' ใน Pacred app, แล้ว MOMO อยากได้ event นี้ไหม?"

**Capture:** ✏️ contract terms + ✏️ reverse-webhook interest

---

## 📝 หลังจบ call — ลูกพี่ ส่งให้ เดฟ

ส่ง 3 อย่างให้ เดฟ (LINE หรือ email):

1. **Recording / audio** ของ call (ถ้า BBOY ยอม)
2. **Notes ของ ลูกพี่** — ตอบทุกคำถามแบบ bullet points (ไม่ต้องสวย)
3. **Email/LINE/Postman collection** ที่ BBOY ส่งให้

เดฟ จะ:
1. กรอก [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) ครบทุก field
2. Update [`docs/integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) §3 mark each Q answered
3. แจ้ง ภูม → ภูม wire `lib/integrations/momo-jmf/sync.ts` ตาม pattern ที่ confirmed (cron vs webhook)
4. Commit `feat(momo): MOMO-1 call answers — wire ภูม CT-5 + CT-6`

---

## 🚨 If BBOY ไม่ว่าง / answers half

- **Item-by-item OK** — ขอตอบเป็น email/LINE หลัง call
- **Priority order ที่ต้องตอบก่อน:** Topic #1 (endpoints) + Topic #3 (container splits) + Topic #4 (status enum) — ทั้ง 3 อันนี้ block Pacred-side wire
- **Defer-able:** Topic #5 sandbox + Topic #6 strategic — สามารถ follow up ใน 1-2 สัปดาห์
- **Email template** ถ้าต้อง follow up: copy คำถามจากด้านบนใส่ email → ส่งไป BBOY

---

## Cross-references

- Full technical reference (24 Qs, dev-level) → [`docs/integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md)
- MOMO current state + token → [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- Pacred-side wire skeleton → `lib/integrations/momo-jmf/` (ภูม wires post-call)
- Container model → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- ภูม CT-5 + CT-6 tasks → [`docs/briefs/poom.md`](../briefs/poom.md) "P0 — Container-centric model"
- ก๊อต cheat-sheet (where MOMO-1 referenced) → [`docs/briefs/got-cheatsheet-2026-05-17.md`](../briefs/got-cheatsheet-2026-05-17.md) §2.1

---

**End of MOMO-1 call script.** ลูกพี่ schedules call with BBOY → ทำตามสคริปต์ → ส่งให้ เดฟ. เดฟ implements per "หลังจบ call" section.
