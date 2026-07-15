# Legacy PCS fidelity — บันทึกงาน "ทำหน้า admin ให้เหมือน legacy เป๊ะ 100%"

> **ทำไมมีไฟล์นี้ (ภูม สั่ง 2026-07-16):** owner (พี่ป๊อป) ต้องการให้หน้า admin ของ Pacred
> เหมือน legacy PCS Cargo **เป๊ะ 100%** — ทั้งสี · ความเข้มของสี · สีตัวอักษร · การจัดวาง.
> เก็บ record ไว้เพื่อ (1) agent จำได้ (2) **ภูม ย้ายไปทำที่คอมที่ทำงานแล้ว `git pull` มาอ่าน
> ต่อได้ ไม่ต้องอธิบายใหม่** งานจะได้ไม่ล่าช้า. **อัพเดตไฟล์นี้ทุกครั้งที่ทำหน้าใหม่/เก็บสีเพิ่ม.**

## 0. วิธีทำงาน (อ่านก่อนเริ่มทุกครั้ง)
1. **อ่าน legacy source บน disk เป็นหลัก (ได้ hex เป๊ะกว่าเดาจากรูป · §0b):**
   - PHP + inline `<style>`: `C:\Users\Admin\Downloads\pcscargo_extracted\pcscargo\member\pcs-admin\*.php`
   - CSS: `...\member\assets\css\style.css` · `admin.css` · `pcs-admin\main\style-2024.css`
   - helper (badge/label สี): `...\pcs-admin\include\function.php` (เช่น `nameTransportType2`)
   - ⚠️ **path เก่าใน AGENTS.md §0b (`Desktop\newrealdatapcs...` / `D:\REALSHITDATAPCS`) = STALE บนเครื่องนี้** → ใช้ `Downloads\pcscargo_extracted\...` (ยืนยัน 2026-07-16). มี copy ที่ `C:\xampp\htdocs\pcscargo\...` ด้วย.
2. **เทียบสีจริงใน Chrome** — ภูม login PCS ไว้ให้แล้ว (`pcscargo.co.th/member/pcs-admin/` · user admin_jeen) เลื่อนเทียบสีได้.
   - ⚠️ **Chrome MCP read/screenshot บนเครื่องนี้ glitch** ("Frame ID 0 error page") → agent ดูเองไม่ได้เสมอ → **ยึด source hex เป็นหลัก + ให้ ภูม verify ด้วยตา** (agent login หน้า Pacred เองไม่ได้ = ยัง authed-click-test ไม่ได้ · ต้องบอกภูมทุกครั้งว่าอะไร verify แล้ว/ยัง).
3. **gate ทุก commit** (จาก `cd /c/Users/Admin/pacred-web/pacred-web`):
   - `MSYS_NO_PATHCONV=1 node_modules/.bin/eslint "<file>"` → EXIT 0
   - `rm -f .next/dev/types/validator.ts && node scripts/tsc-check.mjs` → EXIT 0 (อ่าน exit จริง ห้าม `| tail`)
   - route smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<path>` → 307 (auth redirect = ok · 500 = พัง)
4. push branch **`Poom-pacred`** ทุก commit ที่ gate เขียว (real-time · local ต้องเท่า origin).

## 1. Legacy color palette (SOT · จาก source จริง · ใช้ซ้ำได้ทุกหน้า)
| ใช้ที่ไหน | ค่า | มาจาก |
|---|---|---|
| แดงหลัก (active tab · border · แดง PCS) | `#cc3333` | report-cnt.php `<style>` `.nav-link.active h4` |
| **แถวรวม/totals** (`.bg-color`) | gradient `#ee7411 → #c24e4e` · **ตัวอักษรขาว** | report-cnt.php `<style>` `.bg-color` |
| แถวที่ติ๊กเลือก (`.bg-color-select`) | gradient `#27b836 → #1f81b3` · ขาว | report-cnt.php `<style>` |
| **ทางรถ** (badge-info) | พื้น `#1e9ff2` ฟ้า · ตัวขาว | function.php `nameTransportType2` |
| **ทางเรือ** (badge-success) | พื้น `#28d094` เขียว · ตัวขาว | function.php `nameTransportType2` |
| นับ badge / ยังไม่จ่าย (badge-danger) | `#ff4961` (บางที่ `#ff5050`) แดง · ขาว | style.css `.pcs-badge-danger` |
| badge-warning (ส้ม · air ที่เราเพิ่มเอง) | `#ff9149` | legacy-report-cnt.css |
| badge-primary (ม่วงคราม) | `#666ee8` | legacy-report-cnt.css |
| **หมายเลขตู้ / link** (`a`) | `#1e9ff2` ฟ้า (บนแถวขาว) · `#1e5f8c` (บนแถวมีสี) | style.css `.pcs-rc a` |
| tab เส้นประ (inactive) | เส้นประ `#ef9aa8` ชมพู · ตัวดำ `#1a1a1a` | legacy-report-cnt.css `.pcs-dashsoft` |
| tab เส้นประ (active) | เส้นประ `#cc3333` แดง · พื้น `#fef2f2` · ตัวแดง `#cc3333` | legacy-report-cnt.css `.pcs-tab.active` |
| text หลัก | `#4e5154` เทาเข้ม | legacy-report-cnt.css `.pcs-rc` |
| เส้น grid ตาราง | `#ddd` / `#dee2e6` (ใช้ `#dcdfe4`) | legacy `.table-bordered` |
| ตาราง cell padding (กระชับ) | `0.25rem 0.5rem` (≈ `py-1 px-2`) | report-cnt.php `<style>` `.table td` |
| status fstatus-3 (magenta) | `#e100a4` · fstatus-4 (golden-brown) `#9f6213` | legacy-report-cnt.css badge-pink/brown |

## 2. Theme legacy ที่ ปอน ทำไว้ (reuse — อย่าเขียนใหม่)
ไฟล์ **`app/[locale]/(admin)/admin/report-cnt/[fNo]/legacy-report-cnt.css`** = clone legacy เต็ม scoped `.pcs-rc`:
`.pcs-card` (การ์ดขาว+กรอบ) · `.pcs-tabs`/`.pcs-tab` (dashed pill tab) · `.pcs-sum` (totals ส้ม) · `.pcs-table` · `.badge-*` · `.btn-*` · `.pcs-fixed-actions` (ปุ่มลอย).
- **pattern:** `<div className="pcs-rc"><section className="pcs-card"><TopMenuReport embedded />...`
- **ปุ่มลอย fixed** ต้อง **`createPortal` ไป `document.body`** (+ mount-guard) ไม่งั้นโดน transformed ancestor ของ admin-shell → `position:fixed` ไหลลงล่างสุดแทนที่จะคาจอ.

## 3. report-cnt (`/admin/report-cnt`) — ✅ DONE
- **page.tsx:** header ห่อ `.pcs-rc`+`.pcs-card` · `<TopMenuReport embedded>` (กรอบ dashed กลับมา · เดิม `.pcs-dashsoft` ถูก scope ใต้ `.pcs-rc` ที่มีแค่หน้า detail → list เลยเป็น text เปล่า) · sub-tabs + transport = `<PcsTab>` (`.pcs-tabs`/`.pcs-tab` dashed pill) · import `./[fNo]/legacy-report-cnt.css`.
- **cnt-list-table.tsx:** totals = gradient ส้ม `#ee7411→#c24e4e` · thead ดำบนขาว ไม่ uppercase · **ขนส่ง = pill สี** (ทางรถ `#1e9ff2` / ทางเรือ `#28d094` / อากาศ `#ff9149`) · **หมายเลขตู้ = `#1e9ff2` ฟ้า** · **ปุ่มลอย portal→body มุมซ้ายล่าง** (`lg:left-20` เลี่ยง sidebar) · compact `py-1` + zebra ชัด `even:bg-[#f1f4f8]`.
- **commits:** `b00f5acf` (frame+totals+header) · `66547ed8` (ขนส่งสี/เลขตู้ฟ้า/portal) · `<compact+zebra นี้>`.
- ⚠️ ยัง authed-click-test ไม่ได้ (Chrome glitch) → ภูม verify ตา.

## 4. drivers — 🟡 IN PROGRESS (งานถัดไป · owner สั่ง 2026-07-16)
เป้าหมาย: แกะสี+ตาราง legacy แล้วทำให้เหมือน (ไล่ทีละหัวข้อ). legacy source ที่เกี่ยว:
`pcs-admin/forwarder-driver.php` (2103 บรรทัด · list + `?page=add` · tabs = `nav nav-tabs pcs-tabs` เหมือน report-cnt · icon la-truck/la-home 2.2rem).

### หน้าสร้างรายการขนส่ง (`/admin/drivers/new`) — legacy `forwarder-driver.php?page=add`
- ✅ **แท็บ = legacy dashed pill แล้ว** (`drivers/new/page.tsx` · `<PcsDriverTab>` = `.pcs-dashsoft` ใน `.pcs-rc`+`.pcs-card` · import `../../report-cnt/[fNo]/legacy-report-cnt.css`) — 5 แท็บ: มอบงานคนขับ/รับเองหน้าโกดัง/Express/กำลังจัดส่ง·ติดตาม/เตรียมส่ง·อนุมัติจ่ายแล้ว(X/Y). commit `<drivers-tabs>`.
- 🔴 **ตาราง form ยังไม่ทำ** (`create-batch-form.tsx` + `self-pickup-form.tsx`) — ภูม flag "ตารางยังไม่เหมือนเลย". ตอนนี้เป็น Tailwind (header bg-surface-alt uppercase · zebra จาง · บริษัทขนส่ง pill ฟ้าอ่อน · link primary-600 แดง · footer bar แดง sticky). **ต้องทำ:** header ดำบนขาว · zebra ชัด · carrier/ขนส่ง = badge สี legacy (info/success) · link = ฟ้า #1e9ff2 · compact · footer อาจ portal (เหมือน report-cnt) — ยึด legacy add-page table + `.pcs-table`. **ตาราง columns เราตรง legacy อยู่แล้ว** ([☑]/จำนวน/บริษัทขนส่ง/เลขแทรคกิ้ง(nested)/ลำดับส่ง/ที่อยู่) แค่สียังไม่ตรง.
- ⚠️ footer action bar (create-batch-form) = `sticky bottom-3` · ถ้า owner บอกไม่คา ให้ portal→body เหมือน report-cnt.

### หน้า list มอบหมายคนขับ (`/admin/drivers`) — legacy `forwarder-driver.php` (list mode) — 🔴 ยังไม่ทำ
เรา `drivers/page.tsx` · ต้องแกะ legacy list + ทำสี/ตารางให้เหมือน (ยังไม่ได้อ่าน legacy list-mode markup).

### hex/สี drivers (เก็บเพิ่มเมื่อแกะ legacy add/list ละเอียด)
- carrier badge สี = อิง `nameShipBy`/badge theme (info #1e9ff2 / success #28d094 · เหมือน report-cnt)
- [เก็บเพิ่ม: legacy add-page table header สี · zebra · footer .m-driver-footer btn-color-main gradient #cc3333→#f15a24]
