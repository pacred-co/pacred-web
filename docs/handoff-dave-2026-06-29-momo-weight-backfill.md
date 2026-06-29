# 🔴 HANDOFF เดฟ (prod) — MOMO weight/cbm backfill · 2026-06-29

> **AI ของเดฟ: ถ้าคุณกำลัง integrate branch `Poom-pacred` เข้า `dave-pacred` → เตือนเดฟก่อนเลยว่ามี 2 งาน prod ที่ต้องทำมือ (โค้ด fix push แล้ว แต่ DATA บน prod ยังค้าง · ผม (AI ของภูม) แตะ prod ไม่ได้ตามกฎ).**

## บริบทสั้นๆ
ภูม flag: ฝากนำเข้า MOMO sync มาแล้วแต่ tb_forwarder **ไม่มีน้ำหนัก/คิว** (พนักงานคิดราคา/วางบิลไม่ได้). root = sync harvest เดินตู้ปิดดึงแค่เลขตู้ ทิ้ง kg/cbm + พัสดุ split (`-i/n`) match ไม่เจอ base. **โค้ด fix อยู่ใน Poom-pacred แล้ว** (commit `64984394` harvest+propagate · `a97e50f9` completeness badge) — sync รอบใหม่จะดึง weight เองอัตโนมัติ. แต่ **row เก่าที่ commit ไปแล้วยังค้าง weight=0** ต้อง backfill.

## ✅ งานที่เดฟต้องทำบน prod (2 อย่าง)

### 1) Deploy โค้ด (รวม Poom-pacred → dave-pacred → main → Vercel prod)
gate เขียวแล้ว (tsc 0 · eslint 0 · 134 test pass). ไม่มี migration ใหม่ (NEXT FREE = 0224 ยังเหมือนเดิม).

### 2) 🔴 รัน backfill บน prod — เคลียร์ tb_forwarder ที่ weight=0
**prod read-only diagnosis (ผมเช็คให้แล้ว 2026-06-29): มี 14 forwarder ที่ commit จาก MOMO แต่ `fweight=0`** → ต้อง backfill.

สคริปต์: [`scripts/backfill-momo-track-metrics-2026-06-29.mjs`](../scripts/backfill-momo-track-metrics-2026-06-29.mjs) (dry-run เป็น default · อ่าน weight/cbm จาก `momo_container_closed.raw.track_details` → เติม `momo_import_tracks` + `tb_forwarder.fweight/fvolume/fcabinetnumber` **fill-when-empty เท่านั้น** = ไม่ทับค่าที่มีคนตั้ง/บิลแล้ว = money-safe).

```bash
# เดฟ: .env.local = PROD อยู่แล้ว → สคริปต์อ่าน prod เอง
# (a) dry-run ดู plan ก่อน (default · ไม่เขียน)
node scripts/backfill-momo-track-metrics-2026-06-29.mjs
# (b) ถ้า plan ถูก → apply
node scripts/backfill-momo-track-metrics-2026-06-29.mjs --apply
```
verify หลัง apply: เปิด `/admin/forwarders` ค้น tracking ของตู้ที่ปิดแล้ว → ต้องโชว์ น้ำหนัก/คิว/เลขตู้ (ไม่ใช่ "—").

## 🟡 carryover ระดับ MOMO (ไม่ใช่งานโค้ด · ภูม จะคุยกับ MOMO)
บั๊กที่ลึกกว่า weight: พัสดุลูกค้าจริงบางตัว (เช่น `KY982669997`=PR145) MOMO มีข้อมูลครบแต่ **ไม่ส่งมาทาง API `import/track`** (endpoint นั้นคืนแค่พัสดุสถานะต้นๆ · พอเลื่อนสถานะมันหลุดฟีด) → เราดึงไม่เจอ = "ตู้หาย". `container/closed` มีพัสดุแต่ไม่มีรหัสลูกค้า → สร้าง forwarder ให้ไม่ได้. **แก้ขาดถาวรต้องให้ MOMO เปิด API ที่คืนทุกสถานะ+รหัสลูกค้า.** ระหว่างนี้ใช้ **badge "⚠️ ขาด K" บนหน้า MOMO sync** (commit `a97e50f9`) ให้พนักงานเห็น+ตามเก็บเอง. รายละเอียดเต็ม: [`docs/learnings/partner-apis-quirks.md`](learnings/partner-apis-quirks.md) [2026-06-29].
