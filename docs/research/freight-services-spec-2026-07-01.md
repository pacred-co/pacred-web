# Freight services build spec — owner 2026-07-01 (NEXT SESSION · อ่าน process ดีๆ อย่าเดา)

Owner directive after the freight↔cargo data merge. **Captured at 97% context → execute next session with fresh context.** Owner: "อ่าน process งานดีๆ อย่าเดา."

## 🎯 DESIGN RULE (load-bearing — owner pushed back "อย่าทำหน้าใหม่จัดเรียงมั่วๆ")
**ทุกหน้า/ทุกฟีเจอร์ใหม่ ยึดหน้าตา + การทำงาน จาก 2 หน้านี้เป็น base** (owner ถือว่าสมบูรณ์ที่สุด · ทั้งลูกค้า + แอดมิน):
1. **ฝากสั่งซื้อ (shop-order)** — customer (`(protected)/service-order`) + admin (`(admin)/admin/service-orders`).
2. **รายงานตู้ (report-cnt)** — `(admin)/admin/report-cnt`.
อย่าออกแบบ layout ใหม่ · เอา pattern/UX/flow จาก 2 หน้านี้มาใช้กับทุกส่วนของ platform.

## 1) บริการยังไม่ครบ — เคลียร์ติดด่าน · CIF · AIR
Owner: "งานเคลียร์สินค้าติดด่านไปไหน · งาน CIF · งาน AIR · เอามายังไม่ครบทุกบริการ". → ตรวจ service_catalog (mig 0232 · 14 keys) + the freight shipment import (เอาเฉพาะ TYPE บางอัน) ว่าบริการไหนขาด: customs-clearance (เคลียร์ติดด่าน) · CIF term · AIR. เติมให้ครบทุกบริการเฟรท. (freight import รอบที่แล้ว = PACRED June 139 · TYPE SEA/TRUCK/AIR/EK/ฝากสั่ง/ใบขนขาออก/ขอคืนภาษี — ตรวจว่า map ครบ service ไหม.)

## 2) Freight customers → Sales call-list + source tabs
- เอาลูกค้าฝั่งเฟรท (369 imported) ใส่ใน **sales โทรตามลูกค้า** (the leads/lead-call CRM · `imported_leads`/lead_call_log · `(admin)/admin/leads`).
- **เพิ่ม "source" tab** — เดิมมีแค่ PCS → เพิ่ม source=**freight** (แยกแหล่งลูกค้า).
- **86 ไม่มีเบอร์ → tab แยก "งานฝั่ง freight รอตามลูกค้า (ไม่มีเบอร์)"** (chase list · data ครบใน freight-customer-report CSV + userNote).

## 3) cargo cost — รอ MOMO วางบิลมาก่อน (owner เคาะ · กันมั่ว)
ต้นทุนขาย 0669 ไม่ยัด · รอ MOMO วางบิลเข้ามาก่อน (per-order cost จะมาทาง MOMO) → จะได้ไม่มั่ว. ✅ ตรงกับที่วิเคราะห์ไว้ (no per-order link).

## 4) ใบกำกับ (tax invoice) + ใบขน (customs declaration) — ต่อยอดจาก HS CODE + report-cnt
ต่อยอดจาก: HS CODE work (mig 0224 · 124 codes · hs-consult) + the tax-invoice issuance + the cargo declaration item-picker (built 2026-06-28: `/admin/forwarders/[fNo]/customs-doc` + `/admin/accounting/cargo-declarations/[id]` + PL/CI/Excel/Form-E).
- **จาก หน้ารายงานตู้ (report-cnt): เลือกรายการสินค้า → จัดลง invoice → ทำ packing list → ทำใบขน** (the item-picker flow · but FROM report-cnt). อ่าน report-cnt detail (เลือกสินค้าได้) → ต่อปุ่ม "จัดลงอินวอยซ์/แพคกิ้ง/ใบขน".
- **จุดเปลี่ยน เอาเอกสาร (ใบกำกับ): คิด VAT 7% + โอนเข้าบัญชี Trading** (bank-accounts SOT · TRADING 232-1-07669-9 · ใบกำกับ+VAT7%). ค่าขนส่งในไทย → LOGISTICS account (ตายตัว · คนละเรื่อง).

## 5) ใบขนพ่วง (combined customs declaration) — ออกใบขนชื่อลูกค้าเอง
process (อ่านดีๆ · อย่าเดา): คล้ายใบกำกับ แต่ออก**ใบขนเป็นชื่อลูกค้าเอง** →
1. เอา HS CODE มาตรวจว่า**ติดอะไรไหม** (ใบอนุญาต/Form-E/อากร).
2. ส่ง **draft invoice + packing list + ใบขน** ให้ลูกค้า.
3. ลูกค้า**เฟิมยอด** → เก็บ **ค่าบริการ + ค่าภาษีในใบขน** → เข้าบัญชี **SERVICE** (204-1-55856-6 · บริการ).

## 3-account routing SOT (`lib/payment/bank-accounts.ts`)
- **TRADING** 232-1-07669-9 — ใบกำกับ + VAT 7% (สั่งซื้อกับเรา · จุด "เอาเอกสาร").
- **SERVICE** 204-1-55856-6 — บริการ (ใบขนพ่วง ค่าบริการ+ภาษี · พิธีการ).
- **LOGISTICS** 225-2-91144-0 — ขนส่งในไทย (ตายตัว).

## Sources / refs
freight data: `docs/research/data-update-2026-06-29.md` · `/Users/dev/Desktop/freight-customer-report-2026-07-01.csv`. ใบกำกับ/HS legacy + the AXELRA ใบขน fee SOT (`lib/customs/declaration-fees.ts`). The 3-bank SOT + the report-cnt + shop-order pages = the design base.
