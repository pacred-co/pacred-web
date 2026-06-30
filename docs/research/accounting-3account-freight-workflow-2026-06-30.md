# 🏦 Pacred accounting (3-account model) + freight workflow + role/workspace — reference (2026-06-30)

> Owner dropped: the 3 real bank accounts (+ 2 Thai-QR images), 12 accounting xlsx, the
> `inv_draft_system auto` Python tool, and the freight workflow brief (6 txt). This doc is the
> consolidation; the SOT for the accounts is **`lib/payment/bank-accounts.ts`** (embedded in code
> per owner "ฝังไว้ในรากฐาน ห้ามผิด"). Deep xlsx ingestion + the freight BUILD = next session.

## 1. 🏦 THE 3 bank accounts (บมจ. กสิกรไทย · บจก. แพคเรด (ประเทศไทย)) — SOT = `lib/payment/bank-accounts.ts`

| # | lane | บัญชี | ประเภท | ช่องทาง | ใบกำกับ? | ใช้กับ |
|---|---|---|---|---|---|---|
| 1 | **SERVICE** | `204-1-55856-6` | ออมทรัพย์ | PromptPay นิติ `0105564077716` | ❌ ไม่ออก | งานบริการ · เฟรท · ออกใบขน · ฝากโอน · ฝากสั่ง · ฝากนำเข้า |
| 2 | **LOGISTICS** | `225-2-91144-0` | กระแสรายวัน | Thai-QR (K-Shop) | ❌ ไม่ออก | ค่าขนส่งในไทย · ฝากนำเข้าอย่างเดียว (ของถึงไทย ชำระก่อนจัดส่ง) |
| 3 | **TRADING** | `232-1-07669-9` | กระแสรายวัน | Thai-QR (K-Shop) | ✅ ออก + VAT 7% | ทุกงานที่เลือกออกใบกำกับภาษี |

**ROUTING RULE** (`resolvePaymentAccount` · order matters · 5-test locked):
1. ออกใบกำกับ? → **TRADING** (+VAT 7%) — overrides type.
2. ค่าขนส่งในไทย / ชำระปลายทางก่อนจัดส่ง? → **LOGISTICS**.
3. อื่นๆ (ไม่ออกใบกำกับ) → **SERVICE** (PromptPay).

**VAT:** เก็บ 7% เฉพาะ TRADING (ใบกำกับจริง → ภพ.30). SERVICE/LOGISTICS ไม่ออกใบกำกับ → ไม่มี VAT line.
ใบขน = Non → margin-VAT internal only (lib/tax/tax-doc-mode.ts).

**🔴 TODO (owner + next session):** วาง 2 QR PNG ลง `public/images/payment/qr-logistics.png` + `qr-trading.png`
(owner ยืนยัน ref ไหน→บัญชีไหน · KPS004KB000002318217 / KPS004KB000002308515). **WIRE** `resolvePaymentAccount`
เข้าทุก payment surface (cart/forwarder-pay/billing-run/yuan) ที่ตอนนี้โชว์ PromptPay เดียว (lib/promptpay.ts)
→ ต้องโชว์บัญชี/QR ที่ถูก lane ตาม doc-mode. (อย่ารื้อทีเดียว — wire ทีละ surface + money-review.)

## 2. 📊 Accounting data (12 xlsx · `Desktop/ข้อมูล data ต้นทุน บัญชี/` + Google Sheets) — next-session deep-dive

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| ACC - PACRED&PCS เบิกเงิน | คำขอเบิกเงิน (disbursement) ฝั่ง PACRED+PCS |
| PACRED BOOKING | booking งานเฟรท/คาร์โก้ |
| ข้อมูลการชำระ ACC | ledger การชำระเข้า (เทียบ 3 บัญชี) |
| เคลียร์ยอด ตั๋วพ่วง ตู้พี่ดำ | reconcile ตั๋วพ่วง/ตู้ (กองกลาง) |
| ลงข้อมูลเปิดใบกำกับภาษี/ต้นทุนกำไร | ต้นทุน-กำไร ต่อใบกำกับ (TRADING lane) |
| ลงข้อมูลฝากจ่าย_ต้นทุนกำไร | ต้นทุน-กำไร ฝากจ่ายหยวน (CNY transfer) |
| ใบหักลูกค้า | ใบหัก ณ ที่จ่าย / หักลูกค้า |
| ข้อมูลการเบิก-จ่ายกองกลาง | กองกลาง (petty/central) เบิก-จ่าย |
| รายละเอียดกลองกลางโกดังจีน | กองกลางโกดังจีน (China-warehouse central costs) |
| ค่าใช้จ่ายบริษัทคงที่ | fixed company OPEX |
| ใบกำกับฝั่ง PACRED / PACRED ใบกำกับภาษี | tax-invoice register (PACRED) |

**`inv_draft_system auto/`** = Python tool (main.py · processor.py · sheets_client.py · template.xlsx ·
google service-account json · skills.json) — auto-drafts invoices from a Google Sheet into an xlsx template.
Study before building the in-app ใบกำกับ auto-draft (it encodes the real invoice layout + the sheet→invoice mapping).

## 3. 🚚 Freight workflow (`Desktop/บรีฟเวิคโฟลว งานเฟรท/` · owner-traced) — the build spec

**3 phases:** ORIGIN (ต้นทาง) → TRANSIT (ระหว่างขนส่ง) → DESTINATION (ปลายทางไทย→ลูกค้า).
**6 transport flavours** each with its own ordered status list (สรุป Workflow.txt):
- TRUCK+FCL (15) · TRUCK+LCL (16) · SEA+FCL (18 · POL/ETD/ATD/ETA/ATA/POD/แลก D/O) · SEA+LCL (19) ·
  AIR+Cargo (17 · AWB) — all share ปลายทาง: ถึงโกดังไทย → รอชำระ → เตรียม/จัดส่ง → ส่งสำเร็จ → **วางบิล (ภายใน) → ปิดงาน (ภายใน)**.
- วางบิลเริ่มได้ตั้งแต่ "ถึงโกดังไทย".
**สี:** 🟢 เสร็จ · 🟡 รอ · 🔵 กำลังทำ · 🔴 Delay/ปัญหา (RED = flag ทับสถานะปัจจุบัน เช่น IN_TRANSIT+DELAY ·
CUSTOMS_TH+HOLD — ไม่ใช่ step แยก). บางสถานะ "ภายใน" ไม่โชว์ลูกค้า (`show_customer` flag · ลูกค้าเห็นเฉพาะที่เปิด).

**Role/workspace (8 roles · สิทธิ์การใช้งานตามตำแหน่ง.txt) — "natin กับ role and workspace":**
1. **Sales** — รับลูกค้า/Booking/แก้ข้อมูล/อัปโหลดสินค้า/แชท · status: รอดำเนินการ→รอลูกค้าคอนเฟิร์ม→คอนเฟิร์มแล้ว · ❌ แก้ราคาหลังอนุมัติ/ปิดงาน/วางบิล.
2. **Pricing** — ตรวจ Booking/ประเมินราคา/ออกใบเสนอราคา/แก้เรท · status: รอประเมิน→เสนอราคาแล้ว→แก้ราคาแล้ว.
3. **Document/CS** — Invoice/Packing/BL-AWB/FORM E/ใบขน/แมส/แลก D/O · status: เตรียมเอกสาร→ครบ→แลก D/O→ยื่นใบขน→ผ่านพิธีการ.
4. **Operation/Transport** — รับตู้/โหลด/ปิดตู้/จองรถ-เรือ-ไฟลท์/Tracking ETA/ส่ง/คืนตู้ · status: รับตู้→โหลด→ระหว่างขนส่ง→ถึงปลายทาง→ส่งลูกค้า→คืนตู้.
5. **Accounting** — ตั้งเบิก/รวมค่าใช้จ่าย/ออก Invoice/วางบิล/รับชำระ · status: รอวางบิล→วางบิลแล้ว→รอชำระ→ชำระแล้ว→ปิดงาน.
6. **Manager** — อนุมัติราคา/Override สถานะ/Assign/เห็นทุกแผนก/KPI.
7. **CEO/Admin** — เห็นทุกงาน/แก้ทุกอย่าง/ลบ/คืนสถานะ/รายงานกำไร/Dashboard.
8. **Customer Portal** — เห็นแค่ของตัวเอง: Booking/Shipment Status/Tracking/ดาวน์โหลด Invoice·BL/แจ้งชำระ/แชทเซล.

> Existing freight infra is ~80% scaffolded (freight_quotes/shipments/invoices/customs_declarations +
> the ops cockpit `/admin/freight/operations` + leads inbox). The build = align the status model above +
> the 8-role workspace onto it. See `docs/research/freight-knowledge-2026-06-01/` + `full-scope-gap-2026-06-08.md`.

## 4. 👥 Customer base = 3 ฝั่ง (⚠️ ยึด DB เราเป็นหลัก · ระวังผิด)
The customer base spans **3 sides** (PACRED + PCS-legacy + …). When matching a customer/order, ALWAYS
resolve from OUR live `tb_users`/`tb_*` (never assume a code maps 1:1 across sides). coID PCS→PR rebrand
(mig 0182) + the staff-code separation already addressed part of this; freight customers may be a distinct
set — verify against the DB before billing/linking.

## 5. 💰 ฿294k MOMO-API-drop = DATA-MATCH, not re-bill (owner correction 2026-06-30)
The ฿294k drift (`/admin/api-forwarder-momo/drift`) is about making OUR records correct (fill the
weight/CBM MOMO's API dropped) — **NOT charging customers new/again.** The existing `applyTaemReconcile`
already PROTECTS billed rows (fstatus 5/6/7) so a paid/closed job is never re-billed; it only fills
non-billed rows so future bills are right. Reframe the drift-queue copy as "ข้อมูลยังไม่ตรง · เติมให้ครบ ·
ไม่เก็บซ้ำลูกค้าที่จ่าย/ปิดแล้ว". Before applying any row: check งานจบ/ยังไม่จบ · จ่าย/ยังไม่จ่าย → only
match data, never collect again. See [[itam-momo-api-drop-294k]].
