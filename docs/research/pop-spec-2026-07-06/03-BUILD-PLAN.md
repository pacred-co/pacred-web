# Foundation-first BUILD QUEUE — พี่ป๊อป spec (audit 2026-07-06 · workflow-grounded)

**Verdict: platform ~80% at spec-foundation.** `lib/admin/forwarder-status.ts` fstatus maps 1:1 to the 6 statuses (3=กำลังส่งมาไทย · 4=ถึงไทยแล้ว · 5=รอชำระเงิน · 6=เตรียมส่ง · 7=ส่งแล้ว). ขาด/ครบ = `lib/warehouse/container-completeness.ts`. Handheld scan auto→'4' (`actions/admin/barcode-import.ts`). billing-run = 2-round slip + WHT-1% + dup-check. Permission gate `lib/auth/check-fstatus-transition.ts` (warehouse can't touch billing). Customer slip-attach holds at "ส่งสลิปแล้ว·รอตรวจ" (fstatus 5) until accounting flips 5→6. **NEXT-FREE mig = 0241.**

## FOUNDATION QUEUE (ordered)
| # | title | area | change | files | size | safe-now | deps |
|---|---|---|---|---|---|---|---|
| 1 | status label+color ↔ 6-status naming | status | verify FSTATUS_CFG labels/colors vs owner table · derive `ขาด` sub-status from completeness (no new col) | forwarder-status.ts · cnt-list-table.tsx | S | ⚠️ (color needs owner) | — |
| 2 | ขาด sub-status pill on report-cnt | warehouse | render ชมพู "ขาด N กล่อง"/ขาว "ครบ" from completenessByCab (data already passed) | cnt-list-table.tsx · report-cnt/[fNo] | S | ✅ | #1 |
| 3 | TH-shipping-cost REQUIRED gate before วางบิล | wh+acct | block/flag rows w/ no TH cost · amber "ยังไม่กรอกค่าส่งไทย" | billing-run.ts · billing-run-add-client.tsx | M | ✅ | — |
| 4 | "แจ้งส่งต่องานบัญชี" handoff btn + wh cost-hide audit | warehouse | status-only handoff flag/notify (NOT fstatus flip) · audit money-visibility masks cost/profit on wh surfaces | new action · report-cnt/[fNo] · money-visibility.ts | M | ✅ | #2 |
| 5 | accounting consolidation (bulk-billing area) | accounting | checked-containers→combined preview→batch issue · cross-cabinet select tray | billing-run-add-client.tsx · billing-run.ts | L | ✅ money-review | #3 |
| 6 | slip-review "3-step" UI formalize | accounting | order the 3 steps (round1→bill-no→dup-check→ออกใบเสร็จ) on billing-run/[id] (backend done) | billing-run/[id]/billing-run-actions.tsx | M | ✅ | — |
| 7 | Picking List ≠ Delivery Note split | driver | 2 templates: บิลหาสินค้า (assembly · by product/loc) vs บิลจัดส่ง (driver · address-sorted) | new drivers/[id]/picking-list route + print | M | ✅ | — |
| 8 | China receive-bill = ถึงโกดังจีนแล้ว | china | printable ออกบิลรับสินค้า (PR#/transport/box/sender/sign/photo) from forwarder+MOMO | new route under api-forwarder-momo/ | M | ✅ | — |

## ENHANCEMENTS (after foundation)
real-time delivery monitor (driver photo/phone · live) · address-sticker route-order · CS pay-on-behalf modal (forwarder path) · container status-ladder จีน↔ไทย + กระสอบรวม · MOMO round-tabs (คร่าวๆ/packing/ปิดตู้) + XLSX upload merge · accounting doc-forms tower step-2 (ใบประเมิน/เสนอ/ส่งสินค้า/ตามหัก + auto WHT-cert on partner-pay · 0239 AP is the seam).

## 🔴 OWNER-INPUT (don't guess)
- **สี status 4:** amber (current) vs brown "น้ำตาล" · exact ขาด-pink shade
- **ค่าส่งไทย:** auto-warehouse vs CS-manual default + which zones auto
- **Consolidation:** current=1 บิล/ลูกค้า · owner "หลายรายการพร้อมกัน" = multi-container/customer or cross-customer batch?
- **Partner จ่าย docs:** defer to พี่แนท (blocked)
- **WHT/dup edge:** coded per legacy · confirm no new juristic threshold

## build order for the 7h run
Start SAFE + independent: **#6 (3-step slip UI) · #7 (Picking≠Delivery) · #8 (China receive-bill)** (parallel-safe · different areas). Then **#2→#4** (warehouse · sequential · #1 color flagged to owner). Then **#3** (TH-cost gate). **#5** last (money-review). Owner-input items flagged, built with safe defaults where possible.
