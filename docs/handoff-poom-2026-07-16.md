# 🔵 HANDOFF — ภูม (Poom) · ปิด session 2026-07-16 → ไปทำต่อคอมที่ทำงาน

> **อ่านไฟล์นี้ก่อนเริ่มพรุ่งนี้.** สรุปงานที่ทำวันนี้ + งานค้าง + วิธีทำต่อ ให้คอมที่ทำงาน
> `git pull` แล้วทำต่อจากที่ agent ทำไว้ได้เลย ไม่ต้องอธิบายใหม่.

## 0. STATE / RESUME
- **branch `Poom-pacred = 3ecf4740`** (push ครบ · local == origin · clean).
- resume คอมที่ทำงาน:
  1. `cd C:\...\pacred-web\pacred-web` (root จริง nested 2 ชั้น) · `git fetch && git pull origin Poom-pacred`
  2. copy `.env.local` จาก main repo + connect Chrome (ภูม login PCS + Pacred admin ไว้ให้ agent เทียบสีได้)
  3. **restart dev เสมอด้วย 431 fix:** `NODE_OPTIONS=--max-http-header-size=131072 pnpm dev` (ไม่งั้นเจอ HTTP 431)
- **gate ทุก commit** (จาก root): `MSYS_NO_PATHCONV=1 node_modules/.bin/eslint "<file>"` (EXIT 0) + `rm -f .next/dev/types/validator.ts && node scripts/tsc-check.mjs` (EXIT 0) + curl route = 307/200 (ไม่ 500) · push `Poom-pacred` ทุก commit เขียว.
- 🔴 **legacy source path ที่ถูก (เครื่องนี้):** `C:\Users\Admin\Downloads\pcscargo_extracted\pcscargo\member\pcs-admin\` (path ใน AGENTS.md เก่า `Desktop\newrealdatapcs` = STALE). **คอมที่ทำงาน path อาจต่าง** → หาใหม่ด้วย `find <drive> -iname report-cnt.php`.

## 1. ✅ เสร็จแล้ว session นี้ (7 commit · 9d0c47cf → 3ecf4740)
- **`3f83f405` Yiwu toggle** — หน้า `/admin/api-forwarder-momo/packing-upload`: ปุ่มเลือกคลัง **กวางโจว/อี้อู** (pill) + rename MOMO→กวางโจว + **อี้อู = โหมดพรีวิวเท่านั้น** (parser ทำงาน · แต่ `applyMomoPacking` guard ปฏิเสธไฟล์ Yiwu ทั้ง server+client · money-safe). กวางโจว(MOMO) flow เดิมไม่แตะ.
- **report-cnt (`/admin/report-cnt`) เหมือน legacy** (`b00f5acf`/`66547ed8`/`b0a0bd28`) — dashed-pill tabs + กรอบ .pcs-card · totals ส้ม gradient · ขนส่ง pill สี (ทางรถฟ้า/ทางเรือเขียว/อากาศส้ม) · เลขตู้ฟ้า · ปุ่มจ่ายเงินตู้ portal→body คาที่ · ตารางกระชับ + zebra ชัด. **browser-verified 200 + เทียบ legacy แล้ว.**
- **drivers/new (`/admin/drivers/new`)** (`993e3727`/`3ecf4740`) — แท็บ = legacy dashed pill · ตาราง create-batch: link ฟ้า #1e9ff2 · แถวรวมชมพู #f5aab0 · อำเภอส้ม #ff9149. **เทียบ legacy add-page ใน browser แล้ว.**

## 2. 🔴 งานค้าง — ทำต่อได้เลย
### (A) Yiwu Phase 3 = money core (ยังไม่เริ่ม · owner-approved plan มีแล้ว)
- แผนเต็ม: **`docs/research/yiwu-packing-list-plan-2026-07-15.md`** (owner ภูม เคาะครบ · §3-4-6).
- flow: **อัพใบส่งของ (รูป) ก่อน** → OCR แยกช่อง → staff แก้ → สร้างออเดอร์**แตกกล่อง** `<单号>-N` ที่ "ถึงโกดังจีน" (fstatus='2') → **upload-2 = dedicated money-free reconcile** (ผูกตู้ + advance status · ไม่เขียน basis ไม่ reprice).
- ⚠️ **ห้ามยัด Yiwu เข้า `momo-packing-reconcile` + LIKE `<base>-*`** = money-unsafe (revert แล้ว · adversarial review จับได้). reconcile ต้องคง pristine.
- money code → adversarial review ก่อนปิดเสมอ.

### (B) drivers fidelity — เหลือ 2 จุด (ต่อจาก session นี้)
รายละเอียด + palette hex ครบใน **`docs/legacy-fidelity-notes.md` §4**:
- 🔴 **หน้า `/admin/drivers` (list มอบหมายคนขับ)** — ยังไม่แตะเลย · legacy `forwarder-driver.php` (list mode) · เรา `app/[locale]/(admin)/admin/drivers/page.tsx` → แกะสี+ตาราง legacy มาทำ.
- 🔴 **แท็บ "รับเองหน้าโกดัง"** (`drivers/new/self-pickup-form.tsx`) — ยังไม่แก้สีตาราง (ทำแบบ create-batch: link ฟ้า/แถวรวมชมพู/อำเภอส้ม).
- 🟢 minor (owner ยังไม่ flag): บริษัทขนส่ง = เราทำ pill ฟ้า (legacy = text เปล่า) · ลำดับส่ง = badge ส้ม (legacy = เลขเปล่า) · header uppercase → ของเราชัดกว่า เก็บไว้ก่อน.

### (C) อื่นๆ carryover (จาก save-point เก่า · CLAUDE.md)
- MOMO carryover: box-count code root · COD historical over-collection · combined-slip grouping · packing manual (cross-container/orphan/MISSING).

## 3. 🎨 palette + วิธี fidelity (SOT)
**`docs/legacy-fidelity-notes.md`** = ไฟล์หลักเรื่องทำหน้าให้เหมือน legacy: palette hex ครบ (จาก source จริง) · theme `.pcs-rc`/`.pcs-card`/`.pcs-tabs` ของปอน (reuse ได้ · `report-cnt/[fNo]/legacy-report-cnt.css`) · วิธีเทียบสีใน Chrome · status ทุกหน้า.

## 4. 🐛 บทเรียน 404 (ระวังพรุ่งนี้)
หลังแก้หน้าแล้วขึ้น **404 เฉพาะตอน login** (curl unauthed = 307 · ไม่มี console error) = **Next dev route state ค้าง** (ไม่ใช่บั๊กโค้ด). **แก้:** `taskkill /F /PID <pid บน :3000>` → `rm -rf .next` → restart dev → verify browser = 200. (Chrome MCP screenshot glitch เฉพาะตอนหน้าเป็น error page · พอหน้าปกติดูได้.)
