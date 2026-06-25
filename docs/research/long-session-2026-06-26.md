# Long session 2026-06-26 (เดฟ) — backlog lanes: 4 shipped + 2 money-doc lanes audited/deferred

Owner: "ลุยต่อไปยาวๆจนครบจบเลย · long session". Worked the actionable backlog lanes; each gated (tsc/verify/build 0) + pushed all 4 branches.

## ✅ Shipped this session
| lane | commit | what |
|---|---|---|
| MOMO cost-pay link | `73c651c2` | wire /invoice-cost → /report-cnt จ่ายเงินตู้ (the full flow already existed; linked the 2 pages) |
| CUSTTAG รายการ | `8df954c0` | shared `<CustomerTypeTag>` → customer list + forwarders order-list (💳 เครดิต Nวัน pill) + header DRY |
| YUAN cost-editable | `af41b1d2` | `<YuanCostEditor>` — edit real yuan cost at ANY status (cost-editable, sell-locked) · server re-derives paythbcost/profit |
| HIST | `0515dbbd` | `/admin/accounting/document-history` — unified ประวัติออกเอกสาร (ใบเสร็จ+บิล+ใบกำกับ · tabs/search/date-range/print) |
| status-sync PR018 | `d858ae50` | `<MarkArrivedChinaButton>` — 1-click manual "ถึงโกดังจีน" (4→40) on a stuck shop order |
| PPAY dynamic QR | `50bc7862` | re-enabled dynamic amount-PromptPay QR (tax-ID 0105564077716) · FLAG-GATED `PROMPTPAY_DYNAMIC_ENABLED` (default static) · 16-assert decode test proves EMVCo correctness w/o a scan · 🔴 owner flips flag after 1 real scan |
| CUSTTAG service-orders | `b6fc25b1` | credit pill on the ฝากสั่งซื้อ list too (symmetric w/ forwarders) — CUSTTAG now on header + customer list + both order lists |

## 🟡 Audited + DEFERRED (money-doc A4-layout · need LIVE render to fix safely)

Both lanes are the SAME root: the receipt A4 print layout. Blind layout edits to a money-doc risk breaking the print (ห้ามทำงานบัค) → fix on the work computer where a 14+ row receipt can be rendered + measured.

### RCPT — ใบเสร็จ 4 หน้า/ของล่างตก (pagination)
- Page-chunking CODE is CORRECT: `service-import/receipts/print/page.tsx` L717-731 + `lib/receipt/load-receipt-document.ts:450` both `ROWS_PER_PAGE=13`, iterate all pages, isLast flag.
- **ROOT (strong hypothesis):** [components/receipt/receipt-paper.tsx:367](../../components/receipt/receipt-paper.tsx) — the items area is a FIXED `height: "182px"` with `overflow: "visible"`. 13 rows taller than 182px spill out of the box → collide with the summary / fall off the page = "ของล่างตก". Also L690 notes a removed "หน้า X/N footer strip" that pushed content past the page.
- **FIX (with repro):** render a receipt with 14+ rows; measure the per-row height; either (a) lower ROWS_PER_PAGE to what fits 182px, OR (b) make `.detail` flex-grow (not fixed 182px) so rows + summary page-break cleanly (`break-inside: avoid` on rows). Verify last page's summary doesn't overlap.

### DOC — footer ครบ-ละเอียดเท่า PCS
- Our receipt is largely faithful already: meta-box shows เลขที่เอกสาร + วันที่ออก + อ้างอิง; rows show per-tracking amount; footer has รวมค่าส่งเหมาๆ (PRF) + จำนวนเงินทั้งสิ้น + WHT line + จำนวนเงินที่ชำระ + tax-id. Has pageNumber/pageCount data.
- Legacy `create-f-receipt.php` FOLDS components (fTransportPrice/fPriceUpdate/fShippingService/fTransportPriceCHNTHB/priceCrate/priceOther − fDiscount) into EACH row's single "ค่าขนส่ง/Amount" — it does NOT itemize Delivery CHN/TH/Other/Discount as separate footer lines either. So our receipt is close to parity.
- Minor nits (defer w/ render): (1) meta-box "อ้างอิง" shows `{rid}` (same as เลขที่) — should reference the order-no; (2) the "หน้า X/N" page label isn't displayed (removed for the overflow) — re-add once the L367 height fix lands.

## Notes
- WHT 1% double-deduct: already fixed by the parallel session (`3e529b42` · option 1 · prod 0 invoices affected). No action.
- NEXT FREE migration = 0213.
