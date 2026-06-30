# Data-update 2026-06-29 (เดฟ folder · owner drop) — analysis + plan

Owner dropped `/Users/dev/Desktop/เดฟ` as a "data update" + the Google Sheet
`ลงข้อมูลฝากจ่าย_ต้นทุนกำไร` on Desktop. Owner: "ตรวจ PR คู่ชื่อลูกค้าก่อน apply (PR เพี้ยน) ·
dry-run · ห้ามไหลทำมั่ว". Resync done (HEAD = 836dff74 = main). Env fixed (.env.local DB pw
stale Jirayus40x → DqOzfEZVXfMHIryz).

## Already ingested by the Windows agent (verified on prod, read-only)
HS codes **133** (mig 0224) · WeChat ops **24,428** (mig 0228) · iTAM/แต้ม packing **127 lines/10 ตู้**
(mig 0226) · MOMO cost **65** forwarders · MOMO weight **111** forwarders. ✅ done.

## 🚨 Yuan-transfer (ฝากจ่ายหยวน · the Google Sheet) — NOT done · money-critical
Two sheets: `PR ฝากจ่าย 05-69` (May · 611 rows · **name+shipment-ID format, no PR col**) +
`PR ฝากจ่าย 06-69` (June · 580 rows · explicit PR col). Per row = full cost→sell→profit
(หยวน × rate = THB cost [col22] · ราคาขาย [col29] · กำไรสุทธิ [col37]).

- **tb_payment yuan May+June 2026 = 0 rows** → this data is **OFF-SYSTEM** (done manually,
  recorded only in the sheet) → must **IMPORT** (create records), not backfill.
- 06-69: **31 transactions · Σ cost ฿5,084,366 · Σ sell ฿5,111,436 · Σ profit ฿25,299** ·
  23 distinct (PR,name). 05-69 not yet parsed (name-only format).

### 🔴 PR codes UNRELIABLE — name-based reconciliation (06-69 · 23 distinct → 14 ✓ / 9 ⚠️)
The sheet's PR ≠ the real customer. Proven: sheet `PR008 = บริษัท ซุปเปอร์ซิป` (the ฿655k row)
but **tb_users PR008 = สุวรรณา อูเอดะ** → name suggests **PR8289**. Mismatches to resolve:

| sheet PR | sheet name | tb_users[PR] = | name→suggests | verdict |
|---|---|---|---|---|
| PR008 | บริษัท ซุปเปอร์ซิป | สุวรรณา อูเอดะ | **PR8289** | ⚠️ wrong PR |
| PR017 | บริษัท แลนด์ ออฟ ลีฟ | สหัสชัย ทรัพย์สิน | — | ❓ (PR017 reused for 2 customers) |
| PR10392 | คุณมิ้น | มัณยาภา ณ น่าน | PR6595/PR8396 | ⚠️ wrong PR |
| PR022 | คุณนวรัตน์ | J NAC Thailand | PR2714/PR4965 | ⚠️ wrong PR |
| PR166 | Kenny S | นราธิป สิทธิศุข | — | ❓ manual |
| PR130 | "P22319" | ชวันรัตน์ | — | ❓ (order# in name col) |
| PR 143 | คุณ ดวงเดือน | (no "PR 143") | PR143 | ⚠️ space typo → PR143 |
| PR038 | เทสระบบ Pacred | จิรายุส | — | test row (9.9 หยวน · skip) |
| PR017(2) | คุณสหัสชัย | สหัสชัย | PR017 | ✓ (this one's right) |

14 matched ✓ (PR039/PR121/PR152/PR158/PR9820/PR075/PR095/PR043/PR067/PR191/PR025/PR207/PR073/PR017-สหัสชัย).
→ **Rule: resolve customer by NAME, not the sheet PR. Flag unmatchable for owner.**

### Import target (proposed · TBD owner): `tb_payment` (yuan) — paythb(sell)/paythbcost(cost)/
payprofitthb/payyuan/payrate/payratecost/paydate, userid = the **name-resolved** PR,
paystatus='2' (โอนแล้ว). dry-run → owner review → apply. ⚠️ also feeds VAT/ใบกำกับ (the sheet
has VAT receipt no.) → check the doc-mode.

## ✅ APPLIED 2026-06-30 — yuan-transfer June import (owner rules: ยึด PR DB · name-resolve · June · Pacred PR only · skip-rest)
`scripts/import-yuan-fakjai-0669-2026-06-30.mjs --apply` → **24 records → tb_payment** (session `import-fj-0669` · paystatus='2' · NO wallet · idempotent). Σ ขาย ฿3,493,829.47 · ต้นทุน ฿3,478,097.14 · กำไร ฿15,732.33. PR resolved by NAME (PR008→**PR8289** บริษัทซุปเปอร์ซิป · PR143 · 14 sheet-PR verified-by-name). Verified on prod.

### 🔴 SKIPPED → ถามทีหลัง (owner "อันไหนไม่ตรงเอามาถามทีหลัง") — 7 rows
- **บริษัท แลนด์ ออฟ ลีฟวิ่ง** (sheet PR017) — ไม่เจอชื่อใน tb_users → PR อะไร?
- **"P22319"** (sheet PR130 · เลขออเดอร์ในช่องชื่อ) → ลูกค้าคนไหน?
- **"Kenny S"** (sheet PR166) → PR อะไร?
- **คุณมิ้น** (sheet PR10392) — กำกวม 2 ราย PR6595/PR8396 → อันไหน?
- **คุณนวรัตน์** (sheet PR022 · 2 rows) — กำกวม 2 ราย PR2714/PR4965 → อันไหน?
- เทสระบบ (PR038) = test, ทิ้ง.
- 05-69 (พ.ค.) ทั้งหมด = ไม่เอา (owner: เดือน 6 เท่านั้น).

## 🚚 FREIGHT MERGE epic (owner 2026-06-30/07-01 · AXELRA+NNB+PACRED booking sheets · ฝั่งเฟรท)
Owner rules: resolve by PHONE not the sheet PR (มั่ว) · phone-in-DB→LINK · not→CREATE-NEW (pw **123456** · login=phone · PR lowest-vacant via trigger · userActive=1) · no-phone→chase · sales Mayjang/MAY→admin_may·Pupu→admin_pupu·Pee→admin_pee·else(ออกแล้ว)→admin_center · CS→admin_ploy · June only · **ห้ามเก็บเงินซ้ำ**. Sheets: PACRED/AXELRA `1.MEMBER SALE` (customer) · `2.SALE BOOKING` (shipment 2059+1526) · ACC `เบิกเงินทำงาน SEA/AIR/TRUCK/Cargo` (cost).

### ✅ Phase 1 — CUSTOMERS APPLIED to prod (`scripts/import-freight-customers-2026-06-30.mjs`)
478 rows → 370 distinct phones → **LINK 118** (existing PR · incl. 25 my phone-map missed but auth-collision caught → resolved via auth→profile) · **CREATE 251** (new PR225+ · pw 123456 · sales: center 190/may 57/pee 2/pupu 2) · **NO-PHONE 86** (chase · 56 have TAX, 48 email) · **ORPHAN 1** (คชาธร ทองศรี 0922750655 · tb_users dup-key · manual). Summary CSV → `/Users/dev/Desktop/freight-customer-summary-2026-07-01.csv` (สำหรับเซลไล่ตามเบอร์). ⚠️ LESSON: supabase-js `.select()` caps 1000 rows → MUST paginate (the dry-run caught a 60-dup risk). tb_users has NO userTax col → tax-id kept in userNote.

### ✅ Phase 2 — SHIPMENTS APPLIED (`scripts/import-freight-shipments-2026-07-01.mjs`)
PACRED June(107)+May(38) → **139 freight_shipments** (83 customers · AXELRA has NO June/May · its data Nov25-Mar26 · skipped). resolve customer→profile_id (member→PR else name→PR · 6 TTW no-match skipped). transport_mode sea_lcl 69/truck 45/sea_fcl 17/air 8 · status delivered 40/draft 73/in_progress 21/cancelled 5 (DB-check-compliant) · service_key freight_import/export/import_cargo · idempotent by job_no · records+status only (no charge). ⚠️ LESSONS: freight_shipments status enum = draft|confirmed|in_progress|cleared|delivered|cancelled (not in_transit) · cancelled needs reason+at · service_key valid set is the 14 catalog keys.

### ⏭️ Phase 3 — COST/เบิกเงิน (ACC sheet · 16 sheets SEA/AIR/TRUCK/Cargo/STATEMENT) = NEXT (money-riskiest · ห้ามเก็บเงินซ้ำ)
match เบิกเงิน → the imported shipment (job_no) + dedup (skip already-paid/billed) → freight_shipments cost_* fields. dry-run→owner→apply. The double-charge guard lives here.

## Other เดฟ sources (owner picked all · DEFERRED → next session / owner input)
- **MOMO - Packing List (17 xlsx)** → fill the ฿294k drift (MOMO API dropped 30-40% · 110 trackings).
  re-derive SELL = money → dry-run + owner เคาะตู้.
- **เรทนำเข้า (3 rate images) — DECODED 2026-06-30 · รอ owner เคาะก่อน set (money):**
  - **รูป 3 (PCS) = import freight matrix · อี้อู+กวางโจว** (บาท/CBM /KgM): รถ ทั่วไป **5,500/20** · อย./มอก. 6,000/30 · พิเศษ 7,500/50 — เรือ ทั่วไป **3,500/15** · อย./มอก. 4,000/20 · พิเศษ 6,500/35. ⚠️ CONFLICT vs existing per-warehouse SELL floor (กวางโจว รถ4900/เรือ2900 · อี้อู รถ5500/เรือ2900 · [[sell-floor-rate-model]]) — รูป รถ5,500/เรือ3,500 ≠ floor.
  - **รูป 1+2 = ใบขน service fees** (ปลีก/ขาประจำ): พิธีการใบขน 3,500/2,500 · Form E 2,500/1,500 · ลงทะเบียน 1,500 · ค่าธรรมเนียมศุล 200 · EDI 150 · รวม 7,850/5,850 → feeds customs-doc-kit/ใบขน fees.
  - **NOT set** — money · differs from existing · รอ owner เคาะค่า+map ก่อน apply.
- **Apirat ([LINE] chat อภิรัตน์ฯ)** → CRM backlog (customer conversation).
- **Feature**: edit/add tracking for goods already ถึงโกดัง (multi-shop · some shops arrive later).
- Show THB cost summary at top (owner "มีเงินบาทต้นทุน สรุปให้ดูข้างบน").

## Money-safety protocol (every apply)
name-resolve → dry-run (print what WOULD write) → backup → owner OK → `--apply`. Never trust the
sheet PR. [[cost-editable-sell-locked]] [[audit-discipline]].
