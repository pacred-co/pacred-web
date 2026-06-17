# รายงานตู้สินค้า (report-cnt) + ฝากนำเข้า detail (forwarder/update) — column-by-column data map

> Owner asked (2026-06-16): understand the legacy `report-cnt.php` (รายงานตู้) + `forwarder/update` detail DEEPLY — every header, every column, every cell, where the data comes from, how it links. Source-grounded against the legacy PHP on disk (`/Users/dev/Desktop/pcs-realshit/.../member/pcs-admin/report-cnt.php` 213 KB + `include/pages/report-cnt/*` + `forwarder/update.php` + `forwarder/calPrice.php`). This is the spec for building Pacred's faithful รายงานตู้ + it grounds the rate-summary + MOMO + courier work.

## The two pages and how they relate
- **`forwarder/update/{ID}`** = ONE shipment (1 row of `tb_forwarder`). The per-parcel detail + editor.
- **`report-cnt.php?id={fCabinetNumber}`** = ONE container (the group of `tb_forwarder` rows sharing `fCabinetNumber`, e.g. `GZS260528-1`). The money roll-up of all parcels in that ตู้.
- Link: `tb_forwarder.fCabinetNumber` is the join key. The detail page's "เลขที่ตู้" links to report-cnt; report-cnt's เลขแทรคกิ้ง links back to each `forwarder/update/{ID}`.

## Core data model (the joins behind every cell)
- **`tb_forwarder`** — the shipment spine (1 row = 1 parcel/tracking). Holds fVolume, fWeight, fTotalPrice, fCostTotalPrice, fProductsType, fRefPrice, frefrate, fTransportPrice, fDiscount, fShipBy, fPayMethod, fStatus, fCabinetNumber, fTransportType, fWarehouseChina, fWarehouseName, reforder, adminIDCreator, customRate/customRateKG/customRateCBM, userComparison/userComparisonValue, fAmount/fAmountCount …
- **`tb_forwarder_item`** — the per-box line items under a forwarder (detail/image/dims). The detail "รายการสินค้า" table reads these.
- **`tb_cost_container`** — the per-CONTAINER cost rate card: `(fCabinetNumber, fProductsType1, fProductsType2, fProductsType3, fProductsType4)`. Written ONLY by the report-cnt "ตั้งค่าต้นทุนตู้" modal (`report-cnt.php:917-935` INSERT/UPDATE). 4 numbers = cost rate per product-type (ทั่วไป/มอก./อย./พิเศษ). In the sample all = 2,500.
- **`tb_users`** — customer (userid → PCS code, นิติ/SVIP/VIP badges from coID/userComparison, adminIDSale).
- **`tb_address`** — delivery address (addressID).
- **`tb_header_order`** — the ฝากสั่งซื้อ shop order, when `tb_forwarder.reforder` is set (= hNo). The detail's "รายการฝากสั่งซื้อ : P22276" link.
- **MOMO** feeds `ftrackingchn` + the ID/CO (CG_NO) + cabinet via the commit/sync; warehouse = "MOMO" (fWarehouseName=8).

---

## report-cnt — the รายงานตู้ table (every column → source → formula)
Two tab-views over the same rows: **มุมมอง PCS Cargo** (read) · **ปรับต้นทุนตู้ใหม่** (cost-update). Columns left→right:

| # | Header | Source / formula | Notes |
|---|---|---|---|
| 1 | **ID** | `tb_forwarder.ID` (52092) | row PK; click = nothing (label) |
| 2 | **ID/CO** | the MOMO **CG_NO** (`CCCG79592053742`); split parcels show a range `CCCG…409-CG…418` | carrier container-group no. — **NOT** the CO; distinct axis (memory: CG_NO≠CO) |
| 3 | **เลขแทรคกิ้ง** | `tb_forwarder.fTrackingCHN` + `เลขที่ #ID` | links → `forwarder/update/{ID}` |
| 4 | **รหัส** | `tb_forwarder.userid` → `tb_users` | + badge นิติ/SVIP/VIP from tb_users; links → user profile |
| 5 | **รายละเอียดสินค้า** | `tb_forwarder_item.fDetail` + image `fCover` | thumbnail = magnific popup |
| 6 | **ลัง** | `received/total` boxes = (scanned-into-TH count)/`fAmount`; "รวม" if fAmountCount=1 | "1/1", "11/11", "2/1" — received-vs-expected (the "รายการที่ขาด" basis) |
| 7 | **ปริมาตร (CBM)** | `tb_forwarder.fVolume` | total CBM of the parcel |
| 8 | **หนัก (Kg)** | `tb_forwarder.fWeight` | |
| 9 | **ประเภท** | `tb_forwarder.fProductsType` (ทั่วไป/มอก./อย./พิเศษ) + **SELL rate badge** = `fRefRate` (3,700 / 3,000 / 10 / 6,600 / 2,900 …) | the badge is the **resolved SELL rate** per CBM (or per KG when small like 10/15/25/35) |
| 10 | **เรทต้นทุน** | `tb_cost_container.fProductsType{n}` for this cabinet+type (2,500) | the **COST rate** (what MOMO charges Pacred per CBM) — uniform per container |
| 11 | **ค่านำเข้า** | `tb_forwarder.fTotalPrice` (the China→TH freight SELL) + basis badge **ปริมาตร/น้ำหนัก** = `fRefPrice` (2=CBM,1=KG) | 81.62 ปริมาตร = CBM basis won the max() |
| 12 | **ค่าอัปเดต** | `tb_forwarder.fPriceUpdate` | usually 0 |
| 13 | **ค่าตีลัง** | `tb_forwarder.priceCrate` | |
| 14 | **ค่าขนส่งจีน+** | `tb_forwarder.fTransportPriceCHNTHB` | China freight added later |
| 15 | **ค่าอื่นๆ** | `tb_forwarder.priceOther` | |
| 16 | **การขนส่ง** | `fShipBy` carrier name + district + province (from address) + **ปลายทาง** red badge when `fPayMethod=2` (COD) | "PCS เหมาเหมา / ประเวศ / กทม." |
| 17 | **ค่าขนส่งไทย** | `tb_forwarder.fTransportPrice` | 0 / 50 / 135 (Flash etc.) |
| 18 | **ส่วนลด** | `tb_forwarder.fDiscount` | |
| 19 | **รวมขาย** | composite SELL = fTotalPrice + (adders 12-15,17) − discount | 81.62 |
| 20 | **1%** | WHT 1% = `รวมขาย × 0.01`, shown ONLY for juristic ≥ threshold | 1.82 / 20.65 / 20.44 |
| 21 | **ต้นทุน** | **P:** `tb_forwarder.fCostTotalPrice` = **chargeable-CBM × cost-rate(2,500)** · **S:** Sang-sheet cost (`fCostTotalPriceSheet`, 0 here) | **cost is ALWAYS by CBM** even when SELL is by KG (MOMO charges per คิว). 3 edit links: editCost (PCS) · editCost2 (from S sheet) · editCostSheet |
| 22 | **กำไร** | `รวมขาย − ต้นทุน(P)` = `fProfitTransportCHN`+ | +26.47 (green) |
| 23 | **สถานะสินค้า** | `fStatus` mapped: ถึงไทยแล้ว(4) / รอชำระเงิน(5) / เตรียมส่ง(6) / ส่งแล้ว(7) (+ เครดิตได้ when eligible) | physical+money axis on ONE column (the fstatus overload) |
| 24 | **สถานะตู้** | container-pay status (ยังไม่จ่าย/จ่ายแล้ว ค่าตู้) + transport mode (ทางเรือ/ทางรถ from fTransportType) | the cnt-payment status, separate from fStatus |
| 25 | **ตัวเลือก** | row total `฿รวมขาย` | |
| 26 | **หมายเหตุ** | `tb_forwarder.note` admin note | "สินค้า PACRED" etc. |

### Top summary panel (computed in the JS footer of report-cnt)
- **t5** `166/160` = Σ received / Σ expected boxes · **t9** `16.72710` = Σ fVolume · **t10** `4,541.30` = Σ fWeight
- **t12** `71,556.05` = Σ ค่านำเข้า (import sell) · **t18** `285.00` = Σ ค่าขนส่งไทย · **t20** `71,841.05` = Σ รวมขาย
- **t22** `P: 41,817.81 / S: 0.00` = Σ fCostTotalPrice · **t23** `29,695.32` = Σ per-row profit (table footer)
- ⚠️ **TWO profit numbers** (a real subtlety to replicate): the **panel** "กำไรตู้ +29,738.24" = `ราคาขายตู้(71,556.05, import-only) − ต้นทุน(41,817.81)`; the **table footer** 29,695.32 = Σ(รวมขาย − cost) which folds in ค่าขนส่งไทย + WHT. Don't conflate them.
- "ราคาต้นทุนตู้ 41,817.81 / ราคาขายตู้ 71,556.05 / กำไรตู้ +29,738.24" + "จำนวนรายการที่ขาด" (rows not yet scanned into TH = the ลัง received<expected).

### The "ตั้งค่าต้นทุนตู้" modal (cost-rate editor)
- 4 inputs `fProductsType1..4` (ทั่วไป/มอก./อย./พิเศษ) → POST `customRate` → INSERT/UPDATE **`tb_cost_container`** keyed on fCabinetNumber (`report-cnt.php:917-935`). `resetCustomRate` reverts to the default rate. On save it **recomputes fCostTotalPrice for every row in the container** (the "อัปเดตต้นทุนในตู้ทั้งหมด" button). Header shows "ราคาคิดตามปริมาตร(CBM)" or weight per the mode.
- This is the **COST** side (ต้นทุน), gated to cost-roles. **It is NOT the customer SELL rate** — that's the forwarder detail's customRate block (below).

### Status / dup filters (the colored buttons + DataTables search)
ยังไม่ยิงเข้าโกดังไทย · ยังไม่จ่ายเงิน(ค่าตู้) · จ่ายแล้ว(ค่าตู้) · แทร็คกิ้งซ้ำ · ID/CO ซ้ำ · ยังไม่เก็บเงินลูกค้า — all are client-side `table.search(...)` over hidden marker text per row (e.g. `fillBySatus5()` searches "ยังไม่เก็บเงินลูกค้า"). The "เพิ่มไปยังรายการตรวจสอบแล้ว" posts selected IDs to `getListForwarder-to-check.php` → moves them to `forwarder-check.php` (the pre-billing verify queue).

---

## forwarder/update detail — editable fields → tb_* columns
- **Status timeline** (8 steps): รอเข้าโกดังจีน(1) · ถึงโกดังจีน(2) · กำลังส่งมาไทย(3) · ถึงไทย(4) · รอชำระเงิน(5) · เตรียมส่ง(6) · กำลังจัดส่ง(6.x) · ส่งแล้ว(7). Driven by `fStatus`. (Pacred adds '40 ถึงโกดังจีน' on the SHOP-order hstatus axis — different table.)
- Inline-editable (each its own POST to update.php, name `update_<field>`): `fUserID`, `fPallet`(location), `fCrate`(ตีลัง), `fPayMethod`(ต้น/ปลายทาง), `fShipBy`(47-carrier dropdown), `addressID`, `fTrackingCHN`, `fTransportType`, `fCabinetNumber`, `fDateToThai`(ปิดตู้), `fAmountCount`(รวมกล่อง), `fCover`(image), `fNote`/`fNoteUser`.
- **"การเก็บเงินค่าขนส่งในไทย : ต้นทาง"** = fPayMethod (1=ต้นทาง,2=ปลายทาง COD) — ties to ภูม's payMethod-by-carrier + the upcountry-COD rule.
- **รายการสินค้า table** (the SELL breakdown shown to staff/customer): เรทนำเข้า(fRefRate) · ค่านำเข้าจีน-ไทย(fTotalPrice) · ค่าสินค้าเพิ่ม/ลด · ค่าตีลัง · ค่าขนส่งจีน+ · ค่าขนส่งไทย · ค่าบริการ · ค่าอื่นๆ · ส่วนลด · **ราคารวม** (the customer total, red).

### ★ The customRate / customComparison block = the SELL-rate input (THE rate-summary mechanism)
The "กรอกรายละเอียดสินค้า" edit form carries the EXACT mechanism the owner's "ดึงเรทราคามาสรุป" task wants:
- **`customRate` checkbox "คิดราคาแบบกำหนดเอง"** → reveals **`customRateKG`** (เรทคิดตามน้ำหนัก) + **`customRateCBM`** (เรทคิดตามปริมาตร). = the per-order manual SELL-rate override when the profile/general rate is missing or needs a one-off. (Pacred: `tb_forwarder.customrate/customratekg/customratecbm`, applied in resolve-rate.ts as `manualOverride` — never doc-tier-discounted.)
- **`customComparison` checkbox "คิดค่าเทียบแบบกำหนดเอง"** → **`userComparisonValue`** (ค่าเทียบ, the 1คิว=N kg threshold, e.g. 150). = the per-order ค่าเทียบ override.
- **`calPrice.php`** (AJAX `calPriceKG()`) recomputes live as you type — it takes fWarehouseChina, fProductsType, fWeight, fVolume, fTransportPrice, fDiscount, customRateSwitch+customRateKG/CBM, customComparisonSwitch+userComparisonValue, fAmount, fAmountCount, … → returns the priced breakdown into `#dataPrice`. "ประเภทสมาชิก : ทั่วไป **คิดตามราคาสูง**" = the max(CBM,KG) rule.
- Save buttons: "บันทึกข้อมูลไม่เปลี่ยนสถานะ" (`update_data`) vs the status-change save. The red note: to edit the rate you set status=ถึงไทยแล้ว and save THIS form (not the top status form).

**This confirms the Pacred rate-summary feature I shipped (`06d0b59a`) is faithful**: the customer-profile rate-editor (SVIP `tb_rate_custom` + the new ค่าเทียบ tab via adminSetUserComparison) = the persisted rate; the forwarder inline fallback (rateMissing badge + customRate override) = exactly this legacy customRate/customComparison block. Item #2 ("ลืมตั้ง → กรอก ขาย/กิโล/ค่าเทียบ → บันทึก → สรุป → ช่องบนอัปเดต") IS legacy's customRate+customComparison → calPrice → ราคารวม.

---

## How this maps to the Pacred build
1. **รายงานตู้ (next body of work item 2 — courier + full money detail):** build the per-container roll-up reading the live `tb_forwarder` group by `fCabinetNumber`; cost from `tb_cost_container` (or its Pacred twin) × CBM; the 26 columns above; the 2 profit numbers; the cost-rate modal; status/dup filters; per-role cost-visibility (the 2026-06-15 cost-gate — staff don't see ต้นทุน/กำไร/P:/S: columns). The courier piece = column 16/17 (Flash/J&T/Thai Post auto-rate for กทม/ปริมณฑล; เหมา=0 outside) + FX auto on cost.
2. **rate-summary (shipped):** customer-profile rate (tb_rate_custom + ค่าเทียบ) + forwarder inline fallback (customRate/customComparison) → resolve-rate → top totals. Faithful ✓.
3. **MOMO arrival → collect:** the fStatus axis (col 23) + the cnt-pay axis (col 24) are the two states the MOMO fix advances; the cost-by-CBM (col 21) is why the ฿0 fix matters (cost = CBM×2500 needs non-zero CBM).
4. **Cost = CBM × cost-rate ALWAYS** (MOMO charges per คิว) while SELL = max(CBM-rate, KG-rate via ค่าเทียบ) — the spread is the profit. This is the single most load-bearing money fact of the cargo line; the doc-tier ฿800 discount only touches the SELL CBM rate, never the cost.
