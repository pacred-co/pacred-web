# 🌅 SAVE-POINT 2026-05-30 — Customer-profile rate editor + Thai tax engine + P2 billing wire

> **เดฟ session (เครื่องที่ทำงาน) — ดึงไปต่อที่บ้านได้เลย ไม่ต้องบิ้ว agent ใหม่.**
> ทุกอย่าง push บน **`dave-pacred` (= main)** แล้ว. Resume = `git pull origin dave-pacred` + อ่านไฟล์นี้.

## TL;DR — ทำอะไรไปบ้าง
Owner ส่งหน้า legacy customer-profile มาถามว่า "เอามาครบจริงไหม — ลูกค้าปรับเรทขาย/ต้นทุนในหน้า user ได้ เชื่อมวางบิล". คำตอบเดิม = **ยังไม่ครบ** (read-only stub + ตัวปรับเรทเขียนแค่ history). Session นี้ปิดจนจบ:

1. **ตัวปรับเรทขายต่อลูกค้า ในหน้า profile** (faithful port `#rate-settings`) — เขียน **live `tb_rate_custom_kg/cbm` + history พร้อมกัน** + cost-floor + SVIP + **ปุ่มย่อ/ขยาย**
2. **Thai tax engine** (`lib/tax/wht.ts`) — owner ยืนยัน 5 กฎ: transport 1% · service 3% · rental 5% · goods 0% (อยู่ใน VAT base · ไม่หัก) · VAT 7% (intl leg 0%)
3. **Profile features ครบ** — 8 stat cards · note · edit นิติบุคคล · address CRUD · editSale (แก้ split-brain)
4. **P2 — เชื่อม rate+tax เข้าวางบิลจริง** — dimension-edit ดึง per-user rate มาคิด ftotalprice อัตโนมัติ + ออกใบกำกับ/VAT/WHT ตอน payment (opt-in) + ใบเสร็จ per-line WHT

## Commits (บน dave-pacred = main · 2026-05-30)
| commit | งาน |
|---|---|
| `7114f03`/`d5cec4f` | P0+P1 tax (WHT engine + cart selector) + per-customer rate editor (live+history) · migration 0126/0127 |
| `ab7238db` | tax engine refine (rental 5% · intl VAT 0% · goods 0%) หลัง owner ตอบ 5 ข้อ · migration 0128 |
| `85a209f7` | profile features (collapsible + 8 stat cards + note + corporate + address CRUD + editSale) — agent A |
| `<this push>` | P2 billing wire (resolve-rate + dimension-edit + tax-at-payment + receipt) + wht.ts fTotalPrice fix · migration 0129 — agent B + integration |

## Migrations — ✅ all applied prod (yzljakczhwrpbxflnmco)
0125 customer-usage-split · 0126 tax-rates-seed · 0127 order-tax-doc-pref · 0128 tax-rates-rental-goods · **0129 forwarder-tax-invoice (3 tb_*-native tables)**. NEXT FREE = **0130**.
business_config tax rows: transport 1 · service 3 · rental 5 · goods 0 · VAT 7.

## ⚙️ สถานะ live (อะไรทำงานจริงแล้ว)
- ✅ **ตัวปรับเรท** (`/admin/customers/[id]`) — เขียน live `tb_rate_custom_*` จริง (verified PW+PR124 browser)
- ✅ **dimension-edit auto-price** (`adminUpdateForwarderDimensions`) — กรอกขนาด/น้ำหนัก → resolve rate (manual→SVIP→VIP→general waterfall · faithful port `calPriceForwarder`) → เขียน `ftotalprice`/`frefrate`. **กัน ฿0** (rateMissing → error บอกให้ตั้งเรทก่อน). **นี่คือ behavior change** — เดิม admin พิมพ์มือ ตอนนี้ auto (ตรง legacy)
- ✅ **ใบเสร็จปกติ (tax_doc_pref='receipt'/null)** — amount **ไม่เปลี่ยน** (ยังใช้ calcForwarderOutstanding flat-1% เดิม · personal byte-identical)
- ⚙️ **ใบกำกับภาษี (tax_doc_pref='tax_invoice')** — opt-in: ตอน payment ออกใบกำกับ + per-class WHT ลง `tb_forwarder_tax_invoice*` (best-effort · ไม่ block receipt). ใช้ engine per-line. คนเลือกตอน /cart (P1) หรือ booking

## 🔑 ไฟล์สำคัญ (file map)
- `lib/admin/customer-rate-tables.ts` — constants (warehouse 1=กวางโจว 2=อี้อู · transport · product · DEFAULT_START · COST_FLOOR)
- `actions/admin/customer-rate.ts` — `adminSaveCustomerRate` (live+history) · `getCustomerRateMatrix`
- `app/[locale]/(admin)/admin/customers/[id]/rate-editor.tsx` — ตัวปรับเรท + collapsible
- `app/[locale]/(admin)/admin/customers/[id]/profile-sections.tsx` — stat cards/note/corporate/address/editSale (client)
- `actions/admin/customer-profile.ts` — profile CRUD actions
- `lib/tax/wht.ts` — tax engine (`computeForwarderTax` · `computeTax`) · `lib/tax/rates.ts` (business_config loader)
- `lib/forwarder/resolve-rate.ts` — rate waterfall (pure · 49 tests)
- `actions/admin/forwarders-edit.ts` — `adminUpdateForwarderDimensions` (LIVE money path · review บรรทัด 368-462)
- `lib/admin/forwarder-tax-invoice.ts` — tax-invoice adapter (best-effort)
- `lib/admin/auto-issue-receipt.ts` §8b — tax-invoice bridge ที่ payment
- `app/[locale]/(protected)/service-import/receipts/print/page.tsx` — ใบเสร็จ/ใบกำกับ per-line WHT

## 🟡 FLAGGED — ตรวจ/ตัดสินต่อ (money-sensitive)
1. **`fTotalPrice` = ค่าขนส่ง CN→TH (ไม่ใช่สินค้า)** — แก้ wht.ts mapping แล้ว (ftotalprice+chnthb → transport intl · VAT 0% · WHT 1% · goods=0). verified จาก prod data (ftotalprice ≈ weight×rate) + legacy printReceiptF. **ฝากนำเข้าไม่มีบรรทัด goods**
2. **VAT treatment ของแต่ละ leg** — ftotalprice (CN→TH) + chnthb (ในจีน) = VAT 0% · ftransportprice (ในไทย) + service = VAT 7%. ถ้าบัญชีเห็นต่าง แก้ที่ `computeForwarderTax` mapping
3. **Promo auto-discount on re-price ไม่ได้ port** (legacy update_data L2022-2061 · promoID→fDiscount) — เจตนา (เลี่ยง dimension-edit เปลี่ยน discount เงียบๆ). ต้องการ → port + owner sign-off
4. **ใบเสร็จ amount ยังเป็น flat-1%** (calcForwarderOutstanding) สำหรับ tax_doc_pref='receipt' — per-line WHT ใช้เฉพาะ tax_invoice. ถ้าจะให้ใบเสร็จปกติใช้ per-line ด้วย ต้องสลับ calc (กระทบทุก receipt — sign-off)
5. **50-ทวิ direction** — owner ยังไม่ระบุชัด (Pacred รับจากลูกค้า/ออกเอง). `tb_forwarder_wht_entry.cert_status` track การรับไว้แล้ว
6. **e-WHT reduction** — owner: ใช้ e-WHT (service ลด 1%). ยังไม่ฝังใน nominal · จัดการตอน remit

## ✅ Verify ที่ทำแล้ว
- tsc 0 · lint 0 errors · wht.test 45 pass · resolve-rate.test 49 pass · build [กรอกผล]
- browser: customer profile (PW SVIP + PR124 นิติ) render ครบ · collapsible · rate save round-trip · 0 console err
- ⚠️ **ยังไม่ click-test**: profile write-actions (note/corporate/address — เลี่ยง mutate ลูกค้าจริง) · dimension-edit submit (เลี่ยงเปลี่ยนราคา order จริง) · tax-invoice issue. **แนะนำ test บน order/ลูกค้าทดสอบที่บ้าน**

## ▶️ Resume ที่บ้าน
```bash
cd <pacred-clone>
git fetch origin && git checkout dave-pacred && git pull origin dave-pacred
head -90 docs/research/save-point-2026-05-30-rate-tax-profile.md
cat docs/audit/customer-profile-rate-audit-2026-05-30.md
cat docs/research/tax-billing-flow-design-2026-05-30.md   # §6 = 5 owner answers
pnpm install && pnpm dev   # :3000
```
**Pickup options:** (A) controlled write-test ของ profile CRUD + dimension-edit + tax-invoice บน order ทดสอบ · (B) ใบขนสินค้า (customs declaration · P3 · owner: ใช้คู่ใบกำกับได้) · (C) freight parity (P4) · (D) promo auto-discount port (flag #3) · (E) ถ้าบัญชีเห็นต่างเรื่อง VAT-per-leg → แก้ wht mapping
