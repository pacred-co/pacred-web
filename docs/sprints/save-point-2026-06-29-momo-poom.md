# 🏁 SAVE-POINT 2026-06-29 (ภูม · MOMO session) — Poom-pacred

> **ภูม: "เซฟ Poom-pacred · กลับบ้านไปทำต่อ".** Branch **Poom-pacred = `5f1206c8`** (= HEAD · pushed · clean · local==origin 0/0). **คอมบ้าน resume:** `git fetch && git pull origin Poom-pacred` + copy `.env.local` จาก main repo (`C:\Users\Admin\pacred-web`) + connect browser ใหม่ (work machine = Browser deviceId `c0898978-…` · ที่บ้าน re-connect). gate เขียวทุก commit: **tsc 0 · eslint 0** (`node scripts/tsc-check.mjs` กรอง `grep 'error TS' | grep -v '.next'`). localhost/.env.local = **DEV** (`lozntlidlqqzzcaathnm` · pw `n61OKDy28QcrB1ZJ`) · **prod = เดฟ จัดการ (ผม read-only)**. กฎ: push เฉพาะ Poom-pacred · ห้ามงานหาย · explain ภาษาพูด.

## ✅ งาน session นี้ (10 commit · MOMO + dev cockpit · push Poom-pacred · gate เขียว · verify สด authed browser)

1. **🔴 fix น้ำหนัก/คิว หาย (บั๊กหลัก)** (`64984394` ก่อนหน้า + `489dc29b` learning) — ฝากนำเข้า MOMO sync มาแล้ว tb_forwarder ไม่มีน้ำหนัก/คิว (PR012 #52105 ฯลฯ · พนักงานคิดราคาไม่ได้). ROOT: harvest เดินตู้ปิดดึงแค่เลขตู้ ทิ้ง kg/cbm + พัสดุ split (`-i/n`) match ไม่เจอ base. FIX: `aggregateTrackDetailMetrics` (lib/admin/momo-raw-helpers.ts · key ทั้ง exact reTrack + base) → sync.ts harvest per-tracking update weight/cbm + propagate.ts fill-when-empty fweight/fvolume. + DEV backfill `scripts/backfill-momo-track-metrics-2026-06-29.mjs` (7 fwd · #52105=515kg verified). 134 test pass.
2. **per-ตู้ completeness badge** (`a97e50f9`) — หน้า sync โชว์ ✓ครบ / ⚠️ขาด K (เทียบ import_track vs tb_forwarder) ผ่าน `/api/admin/momo/track-completeness`.
3. **handoff เดฟ** (`92ef297e`) — `docs/handoff-dave-2026-06-29-momo-weight-backfill.md` (เดฟ ต้องรัน backfill prod · 14 row weight=0 · + MOMO endpoint carryover).
4. **รื้อ MOMO hub** (`ae06e4de` + `ca45e712` · แยกร่าง 2 lane) — ลบแท็บ CargoCenter (ซ้ำ sidebar) + ย้าย 4 การ์ดล่างเป็น top nav strip (อัปเดตด้วยมือ/Review&Commit/ดึงสถานะ/พัสดุที่ขาด).
5. **🆕 หน้า "พัสดุที่ขาด"** (`ca45e712` + `e1bf05fc`) — `/admin/api-forwarder-momo/missing` เก็บของหาย: **Set A** = import_track ที่ยังไม่เข้า tb_forwarder (รหัสลูกค้า auto · เลขพัสดุจีนจริง · ข้อมูลครบ) + **Set B** = container_closed orphan (กรอกรหัสเอง). action `addMissingMomoParcel` (money-write reviewed: GUARD dedup + member-validate · mirror commit-momo-row-core · auto-rate). verify: พบ 43 · A 14 · B 29 ใน 13 ตู้.
6. **ปุ่มคัดลอก + Export Excel + hint** (`cbd449d8`) — หน้าพัสดุที่ขาด: 📋 คัดลอก TSV (ส่งแชท) + ⬇ CSV (reuse `<CsvButton>` · BOM ไทย + กัน injection) + ⏳ "รอ MOMO ชั่ง" แทน "–" ตัว weight=0.
7. **ตาราง Review & Commit ครบขึ้น** (`0602c0a9`) — เพิ่มคอลัมน์ น้ำหนัก/คิว/ขนาด(ก×ย×ส) ระหว่าง Qty กับ userID (ดึง raw · ตรวจก่อน commit · ไม่แตะฟอร์ม/เงิน).
8. **🆕 dev mission-control cockpit — เฉพาะ user ภูม** (`5f1206c8`) — หน้า `/admin/board/inbox` ของภูม (AD008/admin_poom) ขึ้นแผง dark terminal ไฮเทค (LED 🟢🟡🔴 · monospace · `pacred@ops:~$ status --live`): **สุขภาพ MOMO** (sync ล่าสุด · รอ commit · น้ำหนัก=0 ของที่ถึงไทย fstatus 4-7) + **ออเดอร์ค้าง** (fstatus 4/5/6) · ทุก tile กดไปหน้าที่แก้ได้. gate allowlist `lib/admin/dev-cockpit.ts` (member_code/login_id · **ไม่ใช่ role** · คนอื่นเห็น inbox ปกติ) · panel `components/admin/dev-cockpit-panel.tsx` · read-only counts. ขยายให้คนอื่นเห็น = เพิ่มใน `DEV_COCKPIT_MEMBER_CODES`/`_LOGIN_IDS`. เพิ่มการ์ดได้ (เงิน/สรุปวันนี้ — ภูม ยังไม่เลือกรอบนี้).

## 🔑 root cause MOMO (อธิบายไว้ให้ครบ · ภาษาพูด)
- **เลข tracking ว่าง/น้ำหนัก 0** ของพัสดุสถานะ "รอเข้าโกดังจีน" = **ของยังไม่ถึงโกดัง MOMO ยังไม่ได้ชั่ง** → MOMO ส่ง 0 มาจริง = **ไม่ใช่บั๊กเรา**. ขึ้น ⏳ รอ MOMO ชั่ง.
- **"ตู้หาย" / พัสดุหาย** = MOMO API `import/track` คืนแค่พัสดุสถานะต้นๆ พอเลื่อนสถานะมันหลุดฟีด → เราดึงไม่เจอ. `container/closed` มีพัสดุแต่บางตัวไม่มีรหัสลูกค้า. **แก้ขาดถาวร = ให้ MOMO เปิด API ที่คืนทุกสถานะ+รหัสลูกค้า** (ภูม คุยกับ MOMO). ระหว่างนี้ใช้ badge ⚠️ขาด + หน้าพัสดุที่ขาด เก็บเอง.

## 🔴 CARRYOVER ส่งเดฟ (prod · ผม read-only)
- **รัน backfill prod** `scripts/backfill-momo-track-metrics-2026-06-29.mjs` (dry-run→`--apply` · 14 forwarder weight=0 · fill-when-empty = money-safe). ดู `docs/handoff-dave-2026-06-29-momo-weight-backfill.md`.
- ไม่มี migration ใหม่ (NEXT FREE = 0224 เหมือนเดิม).

## 🟡 carryover ภูม (ไม่ใช่โค้ด)
- คุยกับ MOMO ขอ endpoint ที่คืนทุกสถานะ + รหัสลูกค้า (แก้ "ตู้หาย" ขาด).
- (option ที่ค้าง) เขียนคู่มือ MOMO เป็นไฟล์ หรือเพิ่มกล่องอธิบายโฟลว์ในหน้า hub — ภูม ยังไม่เคาะ.

## 📋 โฟลว์งาน MOMO (ไว้ทบทวน · ภาษาพูด)
1. **ดึงสถานะ MOMO** = โหลดข้อมูล MOMO เข้าตารางพัก (`momo_*`) — ระบบทำเองทุก 10 นาที (cron) · กดสดได้.
2. **Review & Commit** = ตรวจ + กรอก รหัสลูกค้า/ขนส่ง/ประเภท → กด "สร้างใหม่"/"สร้างทั้งหมด" → เข้า `tb_forwarder` = ระบบจริง.
3. **พัสดุที่ขาด** = เก็บตัวตกหล่นจาก 2 ขั้นบน.
