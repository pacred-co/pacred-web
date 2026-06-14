# Forwarder / cargo faithful-port fidelity audit — 2026-06-14

> **Source:** owner drip-fed 22 legacy PCS-admin screens (forwarder-centric + shop4 + payment + rate-vip/general + warehouse-scan + MOMO-API + report-cnt + the `forwarder-action` sub-commands) and said: *"เราว่าครบแล้วนะหลักๆทั้งหมดนี่ … ทำให้ platform เราสมบูรณ์ที่สุด ดึงมาให้ได้ทั้งหมดก่อน แล้วพัฒนาต่อ"* (pull EVERYTHING first, then develop).
>
> **Method:** a 9-cluster source-grounded workflow (`forwarder-fidelity-audit-2026-06-14`) — each agent read the legacy PHP as SOT (§0b · the rendered HTML is one mode of N), grep-confirmed against the dropped HTML dumps, cross-checked the Pacred route+action for the right LIVE `tb_*` table (§0e) + reachability (§0d). 211 gap rows across 9 clusters.

## Verdict — ~80% faithful, surgical gap-set (NOT done)

The read/display layer of all 22 screens is genuinely faithful + money-table-correct + reachable (forwarder list/detail/status-tabs, shop4, yuan-payment list/approve/refund, all 3 rate cards, warehouse-scan USB+camera, report-cnt + cnt-hs ledgers). The MOMO commit money-loop is live (61 real `tb_forwarder` rows landed). What's left is concentrated + high-stakes: 3 money-safety bugs, 2 §0e dead-reads on daily warehouse tools, 1 missing money-OUT writer + the cnt-hs paid-container cost editor, and 3 entirely-missing partner carriers (JMF/GOGO/TTP) the owner wants.

Held DOWN from a naive "95% of features exist" because a dead-read or a money-TOCTOU on a money path is a fidelity FAIL, not a near-miss — and 3 carriers are 0%.

## Build waves (ordered)

| Wave | scope | sev | migration | owner-gated | status |
|---|---|---|---|---|---|
| **1** | In-code money-safety: 2 TOCTOU + 2 dead-reads + nav drift | P0 | no | no | **✅ SHIPPED `d6f466b4`** (momo-lcl dead-read DEFERRED — needs prod probe) |
| **2** | Money-correctness display + capture (yuan-approve cost, badge counts) | P1 | no | no (owner OK'd legacy default) | **✅ SHIPPED `88214472`** — yuan cost single+bulk + real error-queue badges + FREE_SHIPPING_ZIPS shared lib. **WHT-1% col = FALSE-POSITIVE** (legacy detail items table has NO WHT — confirmed via the dropped dump + forwarder.php; WHT applied at payment). notPortage **filter** → folded into W3 (same surface as the writer). |
| **3** | Missing in-code writers | P0 | no | no | **MOSTLY SHIPPED** — ✅ `9c2c0bf7` notPortage combine-shipping writer + multi-select UI + faithful filter (W3.1) · ✅ `4847222d` shop print-flag hPrintBill/2 (W3.2) · ✅ `ea6ad0a7` manual carrier dedup + auto-price (W3.3; manualUpdate edit = covered by /forwarders/[id] edit). **TODO:** per-fStatus tab strip (W3.4 · P1 nav). |
| **4** | cnt-hs/report-cnt cost-correction | P0 | no | no | **✅ SHIPPED `7b8e6172`** — paid-container cost editor on cnt-hs/[id] (`adminUpdatePaidContainerCost` · no paid-lock · cnt-scoped · money-isolated to fcosttotalprice) + financial summary (ยอดเบิก/ต้นทุน/ส่วนต่าง). report-cnt paid-lock no longer dead-ends. Deferred: cntFile PDF replace (Wave-13 cosmetic) · fProfit* recompute (flag 4 — confirm derive-at-read first). |
| **5** | DB UNIQUE constraints (create-side double-pay): `tb_cnt_item."fCabinetNumber"` · `tb_user_sales.idf` · `tb_user_sales_pay.idus` · `tb_forwarder_tran_th_sub.fid` | P0 | yes (0183) | approved | **✅ SHIPPED `24ef4f0a` · APPLIED PROD+DEV (4/4)** — 4 partial-UNIQUE indexes. Prod clean (0 rows); dev had 1 dup (cabinet LEOU2022222) → deduped before reconcile. Code follow-up: ON CONFLICT/23505 graceful handling on create-paths (non-blocking · UX). |
| **6** | Missing partner carriers JMF / TTP / GOGO | P1 | no | partly (creds) | **✅ SHIPPED `5a4bbfee`** (parallel agent) — JMF hub + read-only Auto-API history viewer (live `tb_forwarder_jmf_tmp`) · TTP read-only viewer (no local table — was always a cargothai.tech proxy · bannered) · GOGO retire-banner → MOMO (decommissioned, importer NOT ported). 3 sidebar siblings + i18n parity. Live API pull bannered as pending creds. |
| **7** | Low-severity parity polish | P2/P3 | no | no | TODO |

### Owner decisions (2026-06-14, all approved — "อนุญาต อนุมัติ ทุกอย่าง")
- **GOGO carrier = decommissioned** ("ไม่ได้ใช้ละ ใช้ momo") → W6 banners GOGO as retired, no importer.
- **yuan-approve cost = legacy default** (`tb_settings.hRateCostDefault`) "แล้วค่อยพัฒนาต่อ". ✅ done in W2a.
- **migration 0183 = approved** → W5 may run the prod dup-precheck + add the UNIQUE constraints (dup-precheck is the gate).
- **Standing mantra (ฝังหัวไว้): legacy-first, then develop — applies to EVERYTHING.**

## Money risks (the 11 — fix before trusting each surface)

1. **MOMO commit double-INSERT TOCTOU** — `lib/admin/commit-momo-row-core.ts`. ✅ FIXED Wave 1 (atomic claim before INSERT).
2. **Forwarder credit double-debt TOCTOU** — `actions/admin/forwarders-field-edits.ts`. ✅ FIXED Wave 1 (`.in("fstatus",[1..5])` fold).
3. **Yuan-approve profit miss** — ✅ FIXED Wave 2a (`88214472`): both `adminUpdateYuanPayment` (single) + `adminBulkApproveYuanPaymentsTb` (bulk) now default `payRateCost` from `tb_settings.hRateCostDefault` and compute `paythbcost`/`payprofitthb` before the flip.
4. **Bulk-tracking-search DEAD-READ** — `actions/admin/bulk-tracking-search.ts`. ✅ FIXED Wave 1 (repointed to `tb_forwarder`/`tb_forwarder_item`).
5. **MOMO-LCL sack DEAD-READ** — `momo-lcl.ts:114/121` reads `tb_tmp_forwarder_item_momo`. ⚠️ DEFERRED — it faithfully reads the same legacy tmp table `check-tracks.php` reads; the "repoint to momo_import_tracks" claim needs a **prod probe** (confirm tmp table is empty + the data really lives in `momo_import_tracks`/`momo_sack_infos`) before touching a working faithful port.
6. **notPortage combine-shipping writer** — ✅ SHIPPED Wave 3.1 (`9c2c0bf7`): `adminCombineForwarderTransport` with the legacy dup-guard precheck + orphan-header rollback. ftransportprice is an absolute SET (not additive). **Still queue a DB UNIQUE on `tb_forwarder_tran_th_sub.fid` in W5/0183** as the concurrent backstop.
7. **cnt-pay CREATE-side double-pay** — no UNIQUE on `tb_cnt_item.fcabinetnumber`. (Wave 5 · owner-gated migration 0183.)
8. **Delivery-complete commission accrual idempotency UNVERIFIED** — `tb_user_sales.idf` UNIQUE (Wave 5 · verify one row per fid).
9. **Juristic WHT-1% column on forwarder DETAIL items table** — ❌ FALSE POSITIVE (verified 2026-06-14): the dropped `forwarder:detail:3880` dump has ZERO WHT markers + legacy `forwarder.php` has no `price1Per`/`*0.01` on the items/update table. The legacy detail items table shows GROSS (ราคารวม); the juristic WHT-1% is applied downstream at payment/receipt, NOT on this table. `forwarder-import-items-table.tsx` is faithful as-is. The audit agent conflated it with the `/edit` FreightBreakdownTable. No change.
10. **Manual MOMO/CN INSERT** — ✅ FIXED Wave 3.3 (`ea6ad0a7`): pre-INSERT dedup guard on fIDorCO + post-INSERT best-effort `computeAndFillForwarderImportRate` (no more ฿0 unpriced orders / fat-finger duplicates).
11. **customRate/resetCustomRate** leave `fProfit*`/`fCompany1Per` stale. (Wave 4 — or confirm derive-at-read.)

## Owner flags

1. **Wave-5 migration (0183)** — approve a prod dup-precheck + merge/keep policy BEFORE adding UNIQUE on `tb_cnt_item.fcabinetnumber` / `tb_user_sales.idf` / `tb_user_sales_pay.idus` (a pre-existing dup makes the migration fail). Carryover from the 2026-06-14 disbursement audit.
2. **GOGO + JMF carrier creds/endpoints** (carryover) — JMF view+history buildable read-only now from `tb_forwarder_jmf_tmp`; live Auto-API pull + GOGO Google-Sheet ingest need creds. Confirm GOGO is still live vs decommissioned before porting its money-writer.
3. **Yuan-payment approve cost source** — confirm `payRateCost` defaults from `tb_settings.hRateCostDefault` at approval (legacy behaviour) so the margin-capture fix can be wired; and whether admin-created yuan rows keep the legacy 2-step (pending→approve-with-cost) or stay pre-confirmed.
4. **fProfit* container columns** — confirm whether `fProfitTransportCHN`/`fProfitPriceUpdate`/`fProfitTotal`/`fCompany1Per` are still read by any report (PEAK rollup?) — if derived-at-read everywhere, skip rewriting them.
5. **moveStatusTo99 fTransportPriceSum pre-filter** — confirm whether the legacy "only un-combined rows" guard is load-bearing or a legacy quirk that can be dropped.
6. **Orphan `acc-payment.php` port** (`/admin/accounting/payment`) — faithful 1:1 but zero inbound nav (§0d orphan); a near-equivalent `/admin/reports/yuan-profit` is reachable. Decide: add to a menubar or retire.

## Full P0/P1 gap detail

(See the workflow result for all 211 rows; the P0/P1 set is the actionable subset above + below.)

- **[P0] MOMO commit double-INSERT TOCTOU** — ✅ Wave 1.
- **[P1] Forwarder credit double-debt TOCTOU** — ✅ Wave 1.
- **[P1] Yuan-approve no payRateCost/profit** — Wave 2.
- **[P0] Bulk-tracking-search dead-read** — ✅ Wave 1.
- **[P0] MOMO-LCL sack dead-read** — DEFERRED (prod probe).
- **[P0] notPortage combine-shipping writer missing** — Wave 3.
- **[P0] cnt-hs paid-container cost editor missing (report-cnt paid-lock dead-ends)** — Wave 4.
- **[P0] cnt-pay create-side double-pay (no UNIQUE)** — Wave 5 (owner).
- **[P1] Delivery commission accrual idempotency unverified** — Wave 5 (owner).
- **[P1] Shop-order print-flag write never built (hPrintBill/2)** — Wave 3.
- **[P1] TopMenuReport badge counts hardcoded 0** — Wave 2.
- **[P1] Sidebar 'เตรียมส่ง' nav drift ?q=6** — ✅ Wave 1 (+ warehouse intake ?q=1).
- **[P1] Per-fStatus tab strip missing on tb_forwarder queues** — Wave 3.
- **[P1] notPortage queue filter over-broad** — Wave 2/3.
- **[P1] Juristic WHT-1% column dropped on forwarder detail** — Wave 2.
- **[P1] JMF / GOGO carriers entirely missing · CN partial** — Wave 6 (owner creds).
- **[P1] Manual MOMO/CN INSERT no dedup + ฿0** — Wave 3.
- **[P1] manualUpdate UPDATE branch missing** — Wave 3.
- **[P1] addOrder mPDF invoice + email not ported** — Wave 7.
- **[P1] cnt-hs financial summary + cntFile PDF missing** — Wave 4.
- **[P1] customRate/resetCustomRate stale fProfit*** — Wave 4 (or confirm derive-at-read · flag 4).
- **[P1] calcForwarderOutstanding no regression test** — Wave 7.
