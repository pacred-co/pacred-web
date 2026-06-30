# 🏁 SAVE-POINT 2026-06-29 (ภูม · MOMO session) — Poom-pacred

> **ภูม: "เซฟ Poom-pacred · กลับบ้านไปทำต่อ" → (work machine resume) ทำต่อ 3 flag prod + MOMO web.** Branch **Poom-pacred = `6e11ed33`** (= HEAD · pushed · clean · local==origin 0/0). **resume:** `git fetch && git pull origin Poom-pacred` + copy `.env.local` จาก main repo (`C:\Users\Admin\pacred-web`) + connect browser ใหม่ (work machine = Browser deviceId `c0898978-…` · ที่บ้าน re-connect). gate เขียวทุก commit: **tsc 0 · eslint 0** (`node scripts/tsc-check.mjs` กรอง `grep 'error TS' | grep -v '.next'`). localhost/.env.local = **DEV** (`lozntlidlqqzzcaathnm` · pw `n61OKDy28QcrB1ZJ`) · **prod = เดฟ จัดการ (ผม read-only)**. กฎ: push เฉพาะ Poom-pacred · ห้ามงานหาย · explain ภาษาพูด. 🔑 **MOMO web creds = chat/env เท่านั้น ห้าม commit** (user `PacredShipping`).

## ✅ งาน session นี้ (14 commit · MOMO + dev cockpit + 3 flag prod + MOMO web mirror · push Poom-pacred · gate เขียว · verify สด authed browser)

1. **🔴 fix น้ำหนัก/คิว หาย (บั๊กหลัก)** (`64984394` ก่อนหน้า + `489dc29b` learning) — ฝากนำเข้า MOMO sync มาแล้ว tb_forwarder ไม่มีน้ำหนัก/คิว (PR012 #52105 ฯลฯ · พนักงานคิดราคาไม่ได้). ROOT: harvest เดินตู้ปิดดึงแค่เลขตู้ ทิ้ง kg/cbm + พัสดุ split (`-i/n`) match ไม่เจอ base. FIX: `aggregateTrackDetailMetrics` (lib/admin/momo-raw-helpers.ts · key ทั้ง exact reTrack + base) → sync.ts harvest per-tracking update weight/cbm + propagate.ts fill-when-empty fweight/fvolume. + DEV backfill `scripts/backfill-momo-track-metrics-2026-06-29.mjs` (7 fwd · #52105=515kg verified). 134 test pass.
2. **per-ตู้ completeness badge** (`a97e50f9`) — หน้า sync โชว์ ✓ครบ / ⚠️ขาด K (เทียบ import_track vs tb_forwarder) ผ่าน `/api/admin/momo/track-completeness`.
3. **handoff เดฟ** (`92ef297e`) — `docs/handoff-dave-2026-06-29-momo-weight-backfill.md` (เดฟ ต้องรัน backfill prod · 14 row weight=0 · + MOMO endpoint carryover).
4. **รื้อ MOMO hub** (`ae06e4de` + `ca45e712` · แยกร่าง 2 lane) — ลบแท็บ CargoCenter (ซ้ำ sidebar) + ย้าย 4 การ์ดล่างเป็น top nav strip (อัปเดตด้วยมือ/Review&Commit/ดึงสถานะ/พัสดุที่ขาด).
5. **🆕 หน้า "พัสดุที่ขาด"** (`ca45e712` + `e1bf05fc`) — `/admin/api-forwarder-momo/missing` เก็บของหาย: **Set A** = import_track ที่ยังไม่เข้า tb_forwarder (รหัสลูกค้า auto · เลขพัสดุจีนจริง · ข้อมูลครบ) + **Set B** = container_closed orphan (กรอกรหัสเอง). action `addMissingMomoParcel` (money-write reviewed: GUARD dedup + member-validate · mirror commit-momo-row-core · auto-rate). verify: พบ 43 · A 14 · B 29 ใน 13 ตู้.
6. **ปุ่มคัดลอก + Export Excel + hint** (`cbd449d8`) — หน้าพัสดุที่ขาด: 📋 คัดลอก TSV (ส่งแชท) + ⬇ CSV (reuse `<CsvButton>` · BOM ไทย + กัน injection) + ⏳ "รอ MOMO ชั่ง" แทน "–" ตัว weight=0.
7. **ตาราง Review & Commit ครบขึ้น** (`0602c0a9`) — เพิ่มคอลัมน์ น้ำหนัก/คิว/ขนาด(ก×ย×ส) ระหว่าง Qty กับ userID (ดึง raw · ตรวจก่อน commit · ไม่แตะฟอร์ม/เงิน).
8. **🆕 dev mission-control cockpit — เฉพาะ user ภูม** (`5f1206c8`) — หน้า `/admin/board/inbox` ของภูม (AD008/admin_poom) ขึ้นแผง dark terminal ไฮเทค (LED 🟢🟡🔴 · monospace · `pacred@ops:~$ status --live`): **สุขภาพ MOMO** (sync ล่าสุด · รอ commit · น้ำหนัก=0 ของที่ถึงไทย fstatus 4-7) + **ออเดอร์ค้าง** (fstatus 4/5/6) · ทุก tile กดไปหน้าที่แก้ได้. gate allowlist `lib/admin/dev-cockpit.ts` (member_code/login_id · **ไม่ใช่ role** · คนอื่นเห็น inbox ปกติ) · panel `components/admin/dev-cockpit-panel.tsx` · read-only counts. ขยายให้คนอื่นเห็น = เพิ่มใน `DEV_COCKPIT_MEMBER_CODES`/`_LOGIN_IDS`. เพิ่มการ์ดได้ (เงิน/สรุปวันนี้ — ภูม ยังไม่เลือกรอบนี้).

9. **🔴 #1 รับเองหน้าโกดัง — แยกการ์ดตามลูกค้า** (`23491458`) — หน้า `/admin/drivers/new?tab=pickup` รวมทุกคนเป็นก้อนเดียวเหมือนมอบคนขับ → แยกเป็นการ์ดต่อลูกค้า (group by `userid` · `buildPickupGroups` + `CustomerPickupCard` ปิดงานทีละคน · action ปิดงานเดิมไม่แตะ). verify DEV.
10. **🔴 #2 พัสดุที่ขาด — กัน false-missing + กดเพิ่มซ้ำ** (`9e37b562` · money) — Set A เคยโชว์ของที่ commit แล้ว (PR107/PR004/PR099 = พัสดุแตกชิ้น `-i/n`). FIX 3 ชั้น: `baseTrackingOf` SOT (momo-raw-helpers) + `track-completeness` exclude `committed_at` + base-match สองทาง (eq+like) + `addMissingMomoParcel` GUARD เช็ค base ทั้งสองฝั่ง. verify DEV (Set A 14 ขาดจริงล้วน).
11. **🆕 #3/A MOMO web login-replication — กระจกข้อมูล + ดึง member อัตโนมัติ** (`62f15b0f` + fix `6e11ed33`) — เจาะ login เว็บ MOMO ได้ (ไม่มี CAPTCHA · `api.momocargo.com:5000` · `POST /api/auth/login {username,password,os:"web"}`). สร้าง **server-side client** (`lib/integrations/momo-web/{client,types}.ts` · server-only + client-safe types แยกไฟล์) ที่ login เอง+cache token+refresh. **(a)** หน้า `/admin/api-forwarder-momo/live` = กระจกข้อมูล MOMO ในระบบ (6 แท็บสถานะ · ค้นหา · รูป · **ไม่มีต้นทุน/ราคา = ซ่อนโดยไม่ดึงมาเลย** · verify 168 พัสดุ). **(b)** ปุ่ม "🔄 ดึงรหัสจาก MOMO" หน้าพัสดุที่ขาด (`actions/admin/momo-fetch-members.ts` · `resolveMembersByTracking` · verify 32/33). 🔑 creds ใน env เท่านั้น (`MOMO_WEB_USER`/`MOMO_WEB_PASS`).
12. **🔍 ตรวจ partner API ว่าพี่บอย (MOMO) ปรับจริงไหม** (read-only · ไม่มี commit) — ภูม ขอ MOMO เปิด API ทุกสถานะ+รหัสลูกค้า · พี่บอยตอบ "ปรับให้แล้ว" → probe จริง: **ปรับบางส่วน** (import/track เริ่มคืน status 6,7 · มี member) **แต่ยังไม่ครบ** — ขาดสถานะ "ถึงโกดังจีน" (เว็บ 41 · API 0) · KY982669997 ยังไม่มา · ทั้งเดือน API 75 vs เว็บ 209 · `container/closed` ยังไม่มี user_code. → ภูม ส่งข้อความสั้นกลับพี่บอย. **web-mirror (#11) ปิด gap นี้ได้แล้ว = Pacred ไม่ตันรอ MOMO.**

## 🔑 root cause MOMO (อธิบายไว้ให้ครบ · ภาษาพูด)
- **เลข tracking ว่าง/น้ำหนัก 0** ของพัสดุสถานะ "รอเข้าโกดังจีน" = **ของยังไม่ถึงโกดัง MOMO ยังไม่ได้ชั่ง** → MOMO ส่ง 0 มาจริง = **ไม่ใช่บั๊กเรา**. ขึ้น ⏳ รอ MOMO ชั่ง.
- **"ตู้หาย" / พัสดุหาย** = MOMO partner API `import/track` คืนแค่พัสดุสถานะต้นๆ พอเลื่อนสถานะมันหลุดฟีด → เราดึงไม่เจอ. `container/closed` มีพัสดุแต่บางตัวไม่มีรหัสลูกค้า. **แก้แล้ว session นี้ = web login-replication (#11)** ดึงครบทุกสถานะ+รหัสลูกค้าจากเว็บโดยตรง (209 พัสดุ verify) → ปุ่ม "ดึงรหัสจาก MOMO" + หน้า /live เก็บของที่ partner ตกหล่นได้หมด. partner API ที่พี่บอยปรับยังไม่ครบ (ดู #12) แต่ไม่ blocking แล้ว.

## 🔴 CARRYOVER ส่งเดฟ (prod · ผม read-only)
- **🆕 ตั้ง env MOMO web ใน Vercel (prod)** — `MOMO_WEB_USER` + `MOMO_WEB_PASS` (รหัสบัญชีหลัก MOMO · chat-only) ไม่งั้นหน้า `/live` + ปุ่มดึง member บน prod ขึ้น "ยังไม่ตั้งค่า". `.env.example` มี placeholder แล้ว.
- **รัน backfill prod** `scripts/backfill-momo-track-metrics-2026-06-29.mjs` (dry-run→`--apply` · 14 forwarder weight=0 · fill-when-empty = money-safe). ดู `docs/handoff-dave-2026-06-29-momo-weight-backfill.md`.
- ไม่มี migration ใหม่ (NEXT FREE = 0224 เหมือนเดิม).

## 🟡 carryover ภูม (ไม่ใช่โค้ด)
- **ส่งข้อความสั้นกลับพี่บอย (MOMO)** ขอเพิ่ม: (1) สถานะ "ถึงโกดังจีน" (2) KY982669997 ยังไม่มา (3) ทั้งเดือน 75 vs 209 (4) `container/closed` ขอ user_code. (ระหว่างนี้ web-mirror ปิด gap ได้แล้ว ไม่ด่วน).
- (option ที่ค้าง) เขียนคู่มือ MOMO เป็นไฟล์ หรือเพิ่มกล่องอธิบายโฟลว์ในหน้า hub — ภูม ยังไม่เคาะ.

## 📋 โฟลว์งาน MOMO (ไว้ทบทวน · ภาษาพูด)
1. **ดึงสถานะ MOMO** = โหลดข้อมูล MOMO เข้าตารางพัก (`momo_*`) — ระบบทำเองทุก 10 นาที (cron) · กดสดได้.
2. **Review & Commit** = ตรวจ + กรอก รหัสลูกค้า/ขนส่ง/ประเภท → กด "สร้างใหม่"/"สร้างทั้งหมด" → เข้า `tb_forwarder` = ระบบจริง.
3. **พัสดุที่ขาด** = เก็บตัวตกหล่นจาก 2 ขั้นบน.
