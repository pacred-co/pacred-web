# ภูม prep spec — Admin reports + closing (P0-20 / P0-21) · 2026-05-31

> READ-ONLY audit by เดฟ-auditor lane. ภูม owns the `.ts`/`.tsx` edits.
> Sources: legacy PHP at `…/pcsc/public_html/member/pcs-admin/` + live Pacred code (read-only).
> Owner rule honored: where a legacy line/file was not found, it is marked **⚠️ NOT FOUND** — never guessed.
>
> ⚠️ This file was authored by the parent (เดฟ) from the audit agent's full output — the agent itself was blocked from writing `.md` by a transient harness guard. Content is verbatim from the agent.

## 0. CRITICAL CONTEXT — P0-20 + P0-21 ARE ALREADY SHIPPED (the task premise is STALE)

The gap-audit framing ("5 reports dead-read REBUILT empty tables → ฿0") was **true on 2026-05-29 but is no longer the live state.**

| Commit | What it did | File |
|---|---|---|
| `ffd5a142` | `fix(P0-20): rewrite all 5 admin profit reports from REBUILT (empty) -> legacy tb_*` | `actions/admin/reports.ts` |
| `00abfafb` | `fix(P0-21): closing report pivots to tb_receipt (key off rdate, split by corporatetype)` | `app/[locale]/(admin)/admin/accounting/closing/page.tsx` |

- **There is NO `actions/admin/reports-tb.ts` twin.** All 5 pages import directly from `@/actions/admin/reports`. The single `reports.ts` was rewritten in-place. No dead-twin to delete.
- A contract test exists: `actions/admin/reports-tb.test.ts` (429 lines, `tsx`-run). It asserts table-name + filter + date-col + aggregation **against hardcoded fixtures — NOT a live DB**. It will NOT catch the gaps below.

**The remaining work is 4 real gaps:**
1. 🔴 **REACHABILITY (P0 · AGENTS.md §0d):** all 5 profit/report pages are ORPHANS — zero inbound links from the reports hub or accounting menubar. They render data now but nobody can click to them.
2. 🟠 **`vat7` column half-fixed wrong in BOTH directions:** data layer zeroes it on all 3 profit pages, but (a) the pages still RENDER the column showing "—", and (b) shops-profit legacy actually DID show VAT7 — so dropping it there is a regression, while keeping it on forwarder/yuan is the invented-column violation.
3. 🟠 **Daily-profit graph orphaned:** `getForwarderProfitDailySeries` + `getYuanProfitDailySeries` exist + are tested but **no page imports them** — the legacy echarts line-graph was dropped and never re-wired.
4. 🟠 **sales-monthly profit formula + source-table divergence:** Pacred reads `tb_forwarder.fdate` directly with revenue = `ftotalprice` only; legacy reads `tb_sales_report` keyed off `srDate` with revenue = `fTotalPrice + fTransportPrice + fPriceUpdate`. Numbers will not match accounting's legacy report.

## Summary table

| Report | Legacy file | Table read NOW | Correct tb_* table | Profit formula (legacy) | Live state | Effort |
|---|---|---|---|---|---|---|
| Forwarder profit | `report-forwarder-profit.php` (445) | `tb_forwarder` ✅ | `tb_forwarder` | `(fTotalPrice−fDiscount)−fCostTotalPrice` OR `fProfitTotal` | ✅ data · 🟠 vat7 col · 🟠 graph orphan · 🔴 unreachable | S |
| Shops profit | `report-shops-profit.php` (484) | `tb_header_order` ✅ | `tb_header_order` | `(hTotalPriceCHN+hShippingCHN)*hRate − hRateCost*hCostAll` | ✅ table · 🟠 formula (stored vs recompute) · 🟠 vat7 DROPPED but legacy HAS it · 🔴 unreachable | M |
| Yuan profit | `report-payments-profit.php` (400) | `tb_payment` ✅ | `tb_payment` | `payTHB − payTHBCost` OR `payProfitTHB` | ✅ data · 🟠 vat7 col (legacy has none) · 🟠 graph orphan · 🔴 unreachable | S |
| Sales monthly | `report-sale.php` (356) | `tb_forwarder`+`tb_users` | `tb_sales_report`+`tb_forwarder`+`tb_admin` | revenue `ΣfTotalPrice+ΣfTransportPrice+ΣfPriceUpdate` · comm `×0.01` | 🟠 wrong source + missing 2 revenue cols + wrong date key + rep source · 🔴 unreachable | M |
| OTP success | `report-otp-success.php` (241) | `tb_users_otp` ✅ | `tb_users_otp`+`tb_users` | n/a (count list) | ✅ data · ⚠️ legacy has NO date filter + NO purpose col (Pacred added both) · 🔴 unreachable | S |
| Closing | `closingAccReportForwarder.php` (28) → `…/closingAccReportForwarder/home.php` (524) | `tb_receipt` ✅ | `tb_receipt`+`tb_users` | n/a (revenue bucket by `rdate`) | ✅ table + date-key · 🟠 juristic split key diverges · ✅ reachable | S |

> **Schema sanity (all verified in `supabase/migrations/0081_pcs_legacy_schema.sql`):**
> `tb_forwarder` / `tb_header_order` / `tb_payment` / `tb_users_otp` / `tb_sales_report` / `tb_receipt` = **lowercase** columns (NOT renamed by 0113).
> `tb_users` / `tb_admin` = **camelCase** post-0113 (`userID`, `userName`, `userLastName`, `userTel`, `userCompany`, `adminIDSale`, `adminID`, `adminName`, `adminLastName`). Both `adminIDSale` (0113 L19) and `userCompany` (0113 L27) confirmed renamed.

## 1. Forwarder profit — `report-forwarder-profit.php`

### Legacy SQL
**Table query (L153–182):** `tb_forwarder AS f LEFT JOIN tb_wallet_hs AS wh ON f.ID=wh.refOrder`.
- Default (L176–181): `WHERE (DATE(fDate) BETWEEN '$start' AND '$end') ORDER BY fDate DESC` — every row, no status filter.
- `fStatus='5plus'` (L158–171): date keyed on **`DATE(date)`** (wallet_hs payment date, NOT `fDate`) AND `fStatus>5`.
- specific status (L172–174): `AND fStatus='$x'`.

**Profit accumulators (L227–230):**
```
$pricePCSAllCHN  += fCostTotalPrice;             // cost (china shipping)
$priceUserAllCHN += fTotalPrice - fDiscount;     // sale  (china shipping)
$fPriceUpdatePCSAll  += fProfitPriceUpdate;      // profit on +/- payment adj
$fPriceUpdateUserAll += fPriceUpdate;            // sale on +/- payment adj
```
**3-section footer (L259–274):** ค่าขนส่งจีน (sale `priceUserAllCHN`, profit `priceUserAllCHN − pricePCSAllCHN`) · ค่าชำระเงินเพิ่มลด (profit `fPriceUpdatePCSAll`) · กำไรทั้งหมด (grand total).
**Graph (L77–96):** `SELECT (SELECT ROUND(SUM(fProfitTotal),2) FROM tb_forwarder WHERE fStatus=7 AND DATE(fDate)='$day') …` — daily realised profit, **fStatus=7 only**.
**Per-row cols (L233–246):** date · `fDetail` · `fTrackingCHN` · `fVolume`(5dp) · `fWeight`(2dp) · `fCostTotalPrice` · `fTotalPrice` · `fPriceUpdate` · `fShippingService` · `fProfitTransportCHN` · `fProfitPriceUpdate` · `fProfitTotal` · status · `adminIDUpdate`.
**Role gate (L27):** `CEO | Manager | QAAndQC | Accounting | ITDT`.

### Current Pacred — `actions/admin/reports.ts` L236–348 + `…/reports/forwarder-profit/page.tsx`
- Reads `tb_forwarder` ✅ lowercase ✅. Customer join via `tb_users.userID` IN-batch ✅.
- Date keyed on `fdate` for BOTH default + 5plus (reports.ts L250–251). **⚠️ Divergence:** legacy keys 5plus off `DATE(date)` (wallet_hs). Niche.
- Row profit (L319–323): `fprofittotal !== 0 ? fprofittotal : (sale − discount − cost)`. ✅
- **🟠 vat7 (reports.ts L336):** `vat7: 0` — invented. Legacy has **NO VAT cell**. Page still renders the column (`forwarder-profit/page.tsx` L73,L87,L95) → "—". Half-fix.
- **🟠 Daily graph orphaned:** `getForwarderProfitDailySeries` (reports.ts L364–405) correct (`fstatus='7'`, day buckets) but page never imports it (verified: zero non-test importers).
- **🟠 Footer reduced to 1 number** (page `totalProfit = Σ profit`) vs legacy 3-section split. Defensible under §0a (since `fprofittotal`='กำไรสุทธิ') but flag.

### The fix
| Item | Action |
|---|---|
| vat7 column | **REMOVE** from `forwarder-profit/page.tsx` (L73,L87,L95) + drop `vat7` from `ForwarderProfitRow` (reports.ts L215, L336). |
| Daily graph | **WIRE** `getForwarderProfitDailySeries(range)` into page — OR delete the orphan if owner declines graph. |
| 3-section footer | OPTIONAL: add via `fprofittransportchn`+`fprofitpriceupdate` (in schema, not yet selected). |
| 5plus date key | OPTIONAL/low-pri: key off payment date when `fiveplus`. |

### Test assertion (NEW DB test — `tsx --env-file=.env.local`)
```
getForwarderProfitReport({from:'2020-01-01', to:'2027-12-31'}) → res.ok
  && res.data.length > 0                       // prod has ~21,950 tb_forwarder rows
  && res.data.some(r => r.sale_total > 0)
  && res.data.reduce((s,r)=>s+r.profit,0) > 0
```

### Reachability
🔴 **ORPHAN.** No `<Link href="/admin/reports/forwarder-profit">` anywhere (grep-verified). Hub links to a DIFFERENT page `/admin/reports/forwarder`. **Fix:** add hub card → `/admin/reports/forwarder-profit` ("กำไรฝากนำเข้า"), ≤3 clicks.

## 2. Shops profit — `report-shops-profit.php`

### Legacy SQL
**Table query (L158–185):** `tb_header_order AS ho LEFT JOIN tb_wallet_hs AS wh ON ho.hNo=wh.refOrder`.
- Default (L182–185): `WHERE (DATE(hDate) BETWEEN '$start' AND '$end')`.
- POST filter (L161–178): always adds `AND wh.status='2'` (paid); `2plus` → `AND hStatus>2 AND hStatus<6 AND wh.status='2'`; specific → `AND hStatus='$x' AND wh.status='2'`.

**Profit formula (L226–232 — load-bearing):**
```
if (hCostAll != 0) {                                          // ONLY rows with cost entered
  priceUser = round_up((hTotalPriceCHN + hShippingCHN) * hRate, 2);  // SALE
  pricePCS  = round_up(hRateCost * hCostAll, 2);                     // COST
  profit    = priceUser - pricePCS;
}  // else: row shows "รอคำนวณ" and is EXCLUDED from totals
```
**VAT7 IS SHOWN HERE** (L255 per-row `profit*0.07`; L277 total; header L206). **The one report where VAT7 is genuinely legacy.**
**Graph (L79–85):** `SUM(hTotalPriceUser)−SUM(hCostAllTH) WHERE hStatus=5 AND DATE(hDate)='$day'` — daily profit, **hStatus=5 only**. ⚠️ Graph uses STORED cols; the TABLE recomputes from CNY×rate.
**Role gate (L28):** same 5 departments.

### Current Pacred — `reports.ts` L444–525 + `…/reports/shops-profit/page.tsx`
- Reads `tb_header_order` ✅. Filter `.neq("hstatus","6")` (exclude cancelled). **⚠️ Looser than legacy** (legacy requires `wh.status='2'` paid). Over-counts unpaid.
- **🟠 Profit uses STORED cols** (reports.ts L500–502): `sale=htotalpriceuser`, `cost=hcostallth`. Legacy TABLE RECOMPUTES `(hTotalPriceCHN+hShippingCHN)*hRate` and `hRateCost*hCostAll`. Equal only if stored cols written at same rate. All 4 cols exist (`htotalpricechn`,`hshippingchn`,`hrate`,`hratecost`,`hcostall`).
- **`hcostall != 0` gate MISSING:** legacy shows "รอคำนวณ" + EXCLUDES un-costed rows from totals.
- **🟠 vat7 WRONGLY DROPPED:** reports.ts L513 `vat7: 0`; page renders col (L70,L82,L90) → "—". **Legacy SHOWS VAT7 here.** Fidelity regression.

### The fix — field-map + math
| Pacred (`reports.ts`) | Legacy | Fix |
|---|---|---|
| `htotalpriceuser` (sale) | `(hTotalPriceCHN+hShippingCHN)*hRate` | RECOMPUTE from `htotalpricechn`,`hshippingchn`,`hrate` — confirm canonical w/ owner |
| `hcostallth` (cost) | `hRateCost*hCostAll` | RECOMPUTE from `hratecost`,`hcostall`; gate `hcostall != 0` (else "รอคำนวณ", exclude from totals) |
| `service_fee = sale−cost` | `priceUser−pricePCS` | ✅ shape correct |
| `vat7: 0` | `profit * 0.07` | **REVERT** — `vat7 = service_fee * 0.07` (THIS report only) |
| `.neq("hstatus","6")` | `wh.status='2'` (+optional hStatus) | decide paid-gate vs design-latitude pipeline |

> `round_up(x,2)` = round-half-UP to 2dp. JS `Math.round` differs on .5 ties — use a half-up impl to match legacy penny-for-penny.

### Test assertion
```
getShopsProfitReport({from:'2020-01-01', to:'2027-12-31'}) → res.ok && res.data.length > 0
  && res.data.some(r => r.cost_thb > 0 && r.service_fee !== 0)
  // after VAT fix: res.data.some(r => r.vat7 > 0)
```

### Reachability
🔴 **ORPHAN.** Hub links to `/admin/reports/shop` (different) + `/admin/reports/shops-profit-pay` (commission payout, different). No link to `/admin/reports/shops-profit`. **Fix:** add hub card → `/admin/reports/shops-profit`.

## 3. Yuan profit — `report-payments-profit.php`

### Legacy SQL
**Table query (L151–166):** `tb_payment AS p LEFT JOIN tb_users AS u ON u.userID=p.userID`.
- Default (L164–166): `WHERE (DATE(payDate) BETWEEN '$start' AND '$end') ORDER BY p.payDate DESC`. ⚠️ Default mode does NOT select `payTHBCost` (L164); only POST-filtered mode does (L151).
- With status (L158–159): `AND payStatus='$x'`.

**Profit accumulators (L201–202):** `$pricePCSAll += payTHBCost` · `$priceUserAll += payTHB` · footer profit (L228) = `priceUserAll − pricePCSAll`. **⚠️ NO per-row precomputed `payProfitTHB` in the TABLE** — footer is `Σ payTHB − Σ payTHBCost`. (`payProfitTHB` used only in GRAPH L80.)
**Graph (L77–83):** `SUM(payProfitTHB) WHERE payStatus=2 AND DATE(payDate)='$day'` — daily profit, **payStatus=2 only**.
**Per-row cols (L174–211):** time · ID(→`payment/update/$ID`) · `payDetail`(50) · `payType` badge · **−`payTHB`** (negative red) · `payStatus` badge · `adminIDUpdate`. **No VAT column.**
**Role gate (L27):** same 5 departments.

### Current Pacred — `reports.ts` L563–650 + `…/reports/yuan-profit/page.tsx`
- Reads `tb_payment` ✅ lowercase ✅. Filter `.eq("paystatus","2")`. **⚠️ Divergence:** legacy default TABLE lists ALL statuses (filter opt-in); Pacred hard-codes approved-only. For a profit report, approved-only is arguably correct (legacy graph also uses payStatus=2). Likely keep — flag deliberate.
- Profit (L625–626): `payprofitthb !== 0 ? payprofitthb : (paythb − paythbcost)`. ✅
- **🟠 vat7 (L638):** `vat7: 0` — invented. Legacy has **NO VAT column**. Page renders it (L80,L94,L103) → "—". **Fix:** REMOVE.
- **🟠 Daily graph orphaned:** `getYuanProfitDailySeries` (reports.ts L655–695) correct but no page importer (verified).

### The fix
| Item | Action |
|---|---|
| vat7 column | **REMOVE** from `yuan-profit/page.tsx` (L80,L94,L103) + drop `vat7` from `YuanProfitRow` (reports.ts L549, L638). |
| Daily graph | **WIRE** `getYuanProfitDailySeries(range)` into page, OR delete it. |
| status filter | confirm approved-only (`paystatus='2'`) is intended. |

### Test assertion
```
getYuanProfitReport({from:'2020-01-01', to:'2027-12-31'}) → res.ok && res.data.length > 0
  && res.data.every(r => r.status === 'completed')   // paystatus='2'
  && res.data.reduce((s,r)=>s+r.sale_thb,0) > 0
```

### Reachability
🔴 **ORPHAN.** No inbound link. Hub links to `/admin/reports/payment` (different). **Fix:** add hub card → `/admin/reports/yuan-profit`.

## 4. Sales monthly (ยอดพนักงานขาย) — `report-sale.php`

### Legacy SQL — THE BIGGEST DIVERGENCE
**Built ON `tb_sales_report`, a denormalized snapshot table — NOT a live `tb_forwarder` scan.**

**Step A — backfill on page load (L7–34):** for every `tb_forwarder` where `fStatus=7 AND fDateStatus7>='2022-02-01'` not already in `tb_sales_report`, INSERT `(srDate=fDateStatus7, fID=f.ID, srAdminIDSale=adminIDSale)`. So `tb_sales_report` accrues one row per delivered forwarder, snapshotting the rep AT DELIVERY + the delivery date.

**Step B — list query (L112–128):**
```
SELECT YEAR(srDate), MONTH(srDate), COUNT(sr.ID), a.adminName, a.adminLastName, a.adminID,
       SUM(f.fWeight), SUM(f.fVolume),
       SUM(fTotalPrice)+SUM(fTransportPrice)+SUM(fPriceUpdate) AS price    -- REVENUE (3 cols)
FROM tb_sales_report AS sr
LEFT JOIN tb_admin     AS a ON a.adminID=sr.srAdminIDSale
LEFT JOIN tb_forwarder AS f ON f.ID=sr.fID
WHERE f.fStatus=7
GROUP BY MONTH(srDate), sr.srAdminIDSale ORDER BY sr.ID DESC
```
- Revenue = `ΣfTotalPrice + ΣfTransportPrice + ΣfPriceUpdate` (three cols).
- Commission = `price × 0.01` (1%, L142).
- Date key = `srDate` (= `fDateStatus7`), bucketed `MONTH(srDate)`.
- Rep dimension = `tb_sales_report.srAdminIDSale` (snapshot at delivery) → `tb_admin` for name.
- `SaleCargo` dept sees only own (L125–126).
**Detail mode (`?page=detail`, L192+):** same join, one `(year,month,adminID)`, per-order list.
**Role gate (L3):** same 5 departments (+ SaleCargo self-view).

### Current Pacred — `reports.ts` L98–188 + `…/reports/sales-monthly/page.tsx`
- Reads `tb_forwarder` directly, filter `.in("fstatus",["6","7"])`, date keyed on `fdate` (created), rep from `tb_users.adminIDSale` (customer's CURRENT rep). Revenue = `ftotalprice` only (L171). Commission `× 0.01` ✅.

**Divergences (numbers WILL differ from legacy):**
1. **🟠 Revenue undercounts** — missing `ftransportprice` + `fpriceupdate`.
2. **🟠 Date key wrong** — `fdate` (created) vs legacy `srDate`/`fdatestatus7` (delivered).
3. **🟠 Rep source wrong** — `tb_users.adminIDSale` (current) vs `tb_sales_report.srAdminIDSale` (snapshot). Mis-attributes if reps reassigned.
4. **🟠 Status gate** — `IN('6','7')` includes out-for-delivery; legacy strict `fStatus=7`.
5. **Rep name** — Pacred shows raw `adminIDSale`; legacy joins `tb_admin` for `adminName adminLastName [adminID]`.

### The fix
**Option A (faithful — recommended):** rebuild on `tb_sales_report` (cols `id, srdate, fid, sradminidsale`) JOIN `tb_forwarder` (on `fid=id`, `fstatus='7'`) JOIN `tb_admin` (on `adminID=sradminidsale`, camelCase). Revenue `Σftotalprice+Σftransportprice+Σfpriceupdate`; bucket `MONTH(srdate)`; commission `×0.01`.
- **⚠️ DEPENDENCY:** legacy backfill (Step A) populates `tb_sales_report`. Pacred has NO equivalent → table may be **0 rows on prod**. Sub-options: (a) port the backfill as a server action/cron snapshotting `fStatus=7` forwarders; (b) read-time fallback to live `tb_forwarder fstatus='7'` keyed on `fdatestatus7`. Confirm w/ owner (Open Q #4). `tb_sales_report` EXISTS (0081 L4411).

**Option B (minimal — if `tb_sales_report` stays unused):** keep live scan, fix the 4 bugs: revenue → `ftotalprice+ftransportprice+fpriceupdate`; date key → `fdatestatus7`; status → `fstatus='7'`; rep name → join `tb_admin` on `adminID=adminIDSale`.

### Test assertion
```
getSalesMonthlyReport({from:'2022-01-01', to:'2027-12-31'}) → res.ok && res.data.length > 0
  && res.data.some(r => r.revenue_thb > 0 && r.commission_thb === r.revenue_thb * 0.01)
```
> ⚠️ Pre-check `SELECT count(*) FROM tb_sales_report;` — if empty + Option A w/o backfill → 0 rows.

### Reachability
🔴 **ORPHAN.** Hub links to `/admin/reports/sales-by-rep` (different). No link to `/admin/reports/sales-monthly`. **Fix:** add hub card → `/admin/reports/sales-monthly` ("ยอดพนักงานขาย").

## 5. OTP success (ยืนยัน OTP แล้ว) — `report-otp-success.php`

### Legacy SQL
**Single query (L63–66), NO filtering:**
```
SELECT date, userTel, userName, u.userLastName, u.userID
FROM tb_users_otp AS uo LEFT JOIN tb_users AS u ON u.userID=uo.userID
-- $sql_date is "" (L61) — declared, never set
```
- **⚠️ NO date range filter** — `$sql_date=""` never populated. Daterangepicker JS is wired (L155–185) but PHP ignores it → lists EVERY OTP row ever (DataTables paginates client-side, default 200/page).
- **No purpose/type column** — `tb_users_otp` has only `id, userid, date` (0081 L6056). Every row = one successful verification.
**Columns (L95–113):** date · `userID`(→profile) · `userTel` · `userName` · `userLastName`.
**Role gate:** ⚠️ **NOT FOUND** — `report-otp-success.php` has NO `$departmentKey` gate (unlike profit reports). Access via pcs-admin login only.

### Current Pacred — `reports.ts` L728–830 + `…/reports/otp-success/page.tsx`
- Reads `tb_users_otp` ✅ (`id, userid, date` ✅) JOIN `tb_users.userID` for tel + name ✅. **Core faithful.**
- **🟠 ADDS a date-range filter** (L737–738) — legacy has NONE. Pacred addition.
- **🟠 INVENTS a `purpose` column** (L773–822) via best-effort `tb_users_otp_hs.type` join — legacy has no purpose column. Pacred-original, harmless, not faithful.

### The fix
- Data layer FAITHFUL on core (table + join). No repoint needed.
- **Decisions only (no money risk):** (a) keep added date filter? (recommend keep + default wide/"all"). (b) keep invented `purpose` col? (recommend keep but label "Pacred-added", OR drop for strict 1:1).
- **ADD a page-level role gate** (legacy had none; don't ship ungated admin report).

### Test assertion
```
getOtpSuccessReport({from:'2020-01-01', to:'2027-12-31'}) → res.ok && res.data.length > 0
  && res.data.every(r => r.member_code && r.date)
```

### Reachability
🔴 **ORPHAN.** No inbound link found anywhere. **Fix:** add hub card → `/admin/reports/otp-success` ("ยืนยัน OTP แล้ว").

## 6. P0-21 — Month-end closing — `closingAccReportForwarder.php` → `…/closingAccReportForwarder/home.php`

### Legacy SQL
`closingAccReportForwarder.php` (28 lines) = 3-mode dispatcher (`detail`/`add`/default). Only **default** is live → `include/pages/closingAccReportForwarder/home.php` (524 lines). The `detail`/`add` modes reference `tb_name` (placeholder) + `…/closingAccReportForwarder/{detail,add}.php` which **⚠️ DO NOT EXIST** on disk (only `home.php` present). Dead scaffolds — ignore.

**home.php main query (L154–173):**
```
SELECT r.rID, rDate, r.userID, u.userName, u.userLastName,
       corporateNumber, corporateName, corporateAddress, userCompany,
       statusPrint, ..., rStatus, rAmount, totalBeforeWithholding
FROM tb_receipt AS r
LEFT JOIN tb_receipt_item AS ri ON r.rID=ri.rID
LEFT JOIN tb_users         AS u ON u.userID=r.userID
LEFT JOIN tb_corporate     AS c ON u.userID=c.userID
WHERE 1 {$actionDate} {$actionQ}
GROUP BY rID
```
**Date key (L135–153):** `AND DATE(rDate) BETWEEN '$start' AND '$end'` — buckets issued receipts by **`rDate`** (issue/approval date). Default = current month. ✅ Pacred already does this.
**Juristic split (L126–134) — THE divergence:** legacy splits on **`tb_users.userCompany`** (`?q=c` → `userCompany=1`; `?q=g` → `userCompany<>1`). Tab counts L175–176: `WHERE userCompany='1'` vs `<>'1'`.
**No `rStatus` filter** in legacy main query (`WHERE 1 + date + company`). Receipts default `rStatus='3'` (0081).
**Columns (L262–347):** ID · เลขที่ใบเสร็จ(`rID`→printReceipt) · `rDate` · `userID` · ลูกค้า(`corporateName` if company else `userName userLastName`) · `totalBeforeWithholding` · `rAmount` · order-# list (`tb_receipt_item.fID`) · สถานะพิมพ์ · **พิมพ์ใบเสร็จ button** (→`printReceipt.php?id=`).
**Role gate:** dispatcher L3 gates `CEO|Manager|QAAndQC|Accounting|ITDT`.

### Current Pacred — `…/accounting/closing/page.tsx` (commit `00abfafb`)
- Reads `tb_receipt` ✅, keyed on **`rdate`** ✅ (month picker) — **date-key fix correct & matches legacy.**
- **🟠 Adds `.eq("rstatus","3")`** (page L105) — legacy does NOT filter rStatus. Likely fine, but stricter. Flag.
- **🟠 Juristic split key DIVERGES:** Pacred splits on **`tb_receipt.corporatetype`** (`'1'`, page L64) — legacy splits on **`tb_users.userCompany`** (`=1`). Different columns/tables. `corporatetype`=receipt snapshot; `userCompany`=customer's current flag. Usually agree, but diverge if the flag changed after issue. **Decide:** match legacy (`userCompany` from the already-IN-batched `tb_users` map) OR keep `corporatetype` (snapshot — arguably more correct for a historical close). Confirm w/ owner (Open Q #6).
- Company name: Pacred uses `recompname` (receipt snapshot, L71); legacy uses `tb_corporate.corporateName` (live). Snapshot more correct for historical close. ✅
- Pacred adds WHT split + CSV — design-latitude enhancements. ✅
- **Dropped vs legacy:** order-# list (`tb_receipt_item.fID`), print-status column, and the **printReceipt button** (accounting prints from this screen).

### The fix
| Item | Action |
|---|---|
| Juristic split | DECIDE: `corporatetype` (snapshot, current) vs `userCompany` (legacy live flag). To match legacy → switch `isJuristicReceipt` (page L64) to read `userCompany` from `userMap`. Confirm w/ owner. |
| rStatus filter | confirm `.eq("rstatus","3")` is intended (legacy has none). |
| Print button | **RE-ADD** a per-row "พิมพ์ใบเสร็จ" link → the Pacred receipt-print route (verify the route exists). |
| Order-# list | OPTIONAL: add `tb_receipt_item.fID` references per row. |

### Test assertion
```
admin.from('tb_receipt').select('rid,rdate,ramount,totalbeforewithholding,corporatetype,userid')
  .eq('rstatus','3').gte('rdate','2024-01-01').lte('rdate','2027-12-31T23:59:59')
  → data.length > 0 && data.some(r => r.ramount > 0)
```

### Reachability
✅ **REACHABLE** — `/admin/accounting/page.tsx` L652 links `href="/admin/accounting/closing"`. Sidebar → บัญชี → ปิดงบรายเดือน. (Only one of the six already wired.)

## 7. Consolidated work checklist for ภูม
**Files ภูม will touch** (เดฟ-auditor does NOT touch these — ภูม is mid-edit):
- `actions/admin/reports.ts` — drop `vat7` from forwarder + yuan row types; REVERT vat7 to `service_fee*0.07` for shops ONLY; fix shops profit math (recompute + `hcostall!=0` gate); fix sales-monthly (revenue 3-col sum + date key `fdatestatus7` + status `'7'` + rep from `tb_sales_report`/`tb_admin`); decide fate of the 2 daily-series fns.
- 5 report pages under `app/[locale]/(admin)/admin/reports/{forwarder-profit,shops-profit,yuan-profit,sales-monthly,otp-success}/page.tsx` — remove/keep vat7 column accordingly; wire daily graph (or remove); rep-name display; OTP role gate.
- `app/[locale]/(admin)/admin/reports/page.tsx` — **ADD 5 hub cards/links** (the P0 reachability item).
- `app/[locale]/(admin)/admin/accounting/closing/page.tsx` — juristic-split decision; re-add print button.
- `actions/admin/reports-tb.test.ts` — UPDATE: the vat7-always-0 assertion (§F) becomes wrong for shops once VAT restored; add a real DB smoke (gated on `.env.local`) asserting `>0` rows per report.

**Priority order:** (1) 🔴 reachability — 5 hub links. (2) 🟠 sales-monthly revenue+date+rep. (3) 🟠 shops vat7 restore + profit math. (4) 🟠 vat7 removal forwarder+yuan. (5) 🟠 daily graphs. (6) closing juristic-split + print button.

## 8. Open questions for owner / ภูม
1. **Daily-profit echarts graph** — built+tested but unwired. Want it back (legacy had it on forwarder + yuan + shops)? If yes → wire all 3 (shops graph fn not yet written: `SUM(htotalpriceuser)−SUM(hcostallth) WHERE hstatus=5 GROUP BY day`). If no → delete the 2 orphaned fns.
2. **VAT7 placement** — confirm VAT7 belongs on shops-profit ONLY (forwarder + yuan show no VAT). Current code zeroes everywhere — wrong for shops.
3. **Shops profit: stored vs recomputed** — which is canonical for accounting? (Recommend recompute to match legacy table.)
4. **sales-monthly source** — is `tb_sales_report` populated on prod or empty? (`SELECT count(*) FROM tb_sales_report;`) If empty → (a) port backfill cron, or (b) compute live keyed on `fdatestatus7`?
5. **sales-rep attribution** — commission to rep AT DELIVERY (legacy `srAdminIDSale` snapshot) or customer's CURRENT rep (`tb_users.adminIDSale`)?
6. **Closing juristic split** — bucket by `tb_receipt.corporatetype` (snapshot) or `tb_users.userCompany` (legacy live flag)?
7. **OTP report** — keep the Pacred-added date filter + invented `purpose` column, or strip to legacy's "list-everything, no purpose" shape?
