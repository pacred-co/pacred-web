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

---

# 📍 CODE MAP (Explore agent · 2026-07-01 · path:line — build from THIS, don't re-survey)

## 1) Shop-order = design base (copy these patterns)
- customer: `app/[locale]/(protected)/service-order/page.tsx` (list+bulk-pay) · `.../[hNo]/page.tsx` (detail+edit tabs) · `.../[hNo]/shop-order-pay-modal.tsx` (window.confirm = confirm-before-mutate §0f)
- admin: `app/[locale]/(admin)/admin/service-orders/page.tsx` (status tabs + search + date filter) · `service-orders-table.tsx` (tab/filter dispatcher)
- status SOT: `lib/admin/service-order-status.ts` HSTATUS_CFG (7 states · soft-pill bg-{hue}-100/text-800/border-300 · `next` hint + `act:true` = staff-action-now §0g)
- actions: `actions/admin/service-orders.ts` · `actions/admin/service-orders-shop-workflow.ts` (state machine)
- row layout: ID · date · hNo · customer · title · price · status-pill · update · actions

## 2) report-cnt + the ITEM-PICKER (already built — REUSE, don't rebuild)
- `app/[locale]/(admin)/admin/report-cnt/page.tsx` groups tb_forwarder by fCabinetNumber · views รอเข้า/เข้าโกดังไทย · filter รถ/เรือ · `cnt-list-table.tsx` (25-col · cost/profit role-gated)
- **THE picker = `app/[locale]/(admin)/admin/forwarders/[fNo]/customs-doc/cargo-doc-picker.tsx`** — tick items → `adminCreateCargoDeclarationFromItems` → DRAFT ใบขน (import/export toggle · shows item·HS·qty·weight·declared · warns missing HS)
- exports: `actions/admin/export/freight-declarations.ts` (invoice + packing list + ใบขน PDF · freight & cargo variants)
- → task #16: add a "จัดลงอินวอยซ์/แพคกิ้ง/ใบขน" entry FROM report-cnt that reuses cargo-doc-picker (the picker exists on forwarder detail today)

## 3) HS code + ใบกำกับ + ใบขน (build on these)
- HS consult: `app/[locale]/(admin)/admin/accounting/hs-consult/page.tsx` · `actions/admin/hs-consult.ts` (→ `upsertHsCode`) · dict `hs_codes` via `actions/admin/hs-codes.ts`
- ใบกำกับ issuance: `actions/tax-invoices.ts` (reads `tb_forwarder_tax_invoice` freight + `tb_shop_tax_invoice` cargo/yuan) · `actions/admin/etax-export.ts` (list issued)
- **tax-mode SOT `lib/tax/tax-doc-mode.ts`**: tax_invoice(ใบกำกับ·goods·VAT) · customs(ใบขน·service-fee-only) · receipt(ไม่รับฯ·margin-VAT internal) ← this already encodes the VAT/account logic
- decl fee: `lib/customs/declaration-fees.ts` + `components/admin/declaration-fee-panel.tsx`
- cargo decl (P3 · NO money mutation): `actions/admin/cargo-declarations.ts` (declared seeded from cost · editable DOWN only ADR-0016 · logAdminAction)

## 4) Leads CRM (for task #14/#15 source tabs)
- `app/[locale]/(admin)/admin/leads/page.tsx` — **6 segment chips** (mine·callback·pending·closed·summary) + URL `?segment=` · `actions/admin/imported-leads.ts` **has `source` col already** (SELECT_COLS) · WORK_ROLES super/manager/sales_admin/sales/ops · non-ultra force-scoped to assigned_admin_id
- freight inbox exists: `app/[locale]/(admin)/admin/freight/leads/page.tsx` (chips new·contacted·quoted·won·lost·spam)
- **build pattern**: add a `source` chip selector (pcs / freight / freight-no-phone) + `WHERE source=?`. ⚠️ the 369 freight customers landed in **tb_users NOT imported_leads** → task #14 must EITHER insert them into imported_leads (source='freight', the 86 no-phone → source='freight_no_phone') OR union tb_users-freight into the leads query. Decide at build time (insert = cleaner reuse of the call-tracking UI).

## 5) Service catalog — CORRECTION (most "missing" services already exist)
- `lib/services/service-catalog.ts` SERVICE_CATALOG (13 keys) + mig 0232 mirror table
- **isLive ALREADY**: shop_order·yuan_transfer·import_cargo · freight_import·freight_export (both support **air**+fcl/lcl) · **customs_clearance (เคลียร์ติดด่าน)**·tax_documents·domestic_logistics
- coming-soon: tax_refund·fumigation·consignment·bill_payment·broker_matching
- **CIF = incoterm** (`freight_shipments.incoterm`), NOT a catalog key — don't add as a service
- → task #13 is mostly SURFACE/reachability (§0d) + correct import-mapping, NOT new catalog entries. Verify เคลียร์ติดด่าน/freight-air are reachable + the import mapped AIR→air, customs jobs→customs_clearance.
- freight_shipments (mig 0233 · 29 cols): transport_mode sea_fcl/sea_lcl/air/truck · journey confirmed→cn_cleared→etd→departed→eta→ata→do_exchanged→th_cleared→arrived_th_warehouse→delivered→closed · issue_flag overlay

## 6) 3-account routing (confirmed) — `lib/payment/bank-accounts.ts` PACRED_BANK_ACCOUNTS
- TRADING 232-1-07669-9 (QR · **ออกใบกำกับ + VAT 7%**) · SERVICE 204-1-55856-6 (PromptPay 0105564077716 · บริการ/ใบขนพ่วง) · LOGISTICS 225-2-91144-0 (QR · ขนส่งในไทย)
- routing order: tax_invoice→TRADING · domestic-leg→LOGISTICS · else→SERVICE

## 🏗 BUILD ORDER (agent rec · cleanest first)
1. **task #14/#15 — freight source-tab + 86-no-phone tab** (zero-money · reuse leads segment-chip UI · ships fast · unblocks sales). Decide insert-into-imported-leads vs union.
2. **task #13 — surface customs_clearance/freight-air services** (mostly §0d reachability + verify import mapping · low risk).
3. **task #16 — report-cnt → cargo-doc-picker entry → invoice/packing/ใบขน + VAT7%→TRADING** (reuse the existing picker + tax-doc-mode SOT).
4. **task #17 — ใบขนพ่วง** (ใบขนชื่อลูกค้า · HS-check · draft→customer-confirm→charge service+tax→SERVICE acct) — biggest · last.
